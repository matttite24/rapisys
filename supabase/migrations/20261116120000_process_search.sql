-- Búsquedas en servidor antes del límite, incluso para facturas de más de 1000 líneas.
create or replace function public.search_invoice_items(p_org uuid, p_invoice uuid, p_q text, p_limit integer default 16)
returns table (id uuid, sku text, name text, part_numbers text[])
language sql stable security invoker set search_path = ''
as $$
  select i.id, i.sku, i.name, i.part_numbers
  from public.items i
  where i.organization_id = p_org
    and exists (select 1 from public.purchase_lines pl where pl.purchase_id = p_invoice and pl.item_id = i.id)
    and (coalesce(p_q, '') = '' or public.item_search_text(i.name, i.sku, i.part_numbers)
      like '%' || replace(replace(replace(lower(p_q), '\', '\\'), '%', '\%'), '_', '\_') || '%')
  order by (lower(i.sku) = lower(p_q) or exists (select 1 from unnest(i.part_numbers) x where lower(x) = lower(p_q))) desc nulls last,
    i.name, i.id
  limit least(greatest(p_limit, 1), 50)
$$;
revoke execute on function public.search_invoice_items(uuid, uuid, text, integer) from public, anon;
grant execute on function public.search_invoice_items(uuid, uuid, text, integer) to authenticated;

-- Índices para los filtros parciales (%texto%) de Procesos y sus selectores.
create extension if not exists pg_trgm with schema extensions;
create index if not exists contracts_code_search_idx on public.contracts using gin (code extensions.gin_trgm_ops);
create index if not exists contracts_name_search_idx on public.contracts using gin (name extensions.gin_trgm_ops);
create index if not exists contract_items_description_search_idx on public.contract_items using gin (description extensions.gin_trgm_ops);
create index if not exists contract_items_part_number_search_idx on public.contract_items using gin (part_number extensions.gin_trgm_ops);
create index if not exists assets_name_search_idx on public.assets using gin (name extensions.gin_trgm_ops);
create index if not exists assets_brand_search_idx on public.assets using gin (brand extensions.gin_trgm_ops);
create index if not exists assets_model_search_idx on public.assets using gin (model extensions.gin_trgm_ops);
create index if not exists assets_serial_search_idx on public.assets using gin (serial extensions.gin_trgm_ops);
create index if not exists assets_identifier_search_idx on public.assets using gin (identifier extensions.gin_trgm_ops);
create index if not exists assets_plate_search_idx on public.assets using gin (plate extensions.gin_trgm_ops);
create index if not exists clients_name_search_idx on public.clients using gin (name extensions.gin_trgm_ops);
create index if not exists clients_ruc_search_idx on public.clients using gin (ruc extensions.gin_trgm_ops);
create index if not exists contract_managers_name_search_idx on public.contract_managers using gin (name extensions.gin_trgm_ops);
create index if not exists contract_managers_ruc_search_idx on public.contract_managers using gin (ruc extensions.gin_trgm_ops);
create index if not exists suppliers_name_search_idx on public.suppliers using gin (name extensions.gin_trgm_ops);
create index if not exists suppliers_ruc_search_idx on public.suppliers using gin (ruc extensions.gin_trgm_ops);
create index if not exists purchase_lines_invoice_item_idx on public.purchase_lines (purchase_id, item_id);

-- Orden exacto estable también cuando un producto no tiene SKU.
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
    )) desc nulls last,
    i.name, i.id
  limit least(greatest(p_limit, 1), 50)
$$;

revoke execute on function public.search_items(uuid, text, integer) from public, anon;
grant execute on function public.search_items(uuid, text, integer) to authenticated;
