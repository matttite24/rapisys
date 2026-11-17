-- Corregir una entrega ya registrada: fecha, quién recibe y notas. Sirve, por ejemplo, cuando se salió a entregar y no
-- recibieron, y se reprograma. No toca las líneas (para eso está anular). Solo mientras el proceso está en ejecución.
create or replace function public.delivery_update(p_delivery_id uuid, p_date date, p_received_by text, p_notes text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_delivery public.deliveries;
  v_status public.contract_status;
begin
  select * into v_delivery from public.deliveries where id = p_delivery_id for update;
  if v_delivery.id is null or not public.has_role(v_delivery.organization_id, array['admin', 'operator']::public.org_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select status into v_status from public.contracts where id = v_delivery.contract_id for update;
  if v_status <> 'in_progress' then raise exception 'not_in_progress' using errcode = 'P0001'; end if;
  if v_delivery.voided_at is not null then raise exception 'already_void' using errcode = 'P0001'; end if;
  if p_date is null then raise exception 'bad_date' using errcode = '22023'; end if;

  update public.deliveries set
    delivered_on = p_date,
    received_by = nullif(left(trim(coalesce(p_received_by, '')), 200), ''),
    notes = nullif(left(trim(coalesce(p_notes, '')), 500), '')
  where id = p_delivery_id;
end;
$$;
revoke execute on function public.delivery_update(uuid, date, text, text) from public, anon;
grant execute on function public.delivery_update(uuid, date, text, text) to authenticated;
