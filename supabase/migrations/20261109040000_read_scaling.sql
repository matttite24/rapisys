-- Lecturas que crecen con el contrato, no con toda la organización.
--
-- 1) contract_item_supply calculaba el número de fila con una ventana "partition by list_id". Postgres solo baja un filtro
--    por debajo de una ventana si la columna está en el "partition by"; filtrar por contract_id o por id obligaba a calcular
--    las sumas de TODAS las líneas de la organización y filtrar después. Con contract_id en la partición el filtro baja y el
--    resultado es igual (una lista pertenece a un solo contrato, así que el número de fila no cambia).
create or replace view public.contract_item_supply with (security_invoker = true) as
select
  ci.id, ci.organization_id, ci.contract_id, ci.list_id,
  row_number() over (partition by ci.contract_id, ci.list_id order by ci.created_at, ci.id) as n,
  ci.part_number, ci.description, ci.quantity, ci.unit, ci.cpc, ci.created_at,
  coalesce(s.reserved, 0) as reserved,
  s.cost_cents,
  case
    when coalesce(d.delivered, 0) >= ci.quantity then 'delivered'
    when coalesce(s.reserved, 0) >= ci.quantity then 'in_stock'
    when coalesce(s.reserved, 0) > 0 then 'partial'
    when coalesce(s.purchased, 0) > 0 then 'purchased'
    else 'pending'
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

-- 2) Recuento de líneas por lista y estado, ya agregado en la base: el panel del contrato pedía hasta 20 000 filas
--    (una por línea) solo para contarlas.
create or replace function public.contract_state_counts(p_contract_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('list_id', t.list_id, 'state', t.state, 'n', t.n)), '[]'::jsonb)
  from (
    select v.list_id, v.state, count(*) as n
    from public.contract_item_supply v
    where v.contract_id = p_contract_id
    group by v.list_id, v.state
  ) t
$$;

revoke execute on function public.contract_state_counts(uuid) from public, anon;
grant execute on function public.contract_state_counts(uuid) to authenticated;

-- 3) Contadores del menú del contrato en una sola llamada (eran seis consultas por cada vez que se recarga el contrato).
create or replace function public.contract_nav_counts(p_contract_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'lists', (select count(*) from public.contract_lists where contract_id = p_contract_id),
    'lines', (select count(*) from public.contract_items where contract_id = p_contract_id),
    'purchases', (select count(*) from public.purchases where contract_id = p_contract_id),
    'deliveries', (select count(*) from public.deliveries where contract_id = p_contract_id),
    'expenses', (select count(*) from public.contract_expenses where contract_id = p_contract_id),
    'files', (select count(*) from public.contract_files where contract_id = p_contract_id)
  )
$$;

revoke execute on function public.contract_nav_counts(uuid) from public, anon;
grant execute on function public.contract_nav_counts(uuid) to authenticated;
