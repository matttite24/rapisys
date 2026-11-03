-- Carga masiva: agrega muchas líneas a una lista en una sola llamada y una sola
-- transacción (o entran todas o ninguna). Corre con los permisos de quien llama (RLS).
create function public.add_contract_lines(p_list_id uuid, p_rows jsonb)
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
  where l.id = p_list_id;

  if v_org is null then
    raise exception 'list_not_found' using errcode = 'P0002';
  end if;
  if v_status <> 'in_progress' then
    raise exception 'not_in_progress' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) not between 1 and 500 then
    raise exception 'bad_rows' using errcode = '22023';
  end if;

  -- created_at crece por fila para conservar el orden en que llegaron.
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

revoke execute on function public.add_contract_lines(uuid, jsonb) from public, anon;
grant execute on function public.add_contract_lines(uuid, jsonb) to authenticated;
