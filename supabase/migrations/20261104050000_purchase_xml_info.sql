-- Datos de la factura electrónica del SRI que se cargó (autorización, clave de acceso, comprador, totales del XML),
-- para consultarlos y cuadrar contra ellos aunque el borrador se retome otro día.
alter table public.purchases add column xml_info jsonb check (jsonb_typeof(xml_info) = 'object');

-- La función gana un parámetro: se reemplaza la anterior para no dejar dos versiones.
drop function public.purchase_save_draft(uuid, uuid, uuid, text, date, text, jsonb);

create function public.purchase_save_draft(
  p_contract_id uuid,
  p_id uuid,
  p_supplier_id uuid,
  p_number text,
  p_date date,
  p_notes text,
  p_lines jsonb,
  p_xml jsonb default null
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
    insert into public.purchases (organization_id, contract_id, supplier_id, number, purchased_on, notes, status, xml_info)
    values (v_contract.organization_id, p_contract_id, p_supplier_id, v_number, p_date, nullif(trim(p_notes), ''), 'draft', p_xml)
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
    set supplier_id = p_supplier_id, number = v_number, purchased_on = p_date, notes = nullif(trim(p_notes), ''), xml_info = p_xml
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

revoke execute on function public.purchase_save_draft(uuid, uuid, uuid, text, date, text, jsonb, jsonb) from public, anon;
grant execute on function public.purchase_save_draft(uuid, uuid, uuid, text, date, text, jsonb, jsonb) to authenticated;
