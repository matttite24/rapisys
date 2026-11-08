-- Totales de los archivos de un contrato por origen, para mostrar la lista por páginas sin traerlos todos.
create or replace function public.contract_files_counts(p_contract_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'contract', count(*) filter (where source = 'contract'),
    'purchase', count(*) filter (where source = 'purchase'),
    'expense', count(*) filter (where source = 'expense'),
    'bytes', coalesce(sum(size_bytes), 0)
  )
  from public.contract_files
  where contract_id = p_contract_id
$$;

revoke execute on function public.contract_files_counts(uuid) from public, anon;
grant execute on function public.contract_files_counts(uuid) to authenticated;
