-- Costo de lo ya cubierto en un contrato (sin IVA): suma cantidad x costo unitario de todos los tramos asignados a sus
-- líneas, sean de la bodega o reservados por llegar. Sirve para comparar contra el valor del contrato.
-- `unknown`: cuántos tramos no tienen costo conocido (no suman al total).
create function public.contract_supply_cost(p_contract_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'cost_cents', coalesce(round(sum(ss.quantity * ss.unit_cost_cents)), 0)::bigint,
    'unknown', count(*) filter (where ss.unit_cost_cents is null)
  )
  from public.supply_sources ss
  join public.contract_items ci on ci.id = ss.contract_item_id
  where ci.contract_id = p_contract_id
$$;

revoke execute on function public.contract_supply_cost(uuid) from public, anon;
grant execute on function public.contract_supply_cost(uuid) to authenticated;
