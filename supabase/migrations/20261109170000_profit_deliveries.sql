-- Revisión por entregas: una pestaña por entrega, con las líneas entregadas y su utilidad.
-- Mismas cifras que la revisión por lista (precio ref. − costo asignado), pero solo de las líneas de cada entrega.

create or replace function public.contract_profit_deliveries(p_contract_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with ln as (
    select
      ci.id,
      ci.reference_price_cents as ref,
      coalesce(round(sum(ss.quantity * ss.unit_cost_cents)), 0)::bigint as cost,
      count(ss.id) filter (where ss.unit_cost_cents is null) as unknown,
      count(ss.id) as sources
    from public.contract_items ci
    left join public.supply_sources ss on ss.contract_item_id = ci.id
    where ci.contract_id = p_contract_id
    group by ci.id
  )
  select coalesce(jsonb_agg(x order by x.number), '[]'::jsonb)
  from (
    select
      d.id, d.number, d.delivered_on, d.list_id, cl.name as list_name,
      count(dl.id) as lines,
      coalesce(sum(ln.ref) filter (where ln.ref is not null and ln.sources > 0), 0)::bigint as reference_cents,
      coalesce(sum(ln.cost) filter (where ln.ref is not null and ln.sources > 0), 0)::bigint as cost_cents,
      count(dl.id) filter (where ln.ref is null) as no_price,
      count(dl.id) filter (where ln.ref is not null and ln.sources = 0) as pending,
      count(dl.id) filter (where ln.ref is not null and ln.sources > 0 and ln.unknown > 0) as partial
    from public.deliveries d
    join public.contract_lists cl on cl.id = d.list_id
    left join public.delivery_lines dl on dl.delivery_id = d.id
    left join ln on ln.id = dl.contract_item_id
    where d.contract_id = p_contract_id
    group by d.id, cl.name
  ) x
$$;
revoke execute on function public.contract_profit_deliveries(uuid) from public, anon;
grant execute on function public.contract_profit_deliveries(uuid) to authenticated;

create or replace function public.contract_profit_delivery_lines(p_delivery_id uuid, p_offset integer, p_limit integer)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'total', (select count(*) from public.delivery_lines dl where dl.delivery_id = p_delivery_id),
    'lines', coalesce((
      select jsonb_agg(t order by t.created_at, t.id)
      from (
        select
          ci.id,
          ci.created_at,
          ci.part_number,
          ci.description,
          ci.quantity,
          ci.unit,
          ci.reference_price_cents as reference_cents,
          coalesce(round(sum(ss.quantity * ss.unit_cost_cents)), 0)::bigint as cost_cents,
          count(ss.id) filter (where ss.unit_cost_cents is null) as unknown,
          count(ss.id) as sources
        from public.delivery_lines dl
        join public.contract_items ci on ci.id = dl.contract_item_id
        left join public.supply_sources ss on ss.contract_item_id = ci.id
        where dl.delivery_id = p_delivery_id
        group by ci.id
        order by ci.created_at, ci.id
        offset greatest(p_offset, 0)
        limit least(greatest(p_limit, 1), 200)
      ) t
    ), '[]'::jsonb)
  )
$$;
revoke execute on function public.contract_profit_delivery_lines(uuid, integer, integer) from public, anon;
grant execute on function public.contract_profit_delivery_lines(uuid, integer, integer) to authenticated;
