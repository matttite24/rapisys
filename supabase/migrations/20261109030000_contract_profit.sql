-- Revisión de rentabilidad de un contrato (todo sin IVA, en centavos).
-- Por línea: precio referencial (total de la fila) y costo de compra (suma cantidad x costo unitario de lo asignado).
-- `unknown`: tramos asignados sin costo conocido (no suman); la utilidad de esa línea queda incompleta.
-- Además: gastos del contrato y el valor del contrato.
create or replace function public.contract_profit_view(p_contract_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'contract_cents', (select c.total_cents from public.contracts c where c.id = p_contract_id),
    'expenses_cents', (select coalesce(sum(e.amount_cents), 0) from public.contract_expenses e where e.contract_id = p_contract_id),
    'lines', coalesce((
      select jsonb_agg(l order by l.list_name, l.n)
      from (
        select
          ci.id,
          ci.list_id,
          row_number() over (partition by ci.list_id order by ci.created_at, ci.id) as n,
          cl.name as list_name,
          ci.part_number,
          ci.description,
          ci.quantity,
          ci.unit,
          ci.reference_price_cents as reference_cents,
          coalesce(round(sum(ss.quantity * ss.unit_cost_cents)), 0)::bigint as cost_cents,
          count(ss.id) filter (where ss.unit_cost_cents is null) as unknown,
          count(ss.id) as sources
        from public.contract_items ci
        join public.contract_lists cl on cl.id = ci.list_id
        left join public.supply_sources ss on ss.contract_item_id = ci.id
        where ci.contract_id = p_contract_id
        group by ci.id, cl.name
        limit 5000
      ) l
    ), '[]'::jsonb)
  )
$$;

revoke execute on function public.contract_profit_view(uuid) from public, anon;
grant execute on function public.contract_profit_view(uuid) to authenticated;
