-- Búsqueda de productos por palabras: «correa tensionadora» encuentra «Correa tensionadora CAT» y también
-- «Tensionadora de correa», porque cada palabra debe aparecer, en cualquier orden. Sigue usando el índice de trigramas.
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
    and public.item_search_text(i.name, i.sku, i.part_numbers) like all (array(
      select '%' || replace(replace(replace(w, '\', '\\'), '%', '\%'), '_', '\_') || '%'
      from regexp_split_to_table(lower(trim(coalesce(p_q, ''))), '\s+') as w
      where w <> ''
    ))
  order by
    (coalesce(p_q, '') <> '' and (
      lower(i.sku) = lower(trim(p_q))
      or exists (select 1 from unnest(i.part_numbers) x where lower(x) = lower(trim(p_q)))
    )) desc nulls last,
    i.name, i.id
  limit least(greatest(p_limit, 1), 50)
$$;
revoke execute on function public.search_items(uuid, text, integer) from public, anon;
grant execute on function public.search_items(uuid, text, integer) to authenticated;

create or replace function public.search_invoice_items(p_org uuid, p_invoice uuid, p_q text, p_limit integer default 16)
returns table (id uuid, sku text, name text, part_numbers text[])
language sql
stable
security invoker
set search_path = ''
as $$
  select i.id, i.sku, i.name, i.part_numbers
  from public.items i
  where i.organization_id = p_org
    and exists (select 1 from public.purchase_lines pl where pl.purchase_id = p_invoice and pl.item_id = i.id)
    and public.item_search_text(i.name, i.sku, i.part_numbers) like all (array(
      select '%' || replace(replace(replace(w, '\', '\\'), '%', '\%'), '_', '\_') || '%'
      from regexp_split_to_table(lower(trim(coalesce(p_q, ''))), '\s+') as w
      where w <> ''
    ))
  order by (lower(i.sku) = lower(trim(p_q)) or exists (select 1 from unnest(i.part_numbers) x where lower(x) = lower(trim(p_q)))) desc nulls last,
    i.name, i.id
  limit least(greatest(p_limit, 1), 50)
$$;
revoke execute on function public.search_invoice_items(uuid, uuid, text, integer) from public, anon;
grant execute on function public.search_invoice_items(uuid, uuid, text, integer) to authenticated;
