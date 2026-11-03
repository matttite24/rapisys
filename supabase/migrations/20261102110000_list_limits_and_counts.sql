-- Listas grandes: tope de 1.000 líneas por lista y conteo por lista en una consulta.

-- Cuántas líneas tiene cada lista del contrato (la pantalla solo carga la lista abierta).
create function public.contract_list_counts(p_contract_id uuid)
returns table (list_id uuid, n bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select ci.list_id, count(*) from public.contract_items ci
  where ci.contract_id = p_contract_id
  group by ci.list_id;
$$;
revoke execute on function public.contract_list_counts(uuid) from public, anon;
grant execute on function public.contract_list_counts(uuid) to authenticated;

-- Agregar una línea: ahora revisa el tope. `for update` bloquea la lista mientras tanto,
-- así dos altas simultáneas no pasan del tope.
create or replace function public.add_contract_line(
  p_list_id uuid,
  p_part_number text,
  p_description text,
  p_quantity numeric,
  p_unit text,
  p_cpc text
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
    (organization_id, contract_id, list_id, part_number, description, quantity, unit, cpc)
  values
    (v_org, v_contract, p_list_id, p_part_number, p_description, p_quantity, p_unit, p_cpc)
  returning id into v_id;
  return v_id;
end;
$$;

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
    (organization_id, contract_id, list_id, part_number, description, quantity, unit, cpc, created_at)
  select
    v_org, v_contract, p_list_id,
    nullif(t.elem ->> 'part_number', ''),
    t.elem ->> 'description',
    (t.elem ->> 'quantity')::numeric,
    t.elem ->> 'unit',
    nullif(t.elem ->> 'cpc', ''),
    clock_timestamp() + t.ord * interval '1 millisecond'
  from jsonb_array_elements(p_rows) with ordinality as t(elem, ord);

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
