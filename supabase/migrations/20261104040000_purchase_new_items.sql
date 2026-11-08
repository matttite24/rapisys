-- Líneas que se convierten en producto al completar la factura. En el borrador solo se guarda la intención:
-- el código (número de parte) y el nombre ya editados. Al completar se crean los productos nuevos, con el
-- costo de este proveedor; si ya apareció un producto con ese número de parte, se usa ese en vez de duplicar.
-- `verified`: la persona confirmó que el producto emparejado es el correcto.

alter table public.purchase_lines add column create_item boolean not null default false;
alter table public.purchase_lines add column new_part_number text check (char_length(new_part_number) <= 60);
alter table public.purchase_lines add column new_name text check (char_length(new_name) <= 300);
alter table public.purchase_lines add column verified boolean not null default false;

create or replace function public.purchase_save_draft(
  p_contract_id uuid,
  p_id uuid,
  p_supplier_id uuid,
  p_number text,
  p_date date,
  p_notes text,
  p_lines jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contract public.contracts;
  v_purchase public.purchases;
  v_id uuid;
  v_elem jsonb;
  v_pos integer;
  v_item uuid;
  v_qty numeric;
  v_cost bigint;
  v_number text := nullif(trim(coalesce(p_number, '')), '');
begin
  select * into v_contract from public.contracts where id = p_contract_id for update;
  if v_contract.id is null or not public.has_role(v_contract.organization_id, array['admin', 'operator']::public.org_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_contract.status <> 'in_progress' then
    raise exception 'not_in_progress' using errcode = 'P0001';
  end if;
  if p_supplier_id is not null
     and not exists (select 1 from public.suppliers where id = p_supplier_id and organization_id = v_contract.organization_id) then
    raise exception 'bad_supplier' using errcode = '22023';
  end if;
  if p_date is null then
    raise exception 'bad_invoice' using errcode = '22023';
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) > 1000 then
    raise exception 'no_lines' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.purchases (organization_id, contract_id, supplier_id, number, purchased_on, notes, status)
    values (v_contract.organization_id, p_contract_id, p_supplier_id, v_number, p_date, nullif(trim(p_notes), ''), 'draft')
    returning id into v_id;
  else
    select * into v_purchase from public.purchases
    where id = p_id and contract_id = p_contract_id for update;
    if v_purchase.id is null then
      raise exception 'forbidden' using errcode = '42501';
    end if;
    if v_purchase.status <> 'draft' then
      raise exception 'not_draft' using errcode = 'P0001';
    end if;
    update public.purchases
    set supplier_id = p_supplier_id, number = v_number, purchased_on = p_date, notes = nullif(trim(p_notes), '')
    where id = p_id;
    delete from public.purchase_lines where purchase_id = p_id;
    v_id := p_id;
  end if;

  for v_elem, v_pos in select value, ordinality from jsonb_array_elements(p_lines) with ordinality loop
    v_item := (v_elem ->> 'item_id')::uuid;
    v_qty := (v_elem ->> 'quantity')::numeric;
    v_cost := (v_elem ->> 'unit_cost_cents')::bigint;
    if v_qty is null or v_qty <= 0 or v_cost is null or v_cost < 0 then
      raise exception 'bad_quantity' using errcode = '22023';
    end if;
    if v_item is not null
       and not exists (select 1 from public.items where id = v_item and organization_id = v_contract.organization_id) then
      raise exception 'bad_item' using errcode = '22023';
    end if;
    insert into public.purchase_lines
      (organization_id, purchase_id, item_id, quantity, unit_cost_cents, line_total_cents, vat_rate, xml_code, xml_description, position, create_item, new_part_number, new_name, verified)
    values
      (v_contract.organization_id, v_id, v_item, v_qty, v_cost, (v_elem ->> 'line_total_cents')::bigint,
       coalesce((v_elem ->> 'vat_rate')::numeric, 15), v_elem ->> 'xml_code', v_elem ->> 'xml_description', v_pos,
       coalesce((v_elem ->> 'create_item')::boolean, false) and v_item is null,
       nullif(trim(v_elem ->> 'new_part_number'), ''), nullif(trim(v_elem ->> 'new_name'), ''),
       coalesce((v_elem ->> 'verified')::boolean, false));
  end loop;
  return v_id;
end;
$$;


-- Completa el borrador: exige proveedor y número; crea los productos marcados y exige producto en todas las líneas.
create or replace function public.purchase_complete(p_purchase_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_purchase public.purchases;
  v_status public.contract_status;
  v_line public.purchase_lines;
  v_item uuid;
  v_name text;
  v_matches uuid[];
  v_made jsonb := '{}'::jsonb; -- número de parte (mayúsculas) -> producto creado en esta factura
begin
  select * into v_purchase from public.purchases where id = p_purchase_id for update;
  if v_purchase.id is null or not public.has_role(v_purchase.organization_id, array['admin', 'operator']::public.org_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select status into v_status from public.contracts where id = v_purchase.contract_id;
  if v_status <> 'in_progress' then
    raise exception 'not_in_progress' using errcode = 'P0001';
  end if;
  if v_purchase.status <> 'draft' then
    raise exception 'not_draft' using errcode = 'P0001';
  end if;
  if v_purchase.supplier_id is null then
    raise exception 'bad_supplier' using errcode = '22023';
  end if;
  if v_purchase.number is null then
    raise exception 'bad_invoice' using errcode = '22023';
  end if;
  if not exists (select 1 from public.purchase_lines where purchase_id = p_purchase_id) then
    raise exception 'no_lines' using errcode = '22023';
  end if;

  for v_line in
    select * from public.purchase_lines where purchase_id = p_purchase_id and item_id is null order by position
  loop
    v_name := coalesce(nullif(trim(v_line.new_name), ''), nullif(trim(v_line.xml_description), ''));
    if not v_line.create_item or v_name is null then
      raise exception 'bad_item' using errcode = '22023';
    end if;

    v_item := null;
    if v_line.new_part_number is not null then
      -- Ya creado por otra línea de esta factura, o ya existente en la bodega con ese número de parte.
      v_item := (v_made ->> upper(v_line.new_part_number))::uuid;
      if v_item is null then
        select array_agg(i.id) into v_matches
        from public.items i
        where i.organization_id = v_purchase.organization_id and i.is_active
          and (upper(i.sku) = upper(v_line.new_part_number)
               or exists (select 1 from unnest(i.part_numbers) x where upper(x) = upper(v_line.new_part_number)));
        if cardinality(v_matches) = 1 then
          v_item := v_matches[1];
        end if;
      end if;
    end if;

    if v_item is null then
      insert into public.items (organization_id, name, description, part_numbers)
      values (v_purchase.organization_id, v_name, nullif(trim(v_line.xml_description), ''),
              case when v_line.new_part_number is null then '{}' else array[v_line.new_part_number] end)
      returning id into v_item;
      if v_line.new_part_number is not null then
        v_made := v_made || jsonb_build_object(upper(v_line.new_part_number), v_item);
      end if;
      insert into public.item_supplier_prices (organization_id, item_id, supplier_id, unit_cost_cents, vat_rate, supplier_sku)
      values (v_purchase.organization_id, v_item, v_purchase.supplier_id, v_line.unit_cost_cents, v_line.vat_rate, v_line.new_part_number)
      on conflict (item_id, supplier_id) do nothing;
    end if;

    update public.purchase_lines set item_id = v_item, create_item = false where id = v_line.id;
  end loop;

  update public.purchases set status = 'complete' where id = p_purchase_id;
end;
$$;
