-- La búsqueda de líneas de Abastecimiento también encuentra por código interno y por referencia de la línea
-- (el código con el que se busca al proveedor). Misma firma: la vista del proceso no cambia.
create or replace function public.supply_line_matches(
  p_line_id uuid,
  p_part text,
  p_desc text,
  p_cpc text,
  p_n bigint,
  p_words text[]
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select not exists (
    select 1
    from unnest(p_words) as w
    where not (
      public.supply_norm(coalesce(p_part, '') || ' ' || coalesce(p_desc, '') || ' ' || coalesce(p_cpc, '') || ' ' || p_n::text) like '%' || w || '%'
      or exists (
        select 1 from public.contract_items ci
        where ci.id = p_line_id
          and public.supply_norm(coalesce(ci.internal_code, '') || ' ' || coalesce(ci.reference, '')) like '%' || w || '%'
      )
      or exists (
        select 1
        from public.supply_sources ss
        join public.items i on i.id = ss.item_id
        where ss.contract_item_id = p_line_id
          and public.supply_norm(i.name || ' ' || coalesce(i.sku, '') || ' ' || coalesce(array_to_string(i.part_numbers, ' '), '')) like '%' || w || '%'
      )
    )
  )
$$;
revoke execute on function public.supply_line_matches(uuid, text, text, text, bigint, text[]) from public, anon;
grant execute on function public.supply_line_matches(uuid, text, text, text, bigint, text[]) to authenticated;
