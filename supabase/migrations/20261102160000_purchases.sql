-- Abastecimiento, etapa 3: compras. Una factura de proveedor es de UN contrato; cada línea de la
-- factura se asigna (en todo o en parte) a líneas de la lista de referencia, y lo que no se asigna
-- queda como sobrante para la bodega cuando se reciba (etapa 4).

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  contract_id uuid not null,
  supplier_id uuid not null,
  number text not null check (char_length(trim(number)) between 1 and 60),
  purchased_on date not null,
  notes text check (char_length(notes) <= 500),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (contract_id, organization_id)
    references public.contracts (id, organization_id) on delete cascade,
  foreign key (supplier_id, organization_id) references public.suppliers (id, organization_id)
);
-- El mismo proveedor no repite el número de factura dentro de un contrato.
create unique index purchases_number_idx on public.purchases (contract_id, supplier_id, lower(number));

create table public.purchase_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  purchase_id uuid not null references public.purchases (id) on delete cascade,
  item_id uuid not null,
  quantity numeric(12, 2) not null check (quantity > 0),
  unit_cost_cents bigint not null check (unit_cost_cents >= 0 and unit_cost_cents <= 10000000000),
  vat_rate numeric(5, 2) not null default 15 check (vat_rate >= 0 and vat_rate <= 100),
  received_qty numeric(12, 2) not null default 0 check (received_qty >= 0),
  check (received_qty <= quantity),
  foreign key (item_id, organization_id) references public.items (id, organization_id)
);
create index purchase_lines_purchase_idx on public.purchase_lines (purchase_id);
create index purchase_lines_item_idx on public.purchase_lines (item_id);

alter table public.purchases enable row level security;
alter table public.purchase_lines enable row level security;
create policy "purchases: miembros leen" on public.purchases
  for select to authenticated using (public.is_member(organization_id));
create policy "purchase_lines: miembros leen" on public.purchase_lines
  for select to authenticated using (public.is_member(organization_id));

-- Los tramos de una línea del contrato ahora pueden ser una reserva de bodega o una compra por recibir.
alter table public.supply_sources alter column lot_id drop not null;
alter table public.supply_sources add column purchase_line_id uuid references public.purchase_lines (id);
alter table public.supply_sources drop constraint supply_sources_kind_check;
alter table public.supply_sources add check (kind in ('bodega', 'compra'));
alter table public.supply_sources add check (
  (kind = 'bodega' and lot_id is not null and purchase_line_id is null)
  or (kind = 'compra' and purchase_line_id is not null and lot_id is null)
);
create index supply_sources_purchase_line_idx on public.supply_sources (purchase_line_id);

-- Reservar de la bodega: la cobertura de la línea cuenta también lo ya comprado.
create or replace function public.supply_reserve(p_line_id uuid, p_lot_id uuid, p_qty numeric, p_note text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line public.contract_items;
  v_status public.contract_status;
  v_lot public.stock_lots;
  v_covered numeric;
  v_id uuid;
begin
  select * into v_line from public.contract_items where id = p_line_id for update;
  if v_line.id is null or not public.has_role(v_line.organization_id, array['admin', 'operator']::public.org_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select status into v_status from public.contracts where id = v_line.contract_id;
  if v_status <> 'in_progress' then
    raise exception 'not_in_progress' using errcode = 'P0001';
  end if;
  if p_qty is null or p_qty <= 0 then
    raise exception 'bad_quantity' using errcode = '22023';
  end if;

  select * into v_lot from public.stock_lots where id = p_lot_id for update;
  if v_lot.id is null or v_lot.organization_id <> v_line.organization_id then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_lot.remaining_qty < p_qty then
    raise exception 'insufficient' using errcode = 'P0001';
  end if;

  select coalesce(sum(quantity), 0) into v_covered from public.supply_sources where contract_item_id = p_line_id;
  if v_covered + p_qty > v_line.quantity then
    raise exception 'over_covered' using errcode = 'P0001';
  end if;

  update public.stock_lots set remaining_qty = remaining_qty - p_qty where id = p_lot_id;
  insert into public.stock_movements (organization_id, lot_id, item_id, quantity, kind, contract_item_id, note)
  values (v_lot.organization_id, p_lot_id, v_lot.item_id, -p_qty, 'reserva', p_line_id, nullif(trim(p_note), ''));
  insert into public.supply_sources
    (organization_id, contract_item_id, item_id, lot_id, quantity, unit_cost_cents, supplier_id, kind, note)
  values
    (v_lot.organization_id, p_line_id, v_lot.item_id, p_lot_id, p_qty, v_lot.unit_cost_cents, v_lot.supplier_id,
     'bodega', nullif(trim(p_note), ''))
  returning id into v_id;
  return v_id;
end;
$$;

-- Quitar un tramo: una reserva devuelve las unidades al lote; una compra solo deja de estar asignada.
create or replace function public.supply_release(p_source_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_src public.supply_sources;
  v_status public.contract_status;
  v_reserved numeric;
  v_delivered numeric;
begin
  select * into v_src from public.supply_sources where id = p_source_id for update;
  if v_src.id is null or not public.has_role(v_src.organization_id, array['admin', 'operator']::public.org_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select c.status into v_status
  from public.contract_items ci join public.contracts c on c.id = ci.contract_id
  where ci.id = v_src.contract_item_id;
  if v_status <> 'in_progress' then
    raise exception 'not_in_progress' using errcode = 'P0001';
  end if;

  if v_src.kind = 'bodega' then
    select coalesce(sum(quantity), 0) into v_reserved
    from public.supply_sources where contract_item_id = v_src.contract_item_id and kind = 'bodega';
    select coalesce(sum(quantity), 0) into v_delivered
    from public.delivery_lines where contract_item_id = v_src.contract_item_id;
    if v_reserved - v_src.quantity < v_delivered then
      raise exception 'already_delivered' using errcode = 'P0001';
    end if;

    update public.stock_lots set remaining_qty = remaining_qty + v_src.quantity where id = v_src.lot_id;
    insert into public.stock_movements (organization_id, lot_id, item_id, quantity, kind, contract_item_id, note)
    values (v_src.organization_id, v_src.lot_id, v_src.item_id, v_src.quantity, 'liberacion',
            v_src.contract_item_id, nullif(trim(p_note), ''));
  end if;
  delete from public.supply_sources where id = p_source_id;
end;
$$;

-- Al borrar una línea del contrato, solo las reservas de bodega devuelven unidades.
create or replace function public.supply_release_on_line_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.supply_sources;
begin
  for s in select * from public.supply_sources where contract_item_id = old.id and kind = 'bodega' loop
    update public.stock_lots set remaining_qty = remaining_qty + s.quantity where id = s.lot_id;
    insert into public.stock_movements (organization_id, lot_id, item_id, quantity, kind, note)
    values (s.organization_id, s.lot_id, s.item_id, s.quantity, 'liberacion', 'La línea del contrato se eliminó');
  end loop;
  return old;
end;
$$;

-- Entregable = lo que está en bodega reservado (no lo que solo está comprado) menos lo ya entregado.
create or replace function public.delivery_create(
  p_contract_id uuid,
  p_list_id uuid,
  p_date date,
  p_received_by text,
  p_notes text,
  p_lines jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contract public.contracts;
  v_number integer;
  v_id uuid;
  v_elem jsonb;
  v_line public.contract_items;
  v_qty numeric;
  v_reserved numeric;
  v_delivered numeric;
  v_seen uuid[] := '{}';
begin
  select * into v_contract from public.contracts where id = p_contract_id for update;
  if v_contract.id is null or not public.has_role(v_contract.organization_id, array['admin', 'operator']::public.org_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_contract.status <> 'in_progress' then
    raise exception 'not_in_progress' using errcode = 'P0001';
  end if;
  if p_date is null then
    raise exception 'bad_date' using errcode = '22023';
  end if;
  if not exists (select 1 from public.contract_lists where id = p_list_id and contract_id = p_contract_id) then
    raise exception 'list_not_found' using errcode = 'P0002';
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) not between 1 and 1000 then
    raise exception 'nothing_to_deliver' using errcode = '22023';
  end if;

  select coalesce(max(number), 0) + 1 into v_number from public.deliveries where contract_id = p_contract_id;
  insert into public.deliveries (organization_id, contract_id, list_id, number, delivered_on, received_by, notes)
  values (v_contract.organization_id, p_contract_id, p_list_id, v_number, p_date,
          nullif(trim(p_received_by), ''), nullif(trim(p_notes), ''))
  returning id into v_id;

  for v_elem in select * from jsonb_array_elements(p_lines) loop
    v_qty := (v_elem ->> 'quantity')::numeric;
    select * into v_line from public.contract_items
    where id = (v_elem ->> 'line_id')::uuid and list_id = p_list_id for update;
    if v_line.id is null then
      raise exception 'list_not_found' using errcode = 'P0002';
    end if;
    if v_line.id = any (v_seen) then
      raise exception 'duplicate_line' using errcode = '22023';
    end if;
    v_seen := v_seen || v_line.id;
    if v_qty is null or v_qty <= 0 then
      raise exception 'bad_quantity' using errcode = '22023';
    end if;

    select coalesce(sum(quantity), 0) into v_reserved
    from public.supply_sources where contract_item_id = v_line.id and kind = 'bodega';
    select coalesce(sum(quantity), 0) into v_delivered from public.delivery_lines where contract_item_id = v_line.id;
    if v_qty > v_reserved - v_delivered then
      raise exception 'over_deliverable' using errcode = 'P0001';
    end if;

    insert into public.delivery_lines (organization_id, delivery_id, contract_item_id, quantity)
    values (v_contract.organization_id, v_id, v_line.id, v_qty);
  end loop;

  return jsonb_build_object('id', v_id, 'number', v_number);
end;
$$;

-- Estado por línea: ahora también "comprado" (todas las unidades cubiertas, alguna aún por recibir).
create or replace view public.contract_item_supply with (security_invoker = true) as
select
  ci.id, ci.organization_id, ci.contract_id, ci.list_id,
  row_number() over (partition by ci.list_id order by ci.created_at, ci.id) as n,
  ci.part_number, ci.description, ci.quantity, ci.unit, ci.cpc, ci.created_at,
  coalesce(s.reserved, 0) as reserved,
  s.cost_cents,
  case
    when coalesce(d.delivered, 0) >= ci.quantity then 'delivered'
    when coalesce(s.reserved, 0) + coalesce(s.purchased, 0) = 0 then 'pending'
    when coalesce(s.reserved, 0) + coalesce(s.purchased, 0) < ci.quantity then 'partial'
    when s.reserved >= ci.quantity then 'in_stock'
    else 'purchased'
  end as state,
  coalesce(d.delivered, 0) as delivered,
  coalesce(s.purchased, 0) as purchased
from public.contract_items ci
left join lateral (
  select
    sum(ss.quantity) filter (where ss.kind = 'bodega') as reserved,
    sum(ss.quantity) filter (where ss.kind = 'compra') as purchased,
    case when count(*) filter (where ss.unit_cost_cents is null) = 0
      then round(sum(ss.quantity * ss.unit_cost_cents) / sum(ss.quantity)) end as cost_cents
  from public.supply_sources ss
  where ss.contract_item_id = ci.id
) s on true
left join lateral (
  select sum(dl.quantity) as delivered from public.delivery_lines dl where dl.contract_item_id = ci.id
) d on true;

-- La cantidad pedida no puede quedar por debajo de lo ya cubierto (reservas y compras).
-- (la función ya suma todos los tramos; no cambia)

-- Crear una factura con sus líneas y, opcionalmente, asignar cada línea a una línea del contrato.
-- p_lines: [{"item_id", "quantity", "unit_cost_cents", "vat_rate", "contract_item_id"?, "assign_qty"?}]
create function public.purchase_create(
  p_contract_id uuid,
  p_supplier_id uuid,
  p_number text,
  p_date date,
  p_notes text,
  p_lines jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contract public.contracts;
  v_id uuid;
  v_elem jsonb;
  v_pl uuid;
  v_qty numeric;
  v_assign numeric;
  v_line public.contract_items;
  v_covered numeric;
  v_cost bigint;
  v_item uuid;
begin
  select * into v_contract from public.contracts where id = p_contract_id for update;
  if v_contract.id is null or not public.has_role(v_contract.organization_id, array['admin', 'operator']::public.org_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_contract.status <> 'in_progress' then
    raise exception 'not_in_progress' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.suppliers where id = p_supplier_id and organization_id = v_contract.organization_id) then
    raise exception 'bad_supplier' using errcode = '22023';
  end if;
  if p_number is null or char_length(trim(p_number)) = 0 or p_date is null then
    raise exception 'bad_invoice' using errcode = '22023';
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) not between 1 and 300 then
    raise exception 'no_lines' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.purchases
    where contract_id = p_contract_id and supplier_id = p_supplier_id and lower(number) = lower(trim(p_number))
  ) then
    raise exception 'duplicate_invoice' using errcode = 'P0001';
  end if;

  insert into public.purchases (organization_id, contract_id, supplier_id, number, purchased_on, notes)
  values (v_contract.organization_id, p_contract_id, p_supplier_id, trim(p_number), p_date, nullif(trim(p_notes), ''))
  returning id into v_id;

  for v_elem in select * from jsonb_array_elements(p_lines) loop
    v_item := (v_elem ->> 'item_id')::uuid;
    v_qty := (v_elem ->> 'quantity')::numeric;
    v_cost := (v_elem ->> 'unit_cost_cents')::bigint;
    if v_qty is null or v_qty <= 0 or v_cost is null or v_cost < 0 then
      raise exception 'bad_quantity' using errcode = '22023';
    end if;
    if not exists (select 1 from public.items where id = v_item and organization_id = v_contract.organization_id) then
      raise exception 'bad_item' using errcode = '22023';
    end if;

    insert into public.purchase_lines (organization_id, purchase_id, item_id, quantity, unit_cost_cents, vat_rate)
    values (v_contract.organization_id, v_id, v_item, v_qty, v_cost, coalesce((v_elem ->> 'vat_rate')::numeric, 15))
    returning id into v_pl;

    if v_elem ->> 'contract_item_id' is not null then
      v_assign := coalesce((v_elem ->> 'assign_qty')::numeric, v_qty);
      if v_assign <= 0 or v_assign > v_qty then
        raise exception 'over_assigned' using errcode = 'P0001';
      end if;
      select * into v_line from public.contract_items
      where id = (v_elem ->> 'contract_item_id')::uuid and contract_id = p_contract_id for update;
      if v_line.id is null then
        raise exception 'line_not_found' using errcode = 'P0002';
      end if;
      select coalesce(sum(quantity), 0) into v_covered from public.supply_sources where contract_item_id = v_line.id;
      if v_covered + v_assign > v_line.quantity then
        raise exception 'over_covered' using errcode = 'P0001';
      end if;
      insert into public.supply_sources
        (organization_id, contract_item_id, item_id, purchase_line_id, quantity, unit_cost_cents, supplier_id, kind)
      values
        (v_contract.organization_id, v_line.id, v_item, v_pl, v_assign, v_cost, p_supplier_id, 'compra');
    end if;
  end loop;
  return v_id;
end;
$$;

-- Asignar (más) unidades de una línea de factura a una línea del contrato.
create function public.purchase_assign(p_purchase_line_id uuid, p_line_id uuid, p_qty numeric)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pl public.purchase_lines;
  v_purchase public.purchases;
  v_status public.contract_status;
  v_line public.contract_items;
  v_assigned numeric;
  v_covered numeric;
  v_id uuid;
begin
  select * into v_pl from public.purchase_lines where id = p_purchase_line_id for update;
  if v_pl.id is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_purchase from public.purchases where id = v_pl.purchase_id;
  if not public.has_role(v_purchase.organization_id, array['admin', 'operator']::public.org_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select status into v_status from public.contracts where id = v_purchase.contract_id;
  if v_status <> 'in_progress' then
    raise exception 'not_in_progress' using errcode = 'P0001';
  end if;
  if p_qty is null or p_qty <= 0 then
    raise exception 'bad_quantity' using errcode = '22023';
  end if;

  select * into v_line from public.contract_items where id = p_line_id for update;
  if v_line.id is null or v_line.contract_id <> v_purchase.contract_id then
    raise exception 'line_not_found' using errcode = 'P0002';
  end if;

  select coalesce(sum(quantity), 0) into v_assigned from public.supply_sources where purchase_line_id = v_pl.id;
  if v_assigned + p_qty > v_pl.quantity then
    raise exception 'over_assigned' using errcode = 'P0001';
  end if;
  select coalesce(sum(quantity), 0) into v_covered from public.supply_sources where contract_item_id = v_line.id;
  if v_covered + p_qty > v_line.quantity then
    raise exception 'over_covered' using errcode = 'P0001';
  end if;

  insert into public.supply_sources
    (organization_id, contract_item_id, item_id, purchase_line_id, quantity, unit_cost_cents, supplier_id, kind)
  values
    (v_purchase.organization_id, v_line.id, v_pl.item_id, v_pl.id, p_qty, v_pl.unit_cost_cents, v_purchase.supplier_id, 'compra')
  returning id into v_id;
  return v_id;
end;
$$;

-- Eliminar una factura que aún no se recibió: se quitan también sus asignaciones.
create function public.purchase_delete(p_purchase_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_purchase public.purchases;
  v_status public.contract_status;
begin
  select * into v_purchase from public.purchases where id = p_purchase_id for update;
  if v_purchase.id is null or not public.has_role(v_purchase.organization_id, array['admin', 'operator']::public.org_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select status into v_status from public.contracts where id = v_purchase.contract_id;
  if v_status <> 'in_progress' then
    raise exception 'not_in_progress' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.purchase_lines where purchase_id = p_purchase_id and received_qty > 0) then
    raise exception 'has_received' using errcode = 'P0001';
  end if;

  delete from public.supply_sources
  where purchase_line_id in (select id from public.purchase_lines where purchase_id = p_purchase_id);
  delete from public.purchases where id = p_purchase_id;
end;
$$;

revoke execute on function public.purchase_create(uuid, uuid, text, date, text, jsonb) from public, anon;
revoke execute on function public.purchase_assign(uuid, uuid, numeric) from public, anon;
revoke execute on function public.purchase_delete(uuid) from public, anon;
grant execute on function public.purchase_create(uuid, uuid, text, date, text, jsonb) to authenticated;
grant execute on function public.purchase_assign(uuid, uuid, numeric) to authenticated;
grant execute on function public.purchase_delete(uuid) to authenticated;

-- La pantalla de Abastecimiento: ahora también con el estado "comprado".
create or replace function public.contract_supply_view(
  p_contract_id uuid,
  p_list_id uuid,
  p_q text,
  p_state text,
  p_offset integer,
  p_limit integer
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_status text;
  v_active uuid;
  v_term text := nullif(trim(coalesce(p_q, '')), '');
  v_pattern text;
  v_state text := nullif(p_state, '');
  v_counts jsonb;
  v_total bigint := 0;
  v_lines jsonb;
  v_deliveries bigint;
begin
  select c.status::text into v_status from public.contracts c where c.id = p_contract_id;
  if v_status is null then
    return null;
  end if;

  select l.id into v_active from public.contract_lists l
  where l.contract_id = p_contract_id and l.id = p_list_id;
  if v_active is null then
    select l.id into v_active from public.contract_lists l
    where l.contract_id = p_contract_id
    order by l.created_at, l.id limit 1;
  end if;

  if v_term is not null then
    v_pattern := '%' || replace(replace(replace(v_term, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  select jsonb_build_object(
    'pending', count(*) filter (where state = 'pending'),
    'partial', count(*) filter (where state = 'partial'),
    'purchased', count(*) filter (where state = 'purchased'),
    'in_stock', count(*) filter (where state = 'in_stock'),
    'delivered', count(*) filter (where state = 'delivered')
  ) into v_counts
  from public.contract_item_supply where list_id = v_active;

  select count(*) into v_total from public.contract_item_supply v
  where v.list_id = v_active
    and (v_state is null or v.state = v_state)
    and (v_pattern is null or v.part_number ilike v_pattern or v.description ilike v_pattern);

  select coalesce(jsonb_agg(to_jsonb(t) order by t.n), '[]'::jsonb) into v_lines
  from (
    select v.id, v.list_id, v.n, v.part_number, v.description, v.quantity, v.unit, v.cpc,
           v.reserved, v.purchased, v.delivered, v.cost_cents, v.state
    from public.contract_item_supply v
    where v.list_id = v_active
      and (v_state is null or v.state = v_state)
      and (v_pattern is null or v.part_number ilike v_pattern or v.description ilike v_pattern)
    order by v.n
    offset greatest(p_offset, 0) limit least(greatest(p_limit, 1), 500)
  ) t;

  select count(*) into v_deliveries from public.deliveries where contract_id = p_contract_id;

  return jsonb_build_object(
    'status', v_status,
    'active_id', v_active,
    'total', v_total,
    'deliveries', v_deliveries,
    'counts', coalesce(v_counts, '{}'::jsonb),
    'lists', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', l.id,
          'asset_id', l.asset_id,
          'name', l.name,
          'count', (select count(*) from public.contract_items ci where ci.list_id = l.id),
          'asset', case when a.id is null then null else jsonb_build_object(
            'kind', a.kind, 'brand', a.brand, 'model', a.model,
            'serial', a.serial, 'engine', a.engine, 'identifier', a.identifier) end
        ) order by l.created_at, l.id)
      from public.contract_lists l
      left join public.assets a on a.id = l.asset_id and a.organization_id = l.organization_id
      where l.contract_id = p_contract_id
    ), '[]'::jsonb),
    'lines', v_lines
  );
end;
$$;

-- Totales de cada factura (mismo redondeo por línea que el resto del sistema: mitad hacia arriba)
-- y cuántas unidades aún no se asignaron a líneas del contrato.
create view public.purchase_totals with (security_invoker = true) as
select
  p.id as purchase_id, p.organization_id, p.contract_id,
  count(pl.id) as lines,
  coalesce(sum(pl.quantity), 0) as units,
  coalesce(sum(a.subtotal), 0)::bigint as subtotal_cents,
  coalesce(sum(a.vat), 0)::bigint as vat_cents,
  coalesce(sum(pl.quantity - coalesce(s.assigned, 0)), 0) as unassigned
from public.purchases p
left join public.purchase_lines pl on pl.purchase_id = p.id
left join lateral (select round(pl.quantity * pl.unit_cost_cents) as subtotal) sub on true
left join lateral (
  select sub.subtotal, round(sub.subtotal * round(pl.vat_rate * 100) / 10000) as vat
) a on true
left join lateral (
  select sum(ss.quantity) as assigned from public.supply_sources ss where ss.purchase_line_id = pl.id
) s on true
group by p.id;
