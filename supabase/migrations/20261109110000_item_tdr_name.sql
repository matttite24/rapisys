-- Nombre TDR del item: el nombre con el que aparece en los términos de referencia del contrato.
alter table public.items add column tdr_name text check (tdr_name is null or length(tdr_name) <= 300);

create or replace function public.save_item(
  p_org uuid,
  p_id uuid,
  p_item jsonb,
  p_prices jsonb,
  p_asset_ids uuid[]
)
returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  v_id uuid;
  v_cat uuid;
  v_new text := nullif(trim(coalesce(p_item ->> 'new_category', '')), '');
  v_parts text[] := array(
    select trim(v) from jsonb_array_elements_text(coalesce(p_item -> 'part_numbers', '[]'::jsonb)) v
    where trim(v) <> ''
  );
begin
  if v_new is not null then
    insert into public.item_categories (organization_id, name) values (p_org, v_new)
    on conflict (organization_id, lower(name)) do update set name = excluded.name
    returning id into v_cat;
  else
    v_cat := nullif(p_item ->> 'category_id', '')::uuid;
  end if;

  if p_id is null then
    insert into public.items (
      organization_id, sku, name, tdr_name, description, line, category_id,
      part_numbers, specs, margin_percent, is_active
    ) values (
      p_org,
      nullif(trim(p_item ->> 'sku'), ''),
      trim(p_item ->> 'name'),
      nullif(trim(p_item ->> 'tdr_name'), ''),
      nullif(trim(p_item ->> 'description'), ''),
      nullif(trim(p_item ->> 'line'), ''),
      v_cat,
      v_parts,
      coalesce(p_item -> 'specs', '{}'::jsonb),
      coalesce((p_item ->> 'margin_percent')::numeric, 40),
      coalesce((p_item ->> 'is_active')::boolean, true)
    )
    returning id into v_id;
  else
    update public.items set
      sku = nullif(trim(p_item ->> 'sku'), ''),
      name = trim(p_item ->> 'name'),
      tdr_name = nullif(trim(p_item ->> 'tdr_name'), ''),
      description = nullif(trim(p_item ->> 'description'), ''),
      line = nullif(trim(p_item ->> 'line'), ''),
      category_id = v_cat,
      part_numbers = v_parts,
      specs = coalesce(p_item -> 'specs', '{}'::jsonb),
      margin_percent = coalesce((p_item ->> 'margin_percent')::numeric, 40),
      is_active = coalesce((p_item ->> 'is_active')::boolean, true),
      updated_at = now()
    where id = p_id and organization_id = p_org
    returning id into v_id;
    if v_id is null then
      raise exception 'Item no encontrado o sin permiso';
    end if;
  end if;

  delete from public.item_supplier_prices where item_id = v_id;
  insert into public.item_supplier_prices
    (organization_id, item_id, supplier_id, unit_cost_cents, vat_rate, supplier_sku)
  select p_org, v_id, x.supplier_id, x.unit_cost_cents, coalesce(x.vat_rate, 15), nullif(trim(x.supplier_sku), '')
  from jsonb_to_recordset(coalesce(p_prices, '[]'::jsonb))
    as x(supplier_id uuid, unit_cost_cents bigint, vat_rate numeric, supplier_sku text);

  delete from public.item_assets where item_id = v_id;
  insert into public.item_assets (organization_id, item_id, asset_id)
  select p_org, v_id, a from unnest(coalesce(p_asset_ids, '{}')) a;

  return v_id;
end;
$$;
