-- Subtotal exacto por línea. El costo unitario se guarda en centavos y, en facturas con muchas unidades,
-- cantidad x costo redondeado no da el subtotal de la factura (el SRI redondea el total de la línea).
-- Si la línea trae line_total_cents, ese valor manda; si no (facturas manuales), se calcula como antes.
-- p_lines acepta además: "line_total_cents"?

alter table public.purchase_lines
  add column line_total_cents bigint check (line_total_cents >= 0 and line_total_cents <= 10000000000);

create or replace function public.purchase_create(
  p_contract_id uuid,
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
  v_id uuid;
  v_elem jsonb;
  v_pl uuid;
  v_qty numeric;
  v_assign numeric;
  v_line public.contract_items;
  v_covered numeric;
  v_cost bigint;
  v_item uuid;
begin
  select * into v_contract from public.contracts where id = p_contract_id for update;
  if v_contract.id is null or not public.has_role(v_contract.organization_id, array['admin', 'operator']::public.org_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_contract.status <> 'in_progress' then
    raise exception 'not_in_progress' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.suppliers where id = p_supplier_id and organization_id = v_contract.organization_id) then
    raise exception 'bad_supplier' using errcode = '22023';
  end if;
  if p_number is null or char_length(trim(p_number)) = 0 or p_date is null then
    raise exception 'bad_invoice' using errcode = '22023';
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) not between 1 and 300 then
    raise exception 'no_lines' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.purchases
    where contract_id = p_contract_id and supplier_id = p_supplier_id and lower(number) = lower(trim(p_number))
  ) then
    raise exception 'duplicate_invoice' using errcode = 'P0001';
  end if;

  insert into public.purchases (organization_id, contract_id, supplier_id, number, purchased_on, notes)
  values (v_contract.organization_id, p_contract_id, p_supplier_id, trim(p_number), p_date, nullif(trim(p_notes), ''))
  returning id into v_id;

  for v_elem in select * from jsonb_array_elements(p_lines) loop
    v_item := (v_elem ->> 'item_id')::uuid;
    v_qty := (v_elem ->> 'quantity')::numeric;
    v_cost := (v_elem ->> 'unit_cost_cents')::bigint;
    if v_qty is null or v_qty <= 0 or v_cost is null or v_cost < 0 then
      raise exception 'bad_quantity' using errcode = '22023';
    end if;
    if not exists (select 1 from public.items where id = v_item and organization_id = v_contract.organization_id) then
      raise exception 'bad_item' using errcode = '22023';
    end if;

    insert into public.purchase_lines (organization_id, purchase_id, item_id, quantity, unit_cost_cents, vat_rate, line_total_cents)
    values (v_contract.organization_id, v_id, v_item, v_qty, v_cost, coalesce((v_elem ->> 'vat_rate')::numeric, 15),
            (v_elem ->> 'line_total_cents')::bigint)
    returning id into v_pl;

    if v_elem ->> 'contract_item_id' is not null then
      v_assign := coalesce((v_elem ->> 'assign_qty')::numeric, v_qty);
      if v_assign <= 0 or v_assign > v_qty then
        raise exception 'over_assigned' using errcode = 'P0001';
      end if;
      select * into v_line from public.contract_items
      where id = (v_elem ->> 'contract_item_id')::uuid and contract_id = p_contract_id for update;
      if v_line.id is null then
        raise exception 'line_not_found' using errcode = 'P0002';
      end if;
      select coalesce(sum(quantity), 0) into v_covered from public.supply_sources where contract_item_id = v_line.id;
      if v_covered + v_assign > v_line.quantity then
        raise exception 'over_covered' using errcode = 'P0001';
      end if;
      insert into public.supply_sources
        (organization_id, contract_item_id, item_id, purchase_line_id, quantity, unit_cost_cents, supplier_id, kind)
      values
        (v_contract.organization_id, v_line.id, v_item, v_pl, v_assign, v_cost, p_supplier_id, 'compra');
    end if;
  end loop;
  return v_id;
end;
$$;

create or replace view public.purchase_totals with (security_invoker = true) as
select
  p.id as purchase_id, p.organization_id, p.contract_id,
  count(pl.id) as lines,
  coalesce(sum(pl.quantity), 0) as units,
  coalesce(sum(a.subtotal), 0)::bigint as subtotal_cents,
  coalesce(sum(a.vat), 0)::bigint as vat_cents,
  coalesce(sum(pl.quantity - coalesce(s.assigned, 0)), 0) as unassigned,
  coalesce(sum(pl.received_qty), 0) as received
from public.purchases p
left join public.purchase_lines pl on pl.purchase_id = p.id
left join lateral (select coalesce(pl.line_total_cents, round(pl.quantity * pl.unit_cost_cents)) as subtotal) sub on true
left join lateral (
  select sub.subtotal, round(sub.subtotal * round(pl.vat_rate * 100) / 10000) as vat
) a on true
left join lateral (
  select sum(ss.quantity) as assigned from public.supply_sources ss where ss.purchase_line_id = pl.id
) s on true
group by p.id;
