-- Fotografías de una entrega: se guardan como archivos del proceso (contract_files) con origen "entrega", así aparecen
-- también en la pestaña de archivos del proceso y se ven, descargan y borran con lo mismo que los demás archivos.
alter table public.contract_files drop constraint if exists contract_files_source_check;
alter table public.contract_files
  add constraint contract_files_source_check check (source in ('contract', 'purchase', 'expense', 'delivery'));

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
    'delivery', count(*) filter (where source = 'delivery'),
    'bytes', coalesce(sum(size_bytes), 0)
  )
  from public.contract_files
  where contract_id = p_contract_id
$$;
