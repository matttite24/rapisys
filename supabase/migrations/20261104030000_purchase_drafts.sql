-- Facturas en dos pasos: borrador (se revisa y se completa con calma, puede estar incompleto) y completa.
-- Un borrador no toca el abastecimiento: no se asigna ni se recibe. Las asignaciones se hacen después,
-- desde Abastecimiento, sobre facturas completas.

alter table public.purchases
  add column status text not null default 'complete' check (status in ('draft', 'complete'));
alter table public.purchases alter column supplier_id drop not null;
alter table public.purchases alter column number drop not null;
alter table public.purchase_lines alter column item_id drop not null;
-- Lo que decía el XML en cada línea (código y descripción del proveedor), para seguir revisando después.
-- Orden de las líneas tal como vienen en la factura.
alter table public.purchase_lines add column position integer not null default 0;
alter table public.purchase_lines add column xml_code text check (char_length(xml_code) <= 300);
alter table public.purchase_lines add column xml_description text check (char_length(xml_description) <= 300);

-- Un borrador no puede asignarse ni recibirse (aunque alguien llame las funciones directamente).
create function public.purchase_block_draft()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pl uuid;
begin
  if tg_table_name = 'supply_sources' then
    v_pl := new.purchase_line_id;
  elsif new.received_qty is distinct from old.received_qty then
    v_pl := new.id;
  end if;
  if v_pl is not null and exists (
    select 1 from public.purchase_lines pl join public.purchases p on p.id = pl.purchase_id
    where pl.id = v_pl and p.status = 'draft'
  ) then
    raise exception 'draft_purchase' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger supply_sources_no_draft before insert on public.supply_sources
  for each row execute function public.purchase_block_draft();
create trigger purchase_lines_no_draft before update of received_qty on public.purchase_lines
  for each row execute function public.purchase_block_draft();

-- Guarda (crea o reemplaza) un borrador completo. p_id null = borrador nuevo.
-- p_lines: [{"item_id"?, "quantity", "unit_cost_cents", "line_total_cents"?, "vat_rate", "xml_code"?, "xml_description"?}]
create function public.purchase_save_draft(
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
      (organization_id, purchase_id, item_id, quantity, unit_cost_cents, line_total_cents, vat_rate, xml_code, xml_description, position)
    values
      (v_contract.organization_id, v_id, v_item, v_qty, v_cost, (v_elem ->> 'line_total_cents')::bigint,
       coalesce((v_elem ->> 'vat_rate')::numeric, 15), v_elem ->> 'xml_code', v_elem ->> 'xml_description', v_pos);
  end loop;
  return v_id;
end;
$$;

-- Completa el borrador: exige proveedor, número y producto en todas las líneas. Desde aquí cuenta como compra.
create function public.purchase_complete(p_purchase_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_purchase public.purchases;
  v_status public.contract_status;
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
  if exists (select 1 from public.purchase_lines where purchase_id = p_purchase_id and item_id is null) then
    raise exception 'bad_item' using errcode = '22023';
  end if;
  update public.purchases set status = 'complete' where id = p_purchase_id;
end;
$$;

revoke execute on function public.purchase_save_draft(uuid, uuid, uuid, text, date, text, jsonb) from public, anon;
revoke execute on function public.purchase_complete(uuid) from public, anon;
grant execute on function public.purchase_save_draft(uuid, uuid, uuid, text, date, text, jsonb) to authenticated;
grant execute on function public.purchase_complete(uuid) to authenticated;
