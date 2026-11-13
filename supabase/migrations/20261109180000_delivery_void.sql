-- Anular una entrega: sus líneas vuelven a la bodega (quedan otra vez listas para entregar).
-- La entrega no se borra: queda marcada como anulada, con el motivo y una copia de lo que llevaba, para el historial.
-- Las líneas se quitan de delivery_lines, así que todo lo que cuenta lo entregado (estado de las líneas, finalizar,
-- utilidad por entrega) se corrige solo. El número de la entrega no se reutiliza.
alter table public.deliveries
  add column voided_at timestamptz,
  add column void_reason text check (void_reason is null or char_length(void_reason) <= 300),
  add column voided_lines jsonb;

create or replace function public.delivery_void(p_delivery_id uuid, p_reason text)
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

  update public.deliveries d set
    voided_at = now(),
    void_reason = nullif(left(trim(coalesce(p_reason, '')), 300), ''),
    voided_lines = coalesce((
      select jsonb_agg(jsonb_build_object(
        'part_number', ci.part_number, 'description', ci.description, 'quantity', dl.quantity, 'unit', ci.unit
      ) order by ci.created_at, ci.id)
      from public.delivery_lines dl
      join public.contract_items ci on ci.id = dl.contract_item_id
      where dl.delivery_id = d.id
    ), '[]'::jsonb)
  where d.id = p_delivery_id;
  delete from public.delivery_lines where delivery_id = p_delivery_id;
end;
$$;
revoke execute on function public.delivery_void(uuid, text) from public, anon;
grant execute on function public.delivery_void(uuid, text) to authenticated;

-- La revisión por entregas no muestra las anuladas.
create or replace function public.contract_profit_deliveries(p_contract_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with ln as (
    select
      ci.id,
      ci.reference_price_cents as ref,
      coalesce(round(sum(ss.quantity * ss.unit_cost_cents)), 0)::bigint as cost,
      count(ss.id) filter (where ss.unit_cost_cents is null) as unknown,
      count(ss.id) as sources
    from public.contract_items ci
    left join public.supply_sources ss on ss.contract_item_id = ci.id
    where ci.contract_id = p_contract_id
    group by ci.id
  )
  select coalesce(jsonb_agg(x order by x.number), '[]'::jsonb)
  from (
    select
      d.id, d.number, d.delivered_on, d.list_id, cl.name as list_name,
      count(dl.id) as lines,
      coalesce(sum(ln.ref) filter (where ln.ref is not null and ln.sources > 0), 0)::bigint as reference_cents,
      coalesce(sum(ln.cost) filter (where ln.ref is not null and ln.sources > 0), 0)::bigint as cost_cents,
      count(dl.id) filter (where ln.ref is null) as no_price,
      count(dl.id) filter (where ln.ref is not null and ln.sources = 0) as pending,
      count(dl.id) filter (where ln.ref is not null and ln.sources > 0 and ln.unknown > 0) as partial
    from public.deliveries d
    join public.contract_lists cl on cl.id = d.list_id
    left join public.delivery_lines dl on dl.delivery_id = d.id
    left join ln on ln.id = dl.contract_item_id
    where d.contract_id = p_contract_id and d.voided_at is null
    group by d.id, cl.name
  ) x
$$;
revoke execute on function public.contract_profit_deliveries(uuid) from public, anon;
grant execute on function public.contract_profit_deliveries(uuid) to authenticated;
