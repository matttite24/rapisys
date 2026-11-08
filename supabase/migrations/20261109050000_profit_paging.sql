-- Revisión de rentabilidad por páginas y propuestas de coincidencias solo con lo abierto.
--
-- contract_profit_summary: cifras ya agregadas por lista (nada de líneas). La utilidad de un item es precio ref. - costo; solo
-- cuentan las líneas con precio ref. y con algo asignado (las demás se cuentan aparte como "sin precio" o "sin compra").
create or replace function public.contract_profit_summary(p_contract_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with ln as (
    select
      ci.id,
      ci.list_id,
      ci.reference_price_cents as ref,
      coalesce(round(sum(ss.quantity * ss.unit_cost_cents)), 0)::bigint as cost,
      count(ss.id) filter (where ss.unit_cost_cents is null) as unknown,
      count(ss.id) as sources
    from public.contract_items ci
    left join public.supply_sources ss on ss.contract_item_id = ci.id
    where ci.contract_id = p_contract_id
    group by ci.id
  )
  select jsonb_build_object(
    'contract_cents', (select c.total_cents from public.contracts c where c.id = p_contract_id),
    'expenses_cents', (select coalesce(sum(e.amount_cents), 0) from public.contract_expenses e where e.contract_id = p_contract_id),
    'lists', coalesce((
      select jsonb_agg(x order by x.created_at)
      from (
        select
          cl.id,
          cl.name,
          cl.created_at,
          count(ln.id) as lines,
          coalesce(sum(ln.ref) filter (where ln.ref is not null and ln.sources > 0), 0)::bigint as reference_cents,
          coalesce(sum(ln.cost) filter (where ln.ref is not null and ln.sources > 0), 0)::bigint as cost_cents,
          count(ln.id) filter (where ln.ref is null) as no_price,
          count(ln.id) filter (where ln.ref is not null and ln.sources = 0) as pending,
          count(ln.id) filter (where ln.ref is not null and ln.sources > 0 and ln.unknown > 0) as partial
        from public.contract_lists cl
        left join ln on ln.list_id = cl.id
        where cl.contract_id = p_contract_id
        group by cl.id
      ) x
    ), '[]'::jsonb)
  )
$$;

revoke execute on function public.contract_profit_summary(uuid) from public, anon;
grant execute on function public.contract_profit_summary(uuid) to authenticated;

-- contract_profit_lines: una página de líneas de una lista, con su precio ref. y su costo.
create or replace function public.contract_profit_lines(p_list_id uuid, p_offset integer, p_limit integer)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'total', (select count(*) from public.contract_items ci where ci.list_id = p_list_id),
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
        from public.contract_items ci
        left join public.supply_sources ss on ss.contract_item_id = ci.id
        where ci.list_id = p_list_id
        group by ci.id
        order by ci.created_at, ci.id
        offset greatest(p_offset, 0)
        limit least(greatest(p_limit, 1), 200)
      ) t
    ), '[]'::jsonb)
  )
$$;

revoke execute on function public.contract_profit_lines(uuid, integer, integer) from public, anon;
grant execute on function public.contract_profit_lines(uuid, integer, integer) to authenticated;

-- contract_open_lines: líneas del contrato con número de parte y unidades aún sin cubrir (para proponer coincidencias).
create or replace function public.contract_open_lines(p_contract_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', v.id, 'list_id', v.list_id, 'n', v.n, 'part_number', v.part_number, 'description', v.description,
    'quantity', v.quantity, 'reserved', v.reserved, 'purchased', v.purchased
  ) order by v.list_id, v.n), '[]'::jsonb)
  from (
    select * from public.contract_item_supply s
    where s.contract_id = p_contract_id
      and s.part_number is not null and btrim(s.part_number) <> ''
      and s.quantity - s.reserved - s.purchased > 0
    limit 5000
  ) v
$$;

revoke execute on function public.contract_open_lines(uuid) from public, anon;
grant execute on function public.contract_open_lines(uuid) to authenticated;
