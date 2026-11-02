-- 1) Dinero en centavos enteros ($10 = 1000), sin decimales.
-- 2) Cierres de seguridad e integridad detectados en la auditoría.

-- ------------------------------------------------------------ centavos
-- Los montos existentes se convierten a centavos (los costos con 4 decimales se redondean).
alter table public.contracts
  alter column total_amount type bigint using round(total_amount * 100)::bigint;
alter table public.contracts rename column total_amount to total_cents;

alter table public.contract_items
  alter column unit_price type bigint using round(unit_price * 100)::bigint;
alter table public.contract_items rename column unit_price to unit_price_cents;

alter table public.item_supplier_prices
  alter column unit_cost type bigint using round(unit_cost * 100)::bigint;
alter table public.item_supplier_prices rename column unit_cost to unit_cost_cents;

-- Tope por monto: $100.000.000 (10.000.000.000 centavos).
alter table public.contracts add check (total_cents <= 10000000000);
alter table public.contract_items add check (unit_price_cents <= 10000000000);
alter table public.item_supplier_prices add check (unit_cost_cents <= 10000000000);
alter table public.items add check (margin_percent <= 1000);

-- save_item recibe los costos en centavos.
drop function public.save_item(uuid, uuid, jsonb, jsonb, uuid[]);
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

revoke execute on function public.save_item(uuid, uuid, jsonb, jsonb, uuid[]) from public, anon;
grant execute on function public.save_item(uuid, uuid, jsonb, jsonb, uuid[]) to authenticated;

-- ------------------------------------------------ membresías: solo el rol
-- Un administrador podía cambiar user_id y meter a otra cuenta sin invitación.
revoke update on public.memberships from authenticated;
grant update (role) on public.memberships to authenticated;

-- ------------------------------------- fase y unidades recibidas coherentes
-- Desde "En stock" todas las unidades deben estar recibidas.
update public.contract_items
set phase = 'received'
where phase in ('in_stock', 'ready', 'delivered') and received_qty < quantity;

alter table public.contract_items
  add constraint contract_items_full_receipt_check
  check (phase in ('pending', 'quoted', 'purchased', 'received') or received_qty = quantity);

-- --------------------------------------- nombres reservados de organización
create or replace function public.create_organization(p_name text, p_slug text)
returns public.organizations
language plpgsql security definer set search_path = ''
as $$
declare
  org public.organizations;
  v_slug text := lower(trim(p_slug));
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  if not public.can_create_organization() then
    raise exception 'Necesitas una invitación para unirte a una organización';
  end if;
  -- Rutas de primer nivel de la aplicación: una organización no puede llamarse así.
  if v_slug in ('login', 'signup', 'auth', 'onboarding', 'invitacion', 'api') then
    raise exception 'Ese nombre está reservado';
  end if;

  insert into public.organizations (name, slug, created_by)
  values (trim(p_name), v_slug, auth.uid())
  returning * into org;

  insert into public.memberships (organization_id, user_id, role)
  values (org.id, auth.uid(), 'admin');

  insert into public.org_creators (user_id) values (auth.uid()) on conflict do nothing;

  return org;
end;
$$;
