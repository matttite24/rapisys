-- Las entregas son siempre de la línea completa, con la cantidad que pide el requerimiento: no hay
-- entregas parciales de un item. Solo se puede entregar una línea cuando todas sus unidades están en
-- stock (reservadas en bodega) y aún no se entregó.
-- p_lines: [{"line_id": "..."}, ...]  (la cantidad es siempre la de la línea)
create or replace function public.delivery_create(
  p_contract_id uuid,
  p_list_id uuid,
  p_date date,
  p_received_by text,
  p_notes text,
  p_lines jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contract public.contracts;
  v_number integer;
  v_id uuid;
  v_elem jsonb;
  v_line public.contract_items;
  v_reserved numeric;
  v_delivered numeric;
  v_seen uuid[] := '{}';
begin
  select * into v_contract from public.contracts where id = p_contract_id for update;
  if v_contract.id is null or not public.has_role(v_contract.organization_id, array['admin', 'operator']::public.org_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_contract.status <> 'in_progress' then
    raise exception 'not_in_progress' using errcode = 'P0001';
  end if;
  if p_date is null then
    raise exception 'bad_date' using errcode = '22023';
  end if;
  if not exists (select 1 from public.contract_lists where id = p_list_id and contract_id = p_contract_id) then
    raise exception 'list_not_found' using errcode = 'P0002';
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) not between 1 and 1000 then
    raise exception 'nothing_to_deliver' using errcode = '22023';
  end if;

  select coalesce(max(number), 0) + 1 into v_number from public.deliveries where contract_id = p_contract_id;
  insert into public.deliveries (organization_id, contract_id, list_id, number, delivered_on, received_by, notes)
  values (v_contract.organization_id, p_contract_id, p_list_id, v_number, p_date,
          nullif(trim(p_received_by), ''), nullif(trim(p_notes), ''))
  returning id into v_id;

  for v_elem in select * from jsonb_array_elements(p_lines) loop
    select * into v_line from public.contract_items
    where id = (v_elem ->> 'line_id')::uuid and list_id = p_list_id for update;
    if v_line.id is null then
      raise exception 'list_not_found' using errcode = 'P0002';
    end if;
    if v_line.id = any (v_seen) then
      raise exception 'duplicate_line' using errcode = '22023';
    end if;
    v_seen := v_seen || v_line.id;

    select coalesce(sum(quantity), 0) into v_reserved
    from public.supply_sources where contract_item_id = v_line.id and kind = 'bodega';
    select coalesce(sum(quantity), 0) into v_delivered from public.delivery_lines where contract_item_id = v_line.id;
    -- Línea completa en stock y sin entregar.
    if v_reserved < v_line.quantity or v_delivered > 0 then
      raise exception 'not_deliverable' using errcode = 'P0001';
    end if;

    insert into public.delivery_lines (organization_id, delivery_id, contract_item_id, quantity)
    values (v_contract.organization_id, v_id, v_line.id, v_line.quantity);
  end loop;

  return jsonb_build_object('id', v_id, 'number', v_number);
end;
$$;
