-- Abastecimiento, etapa 4: recepción. Lo que llega de una factura entra SIEMPRE a la bodega como un
-- lote (con el proveedor y el costo de esa factura); de ahí se reserva a las líneas del contrato a
-- las que se había asignado, y lo que sobra queda como existencia libre.

alter table public.stock_lots add column purchase_line_id uuid references public.purchase_lines (id);
create index stock_lots_purchase_line_idx on public.stock_lots (purchase_line_id);

-- Una reserva de bodega puede venir de una factura (conserva el vínculo para saber a qué se asignó).
do $$
declare
  c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.supply_sources'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%purchase_line_id%'
  loop
    execute format('alter table public.supply_sources drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.supply_sources add constraint supply_sources_shape_check check (
  (kind = 'bodega' and lot_id is not null)
  or (kind = 'compra' and purchase_line_id is not null and lot_id is null)
);

-- Asignar a una línea del contrato solo lo que aún no se recibió: lo recibido ya es existencia y se
-- reserva desde la bodega.
create or replace function public.purchase_assign(p_purchase_line_id uuid, p_line_id uuid, p_qty numeric)
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
  v_pending numeric;
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

  -- Por recibir y todavía sin destino = lo pedido − lo recibido − lo ya asignado como "por recibir".
  select v_pl.quantity - v_pl.received_qty - coalesce(sum(quantity), 0) into v_pending
  from public.supply_sources where purchase_line_id = v_pl.id and kind = 'compra';
  if p_qty > v_pending then
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

-- Recibir unidades de una línea de factura: crea el lote y reserva lo asignado a líneas del contrato.
create function public.purchase_receive(p_purchase_line_id uuid, p_qty numeric)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pl public.purchase_lines;
  v_purchase public.purchases;
  v_status public.contract_status;
  v_lot uuid;
  v_left numeric;
  v_take numeric;
  v_src public.supply_sources;
  v_allocated numeric := 0;
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
  if p_qty > v_pl.quantity - v_pl.received_qty then
    raise exception 'over_received' using errcode = 'P0001';
  end if;

  -- Entra a la bodega, a nombre del proveedor y al costo de la factura.
  insert into public.stock_lots
    (organization_id, item_id, supplier_id, unit_cost_cents, received_qty, remaining_qty, kind, note, purchase_line_id)
  values
    (v_purchase.organization_id, v_pl.item_id, v_purchase.supplier_id, v_pl.unit_cost_cents, p_qty, p_qty,
     'compra', 'Factura ' || v_purchase.number, v_pl.id)
  returning id into v_lot;
  insert into public.stock_movements (organization_id, lot_id, item_id, quantity, kind, note)
  values (v_purchase.organization_id, v_lot, v_pl.item_id, p_qty, 'entrada', 'Factura ' || v_purchase.number);
  update public.purchase_lines set received_qty = received_qty + p_qty where id = v_pl.id;

  -- Lo recibido cubre primero lo asignado a líneas del contrato (en el orden en que se asignó).
  v_left := p_qty;
  for v_src in
    select * from public.supply_sources
    where purchase_line_id = v_pl.id and kind = 'compra'
    order by created_at, id
    for update
  loop
    exit when v_left <= 0;
    v_take := least(v_left, v_src.quantity);

    update public.stock_lots set remaining_qty = remaining_qty - v_take where id = v_lot;
    insert into public.stock_movements (organization_id, lot_id, item_id, quantity, kind, contract_item_id, note)
    values (v_purchase.organization_id, v_lot, v_pl.item_id, -v_take, 'reserva', v_src.contract_item_id,
            'Factura ' || v_purchase.number);
    insert into public.supply_sources
      (organization_id, contract_item_id, item_id, lot_id, purchase_line_id, quantity, unit_cost_cents, supplier_id, kind)
    values
      (v_purchase.organization_id, v_src.contract_item_id, v_pl.item_id, v_lot, v_pl.id, v_take,
       v_pl.unit_cost_cents, v_purchase.supplier_id, 'bodega');

    if v_take = v_src.quantity then
      delete from public.supply_sources where id = v_src.id;
    else
      update public.supply_sources set quantity = quantity - v_take where id = v_src.id;
    end if;
    v_left := v_left - v_take;
    v_allocated := v_allocated + v_take;
  end loop;

  return jsonb_build_object('lot_id', v_lot, 'allocated', v_allocated, 'surplus', p_qty - v_allocated);
end;
$$;

-- Recibir todo lo pendiente de una factura.
create function public.purchase_receive_all(p_purchase_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pl record;
  v_n integer := 0;
begin
  for v_pl in
    select id, quantity - received_qty as pending
    from public.purchase_lines
    where purchase_id = p_purchase_id and quantity - received_qty > 0
    order by id
  loop
    perform public.purchase_receive(v_pl.id, v_pl.pending);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

-- Totales de factura: ahora también cuánto se recibió.
create or replace view public.purchase_totals with (security_invoker = true) as
select
  p.id as purchase_id, p.organization_id, p.contract_id,
  count(pl.id) as lines,
  coalesce(sum(pl.quantity), 0) as units,
  coalesce(sum(a.subtotal), 0)::bigint as subtotal_cents,
  coalesce(sum(a.vat), 0)::bigint as vat_cents,
  coalesce(sum(pl.quantity - coalesce(s.assigned, 0)), 0) as unassigned,
  coalesce(sum(pl.received_qty), 0) as received
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

revoke execute on function public.purchase_receive(uuid, numeric) from public, anon;
revoke execute on function public.purchase_receive_all(uuid) from public, anon;
grant execute on function public.purchase_receive(uuid, numeric) to authenticated;
grant execute on function public.purchase_receive_all(uuid) to authenticated;
