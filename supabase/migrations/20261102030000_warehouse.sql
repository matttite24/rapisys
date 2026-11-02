-- Bodega: catálogo de items con costos por proveedor, categorías y activos compatibles.

create type public.asset_kind as enum ('light_vehicle', 'heavy_vehicle', 'machinery');

create table public.item_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  created_at timestamptz not null default now(),
  unique (id, organization_id)
);
create unique index item_categories_name_idx
  on public.item_categories (organization_id, lower(name));

-- Vehículos livianos, pesados y maquinaria a los que sirven los items.
create table public.assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  kind public.asset_kind not null,
  name text not null check (length(trim(name)) > 0),
  brand text,
  model text,
  year integer check (year between 1950 and 2100),
  plate text,
  created_at timestamptz not null default now(),
  unique (id, organization_id)
);
create index assets_org_idx on public.assets (organization_id, kind);

create table public.items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  sku text,
  name text not null check (length(trim(name)) > 0),
  description text,
  line text,                                   -- línea de producto
  category_id uuid,
  part_numbers text[] not null default '{}' check (cardinality(part_numbers) <= 3),
  specs jsonb not null default '{}' check (jsonb_typeof(specs) = 'object'),
  margin_percent numeric(6, 2) not null default 40 check (margin_percent >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (category_id, organization_id)
    references public.item_categories (id, organization_id)
);
create unique index items_sku_idx
  on public.items (organization_id, lower(sku)) where sku is not null;
create index items_org_name_idx on public.items (organization_id, lower(name));

-- Costo del item según proveedor: sin IVA y con la tarifa por separado.
create table public.item_supplier_prices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  item_id uuid not null,
  supplier_id uuid not null,
  unit_cost numeric(14, 4) not null check (unit_cost >= 0),
  vat_rate numeric(5, 2) not null default 15 check (vat_rate >= 0),
  supplier_sku text,
  created_at timestamptz not null default now(),
  unique (item_id, supplier_id),
  foreign key (item_id, organization_id)
    references public.items (id, organization_id) on delete cascade,
  foreign key (supplier_id, organization_id)
    references public.suppliers (id, organization_id)
);
create index item_supplier_prices_item_idx on public.item_supplier_prices (item_id);

create table public.item_assets (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  item_id uuid not null,
  asset_id uuid not null,
  primary key (item_id, asset_id),
  foreign key (item_id, organization_id)
    references public.items (id, organization_id) on delete cascade,
  foreign key (asset_id, organization_id)
    references public.assets (id, organization_id) on delete cascade
);

-- RLS: los miembros leen; admin y operador escriben. Solo el admin borra items,
-- categorías y activos; las tablas hijas las reescribe quien edita el item.
do $$
declare
  t text;
  rw text := 'array[''admin'',''operator'']::public.org_role[]';
begin
  foreach t in array array['item_categories', 'assets', 'items', 'item_supplier_prices', 'item_assets']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "%1$s: miembros leen" on public.%1$I for select to authenticated using (public.is_member(organization_id))', t);
    execute format(
      'create policy "%1$s: admin y operador crean" on public.%1$I for insert to authenticated with check (public.has_role(organization_id, %2$s))', t, rw);
  end loop;

  foreach t in array array['item_categories', 'assets', 'items', 'item_supplier_prices']
  loop
    execute format(
      'create policy "%1$s: admin y operador editan" on public.%1$I for update to authenticated using (public.has_role(organization_id, %2$s)) with check (public.has_role(organization_id, %2$s))', t, rw);
  end loop;

  foreach t in array array['item_categories', 'assets', 'items']
  loop
    execute format(
      'create policy "%1$s: admin borra" on public.%1$I for delete to authenticated using (public.has_role(organization_id, array[''admin'']::public.org_role[]))', t);
  end loop;

  foreach t in array array['item_supplier_prices', 'item_assets']
  loop
    execute format(
      'create policy "%1$s: admin y operador borran" on public.%1$I for delete to authenticated using (public.has_role(organization_id, %2$s))', t, rw);
  end loop;
end $$;

-- Guarda un item con sus costos y compatibilidades en una sola transacción.
-- security invoker: las políticas RLS de arriba se aplican igual.
create function public.save_item(
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
      organization_id, sku, name, description, line, category_id,
      part_numbers, specs, margin_percent, is_active
    ) values (
      p_org,
      nullif(trim(p_item ->> 'sku'), ''),
      trim(p_item ->> 'name'),
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
    (organization_id, item_id, supplier_id, unit_cost, vat_rate, supplier_sku)
  select p_org, v_id, x.supplier_id, x.unit_cost, coalesce(x.vat_rate, 15), nullif(trim(x.supplier_sku), '')
  from jsonb_to_recordset(coalesce(p_prices, '[]'::jsonb))
    as x(supplier_id uuid, unit_cost numeric, vat_rate numeric, supplier_sku text);

  delete from public.item_assets where item_id = v_id;
  insert into public.item_assets (organization_id, item_id, asset_id)
  select p_org, v_id, a from unnest(coalesce(p_asset_ids, '{}')) a;

  return v_id;
end;
$$;

revoke execute on function public.save_item(uuid, uuid, jsonb, jsonb, uuid[]) from public, anon;
grant execute on function public.save_item(uuid, uuid, jsonb, jsonb, uuid[]) to authenticated;
