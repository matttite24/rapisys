-- Consolidado de Revisión: una fila por entrega (sin las anuladas) con sus totales ya revisados. Mismas reglas que
-- contract_billing_totals (valor final = precio ref. o costo × (1 + margen ajustado); sin líneas omitidas), por entrega.
create or replace function public.contract_billing_deliveries(p_contract_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with base as (
    select
      d.id as delivery_id,
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
    group by d.id, dl.id, ci.id, ba.margin_percent, ba.excluded
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
  select coalesce(jsonb_agg(x order by x.number), '[]'::jsonb)
  from (
    select
      d.id, d.number, d.delivered_on, cl.name as list_name,
      count(f.dl_id) as lines,
      count(f.dl_id) filter (where f.ok) as counted,
      count(f.dl_id) filter (where f.excluded) as excluded,
      count(f.dl_id) filter (where not f.excluded and not f.ok) as uncalculated,
      coalesce(sum(f.cost) filter (where f.ok), 0)::bigint as cost_cents,
      coalesce(sum(f.final) filter (where f.ok), 0)::bigint as final_cents
    from public.deliveries d
    join public.contract_lists cl on cl.id = d.list_id
    left join flagged f on f.delivery_id = d.id
    where d.contract_id = p_contract_id and d.voided_at is null
    group by d.id, cl.name
  ) x
$$;
revoke execute on function public.contract_billing_deliveries(uuid) from public, anon;
grant execute on function public.contract_billing_deliveries(uuid) to authenticated;
