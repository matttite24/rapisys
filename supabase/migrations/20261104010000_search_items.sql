-- Búsqueda de productos de la bodega pensada para miles de filas: coincide por nombre, SKU y números
-- de parte (también parciales, "1R-07"), con índice de trigramas, y pone primero la coincidencia exacta.
create extension if not exists pg_trgm with schema extensions;

-- Texto buscable de un producto. Inmutable para poder indexarlo.
create or replace function public.item_search_text(p_name text, p_sku text, p_parts text[])
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select lower(coalesce(p_name, '') || ' ' || coalesce(p_sku, '') || ' ' || coalesce(array_to_string(p_parts, ' '), ''))
$$;

create index items_search_trgm_idx on public.items
  using gin (public.item_search_text(name, sku, part_numbers) extensions.gin_trgm_ops);

-- Se ejecuta con los permisos de quien llama: la RLS de items sigue decidiendo qué ve cada quien.
create or replace function public.search_items(p_org uuid, p_q text, p_limit integer default 15)
returns table (id uuid, sku text, name text, part_numbers text[])
language sql
stable
security invoker
set search_path = ''
as $$
  select i.id, i.sku, i.name, i.part_numbers
  from public.items i
  where i.organization_id = p_org
    and i.is_active
    and (
      coalesce(p_q, '') = ''
      or public.item_search_text(i.name, i.sku, i.part_numbers)
         like '%' || replace(replace(replace(lower(p_q), '\', '\\'), '%', '\%'), '_', '\_') || '%'
    )
  order by
    (coalesce(p_q, '') <> '' and (
      lower(i.sku) = lower(p_q)
      or exists (select 1 from unnest(i.part_numbers) x where lower(x) = lower(p_q))
    )) desc,
    i.name
  limit least(greatest(p_limit, 1), 50)
$$;

revoke execute on function public.search_items(uuid, text, integer) from public, anon;
grant execute on function public.search_items(uuid, text, integer) to authenticated;
