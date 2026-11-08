-- Precio referencial de cada línea del contrato: el valor TOTAL de la fila (sin IVA) que paga el cliente por ese item.
-- El valor unitario es este total ÷ la cantidad. Con él se calcula la utilidad por item: precio referencial − costo de compra.
-- Reemplaza al CPC en la pantalla de listas. La columna `cpc` se conserva en la base (las vistas de abastecimiento,
-- entregas y compras la siguen leyendo), pero ya no se llena ni se muestra.

alter table public.contract_items
  add column if not exists reference_price_cents bigint
  check (reference_price_cents is null or reference_price_cents between 0 and 10000000000);

-- Agregar una línea: ahora recibe el precio referencial en lugar del CPC.
drop function if exists public.add_contract_line(uuid, text, text, numeric, text, text);

create or replace function public.add_contract_line(
  p_list_id uuid,
  p_part_number text,
  p_description text,
  p_quantity numeric,
  p_unit text,
  p_reference_price_cents bigint default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_org uuid;
  v_contract uuid;
  v_status public.contract_status;
  v_id uuid;
begin
  select l.organization_id, l.contract_id, c.status into v_org, v_contract, v_status
  from public.contract_lists l
  join public.contracts c on c.id = l.contract_id
  where l.id = p_list_id
  for update of l;

  if v_org is null then
    raise exception 'list_not_found' using errcode = 'P0002';
  end if;
  if v_status <> 'in_progress' then
    raise exception 'not_in_progress' using errcode = 'P0001';
  end if;
  if (select count(*) from public.contract_items where list_id = p_list_id) >= 1000 then
    raise exception 'list_full' using errcode = 'P0001';
  end if;

  insert into public.contract_items
    (organization_id, contract_id, list_id, part_number, description, quantity, unit, reference_price_cents)
  values
    (v_org, v_contract, p_list_id, p_part_number, p_description, p_quantity, p_unit, p_reference_price_cents)
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.add_contract_line(uuid, text, text, numeric, text, bigint) from public, anon;
grant execute on function public.add_contract_line(uuid, text, text, numeric, text, bigint) to authenticated;

-- Carga masiva: cada fila puede traer `reference_price_cents`.
create or replace function public.add_contract_lines(p_list_id uuid, p_rows jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_org uuid;
  v_contract uuid;
  v_status public.contract_status;
  v_n integer;
begin
  select l.organization_id, l.contract_id, c.status into v_org, v_contract, v_status
  from public.contract_lists l
  join public.contracts c on c.id = l.contract_id
  where l.id = p_list_id
  for update of l;

  if v_org is null then
    raise exception 'list_not_found' using errcode = 'P0002';
  end if;
  if v_status <> 'in_progress' then
    raise exception 'not_in_progress' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) not between 1 and 500 then
    raise exception 'bad_rows' using errcode = '22023';
  end if;
  if (select count(*) from public.contract_items where list_id = p_list_id) + jsonb_array_length(p_rows) > 1000 then
    raise exception 'list_full' using errcode = 'P0001';
  end if;

  insert into public.contract_items
    (organization_id, contract_id, list_id, part_number, description, quantity, unit, reference_price_cents, created_at)
  select
    v_org, v_contract, p_list_id,
    nullif(t.elem ->> 'part_number', ''),
    t.elem ->> 'description',
    (t.elem ->> 'quantity')::numeric,
    t.elem ->> 'unit',
    nullif(t.elem ->> 'reference_price_cents', '')::bigint,
    clock_timestamp() + t.ord * interval '1 millisecond'
  from jsonb_array_elements(p_rows) with ordinality as t(elem, ord);

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
