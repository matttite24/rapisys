-- Proceso a crédito: «Crear lista y abastecer» ya no pone un precio calculado a las líneas nuevas (podía confundir con el
-- precio de un contrato). El valor final se define al revisar la utilidad de cada entrega.
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
      -- Sin precio: el valor final de cada línea se define al revisar la utilidad de la entrega (Revisión).
      null
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

-- Revisión de un proceso a crédito: el valor final del contrato es la suma del valor final de cada entrega ya revisada
-- (precio ref. de la línea o, si se ajustó el margen en el reporte de cobro, costo × (1 + margen)), sin las líneas omitidas
-- ni las entregas anuladas. El costo es el de esas mismas líneas, con IVA.
create or replace function public.contract_billing_totals(p_contract_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with base as (
    select
      dl.id as dl_id,
      ci.reference_price_cents as ref,
      coalesce(round(sum(ss.quantity * ss.unit_cost_cents * (100 + coalesce(pl.vat_rate, 15)) / 100)), 0)::bigint as cost,
      count(ss.id) as sources,
      ba.margin_percent as margin_override,
      coalesce(ba.excluded, false) as excluded
    from public.deliveries d
    join public.delivery_lines dl on dl.delivery_id = d.id
    join public.contract_items ci on ci.id = dl.contract_item_id
    left join public.supply_sources ss on ss.contract_item_id = ci.id
    left join public.stock_lots sl on sl.id = ss.lot_id
    left join public.purchase_lines pl on pl.id = coalesce(ss.purchase_line_id, sl.purchase_line_id)
    left join public.billing_adjustments ba on ba.delivery_id = dl.delivery_id and ba.contract_item_id = ci.id
    where d.contract_id = p_contract_id and d.voided_at is null
    group by dl.id, ci.id, ba.margin_percent, ba.excluded
  ),
  calc as (
    select b.*,
      case
        when b.margin_override is not null and b.sources > 0
          then round(b.cost * (10000 + round(b.margin_override * 100)) / 10000)::bigint
        else b.ref
      end as final
    from base b
  ),
  flagged as (select *, (not excluded and sources > 0 and final is not null) as ok from calc)
  select jsonb_build_object(
    'cost_cents', coalesce(sum(cost) filter (where ok), 0)::bigint,
    'final_cents', coalesce(sum(final) filter (where ok), 0)::bigint,
    'included', count(*) filter (where not excluded),
    'excluded', count(*) filter (where excluded),
    'uncalculated', count(*) filter (where not excluded and not ok)
  )
  from flagged
$$;
revoke execute on function public.contract_billing_totals(uuid) from public, anon;
grant execute on function public.contract_billing_totals(uuid) to authenticated;
