-- Existencias de la bodega, por lote. Un lote es lo que entró en una recepción, con su proveedor
-- y su costo; el stock de un producto es lo que queda en sus lotes (puede ser 0 sin perder la
-- ficha del producto). Los movimientos son el historial: no se editan ni se borran.

create table public.stock_lots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  item_id uuid not null,
  supplier_id uuid,
  unit_cost_cents bigint check (unit_cost_cents >= 0 and unit_cost_cents <= 10000000000),
  received_qty numeric(12, 2) not null check (received_qty > 0),
  remaining_qty numeric(12, 2) not null check (remaining_qty >= 0),
  kind text not null check (kind in ('compra', 'ajuste')),
  note text check (char_length(note) <= 300),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  check (remaining_qty <= received_qty),
  unique (id, organization_id),
  foreign key (item_id, organization_id) references public.items (id, organization_id),
  foreign key (supplier_id, organization_id)
    references public.suppliers (id, organization_id) on delete set null (supplier_id)
);
create index stock_lots_item_idx on public.stock_lots (item_id, created_at);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  lot_id uuid not null,
  item_id uuid not null,
  quantity numeric(12, 2) not null check (quantity <> 0),
  kind text not null check (kind in ('entrada', 'ajuste', 'reserva', 'liberacion')),
  contract_item_id uuid,
  note text check (char_length(note) <= 300),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  foreign key (lot_id, organization_id) references public.stock_lots (id, organization_id)
);
create index stock_movements_lot_idx on public.stock_movements (lot_id, created_at);

-- Solo lectura desde la API: las escrituras pasan por las funciones de abajo, que validan rol y
-- mantienen lotes y movimientos de acuerdo.
alter table public.stock_lots enable row level security;
alter table public.stock_movements enable row level security;
create policy "stock_lots: miembros leen" on public.stock_lots
  for select to authenticated using (public.is_member(organization_id));
create policy "stock_movements: miembros leen" on public.stock_movements
  for select to authenticated using (public.is_member(organization_id));

-- Existencias por producto (suma de lo que queda en sus lotes).
create view public.item_stock with (security_invoker = true) as
select item_id, organization_id, sum(remaining_qty) as on_hand
from public.stock_lots
group by item_id, organization_id;

-- Entrada manual: crea un lote (proveedor y costo opcionales) y su movimiento.
create function public.stock_add(
  p_item_id uuid,
  p_supplier_id uuid,
  p_unit_cost_cents bigint,
  p_qty numeric,
  p_note text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_lot uuid;
begin
  select i.organization_id into v_org from public.items i where i.id = p_item_id;
  if v_org is null or not public.has_role(v_org, array['admin', 'operator']::public.org_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_qty is null or p_qty <= 0 then
    raise exception 'bad_quantity' using errcode = '22023';
  end if;
  if p_supplier_id is not null and not exists (
    select 1 from public.suppliers s where s.id = p_supplier_id and s.organization_id = v_org
  ) then
    raise exception 'bad_supplier' using errcode = '22023';
  end if;

  insert into public.stock_lots
    (organization_id, item_id, supplier_id, unit_cost_cents, received_qty, remaining_qty, kind, note)
  values
    (v_org, p_item_id, p_supplier_id, p_unit_cost_cents, p_qty, p_qty, 'ajuste', nullif(trim(p_note), ''))
  returning id into v_lot;

  insert into public.stock_movements (organization_id, lot_id, item_id, quantity, kind, note)
  values (v_org, v_lot, p_item_id, p_qty, 'entrada', nullif(trim(p_note), ''));
  return v_lot;
end;
$$;

-- Ajuste de un lote: suma o resta unidades. No puede dejarlo en negativo.
create function public.stock_adjust(p_lot_id uuid, p_delta numeric, p_note text)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lot public.stock_lots;
  v_remaining numeric;
begin
  select * into v_lot from public.stock_lots where id = p_lot_id for update;
  if v_lot.id is null or not public.has_role(v_lot.organization_id, array['admin', 'operator']::public.org_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_delta is null or p_delta = 0 then
    raise exception 'bad_quantity' using errcode = '22023';
  end if;

  v_remaining := v_lot.remaining_qty + p_delta;
  if v_remaining < 0 then
    raise exception 'insufficient' using errcode = 'P0001';
  end if;

  -- Sumar unidades corrige también lo recibido, para que lo que queda nunca supere lo que entró.
  update public.stock_lots
  set remaining_qty = v_remaining,
      received_qty = case when p_delta > 0 then received_qty + p_delta else received_qty end
  where id = p_lot_id;

  insert into public.stock_movements (organization_id, lot_id, item_id, quantity, kind, note)
  values (v_lot.organization_id, p_lot_id, v_lot.item_id, p_delta, 'ajuste', nullif(trim(p_note), ''));
  return v_remaining;
end;
$$;

revoke execute on function public.stock_add(uuid, uuid, bigint, numeric, text) from public, anon;
revoke execute on function public.stock_adjust(uuid, numeric, text) from public, anon;
grant execute on function public.stock_add(uuid, uuid, bigint, numeric, text) to authenticated;
grant execute on function public.stock_adjust(uuid, numeric, text) to authenticated;
