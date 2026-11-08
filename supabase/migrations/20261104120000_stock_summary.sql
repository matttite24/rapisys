-- Resumen de la bodega de una organización: cuántos productos tienen existencias y cuántas unidades hay en total.
create function public.stock_summary(p_org uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'products', count(distinct item_id),
    'units', coalesce(sum(remaining_qty), 0)
  )
  from public.stock_lots
  where organization_id = p_org and remaining_qty > 0
$$;

revoke execute on function public.stock_summary(uuid) from public, anon;
grant execute on function public.stock_summary(uuid) to authenticated;
