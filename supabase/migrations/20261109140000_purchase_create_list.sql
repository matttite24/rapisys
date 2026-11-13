-- Proceso a crédito: «Crear lista y abastecer» desde una factura ya recibida.
-- Crea una lista nueva con una línea por cada línea de la factura (nombre TDR del producto, cantidad y precio =
-- costo de la factura + margen del producto) y le asigna a cada línea lo recibido. Todo en una sola transacción.
alter table public.purchases add column list_id uuid references public.contract_lists (id) on delete set null;

create or replace function public.purchase_create_list(p_purchase_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_purchase public.purchases;
  v_contract public.contracts;
  v_supplier text;
  v_list uuid;
  v_line uuid;
  v_pl record;
  v_lot record;
begin
  select * into v_purchase from public.purchases where id = p_purchase_id for update;
  if v_purchase.id is null or not public.has_role(v_purchase.organization_id, array['admin', 'operator']::public.org_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_contract from public.contracts where id = v_purchase.contract_id;
  if v_contract.kind <> 'credit' then raise exception 'not_credit' using errcode = 'P0001'; end if;
  if v_contract.status <> 'in_progress' then raise exception 'not_in_progress' using errcode = 'P0001'; end if;
  if v_purchase.status <> 'complete' then raise exception 'purchase_draft' using errcode = 'P0001'; end if;
  if v_purchase.list_id is not null then raise exception 'already_created' using errcode = 'P0001'; end if;
  if exists (select 1 from public.purchase_lines where purchase_id = p_purchase_id and received_qty < quantity) then
    raise exception 'not_received' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.purchase_lines where purchase_id = p_purchase_id) then
    raise exception 'no_lines' using errcode = 'P0001';
  end if;

  select name into v_supplier from public.suppliers where id = v_purchase.supplier_id;
  insert into public.contract_lists (organization_id, contract_id, name)
  values (v_purchase.organization_id, v_purchase.contract_id,
          left('Factura ' || v_purchase.number || coalesce(' · ' || v_supplier, ''), 200))
  returning id into v_list;

  for v_pl in
    select pl.id, pl.quantity, pl.new_part_number, pl.xml_code,
           coalesce(pl.line_total_cents, round(pl.quantity * pl.unit_cost_cents))::bigint as cost_cents,
           i.name, i.tdr_name, i.sku, i.part_numbers, i.margin_percent
    from public.purchase_lines pl
    join public.items i on i.id = pl.item_id
    where pl.purchase_id = p_purchase_id
    order by pl.position, pl.id
  loop
    insert into public.contract_items
      (organization_id, contract_id, list_id, part_number, description, quantity, unit, reference_price_cents)
    values (
      v_purchase.organization_id, v_purchase.contract_id, v_list,
      left(coalesce(v_pl.part_numbers[1], v_pl.new_part_number, v_pl.xml_code, v_pl.sku, ''), 60),
      left(coalesce(nullif(trim(v_pl.tdr_name), ''), v_pl.name), 500),
      v_pl.quantity, 'unit',
      -- Costo de la factura (sin IVA) + margen de utilidad del producto: igual que el precio de venta de bodega.
      round(v_pl.cost_cents * (10000 + round(v_pl.margin_percent * 100)) / 10000)::bigint
    )
    returning id into v_line;

    -- Abastecer: lo recibido de esta línea de factura (sus lotes) queda asignado a la línea nueva.
    for v_lot in
      select id, remaining_qty from public.stock_lots
      where purchase_line_id = v_pl.id and remaining_qty > 0
      order by created_at, id
    loop
      perform public.supply_reserve(v_line, v_lot.id, v_lot.remaining_qty, 'Factura ' || v_purchase.number);
    end loop;
  end loop;

  update public.purchases set list_id = v_list where id = p_purchase_id;
  return v_list;
end;
$$;
revoke execute on function public.purchase_create_list(uuid) from public, anon;
grant execute on function public.purchase_create_list(uuid) to authenticated;
