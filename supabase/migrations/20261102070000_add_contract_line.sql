-- Agrega una línea de referencia en una sola llamada: valida que el contrato
-- esté En ejecución e inserta. Corre con los permisos de quien llama (RLS).
create function public.add_contract_line(
  p_contract_id uuid,
  p_description text,
  p_quantity numeric,
  p_unit text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_org uuid;
  v_status public.contract_status;
  v_id uuid;
begin
  select organization_id, status into v_org, v_status
  from public.contracts where id = p_contract_id;

  if v_org is null then
    raise exception 'contract_not_found' using errcode = 'P0002';
  end if;
  if v_status <> 'in_progress' then
    raise exception 'not_in_progress' using errcode = 'P0001';
  end if;

  insert into public.contract_items (organization_id, contract_id, description, quantity, unit)
  values (v_org, p_contract_id, p_description, p_quantity, p_unit)
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.add_contract_line(uuid, text, numeric, text) from public, anon;
grant execute on function public.add_contract_line(uuid, text, numeric, text) to authenticated;
