-- Historial de gestiones por línea. Solo se agregan registros; no se pierde el seguimiento al comprar.
create table public.line_quotations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contract_item_id uuid not null references public.contract_items(id) on delete cascade,
  supplier text not null default '' check (length(supplier) <= 200),
  contact text not null default '' check (length(contact) <= 300),
  note text not null check (length(trim(note)) between 1 and 5000),
  unit_cost_cents bigint check (unit_cost_cents between 0 and 10000000000),
  availability text not null default '' check (length(availability) <= 300),
  lead_time text not null default '' check (length(lead_time) <= 300),
  proforma_url text not null default '' check (length(proforma_url) <= 2000 and (proforma_url = '' or proforma_url ~ '^https?://[^[:space:]]+$')),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index line_quotations_history_idx on public.line_quotations(contract_item_id, created_at desc, id desc);
alter table public.line_quotations enable row level security;
create policy "line_quotations: miembros leen" on public.line_quotations
  for select to authenticated using (public.is_member(organization_id));
revoke all on public.line_quotations from anon, authenticated;
grant select on public.line_quotations to authenticated;

create or replace function public.line_quotation_add(
  p_org_id uuid, p_contract_id uuid, p_line_id uuid,
  p_supplier text, p_contact text, p_note text, p_unit_cost_cents bigint,
  p_availability text, p_lead_time text, p_proforma_url text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.contract_status;
  v_id uuid;
begin
  if not public.has_role(p_org_id, array['admin','operator']::public.org_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select c.status into v_status from public.contracts c
    where c.id = p_contract_id and c.organization_id = p_org_id for update;
  if v_status is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_status <> 'in_progress' then raise exception 'not_in_progress'; end if;
  perform 1 from public.contract_items ci
    where ci.id = p_line_id and ci.contract_id = p_contract_id and ci.organization_id = p_org_id for update;
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into public.line_quotations (
    organization_id, contract_item_id, supplier, contact, note, unit_cost_cents, availability, lead_time, proforma_url
  ) values (
    p_org_id, p_line_id, trim(p_supplier), trim(p_contact), trim(p_note), p_unit_cost_cents,
    trim(p_availability), trim(p_lead_time), trim(p_proforma_url)
  ) returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.line_quotation_add(uuid, uuid, uuid, text, text, text, bigint, text, text, text) from public, anon;
grant execute on function public.line_quotation_add(uuid, uuid, uuid, text, text, text, bigint, text, text, text) to authenticated;

-- La gestión no suma unidades ni costos de compra. Los estados de abastecimiento avanzado tienen prioridad.
create or replace view public.contract_item_supply with (security_invoker = true) as
select
  ci.id, ci.organization_id, ci.contract_id, ci.list_id,
  row_number() over (partition by ci.list_id order by ci.created_at, ci.id) as n,
  ci.part_number, ci.description, ci.quantity, ci.unit, ci.cpc, ci.created_at,
  coalesce(s.reserved, 0) as reserved,
  s.cost_cents,
  case
    when coalesce(d.delivered, 0) >= ci.quantity then 'delivered'
    when coalesce(s.reserved, 0) >= ci.quantity then 'in_stock'
    when coalesce(s.reserved, 0) > 0 then 'partial'
    when coalesce(s.purchased, 0) > 0 then 'purchased'
    when exists (select 1 from public.line_quotations q where q.contract_item_id = ci.id) then 'quoted'
    else 'pending'
  end as state,
  coalesce(d.delivered, 0) as delivered,
  coalesce(s.purchased, 0) as purchased
from public.contract_items ci
left join lateral (
  select
    sum(ss.quantity) filter (where ss.kind = 'bodega') as reserved,
    sum(ss.quantity) filter (where ss.kind = 'compra') as purchased,
    case when count(*) filter (where ss.unit_cost_cents is null) = 0
      then round(sum(ss.quantity * ss.unit_cost_cents) / sum(ss.quantity)) end as cost_cents
  from public.supply_sources ss
  where ss.contract_item_id = ci.id
) s on true
left join lateral (
  select sum(dl.quantity) as delivered from public.delivery_lines dl where dl.contract_item_id = ci.id
) d on true;

create or replace function public.contract_supply_view(
  p_contract_id uuid,
  p_list_id uuid,
  p_q text,
  p_state text,
  p_offset integer,
  p_limit integer
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_status text;
  v_active uuid;
  v_term text := nullif(trim(coalesce(p_q, '')), '');
  v_words text[];
  v_state text := nullif(p_state, '');
  v_counts jsonb;
  v_total bigint := 0;
  v_lines jsonb;
  v_deliveries bigint;
begin
  select c.status::text into v_status from public.contracts c where c.id = p_contract_id;
  if v_status is null then
    return null;
  end if;

  select l.id into v_active from public.contract_lists l
  where l.contract_id = p_contract_id and l.id = p_list_id;
  if v_active is null then
    select l.id into v_active from public.contract_lists l
    where l.contract_id = p_contract_id
    order by l.created_at, l.id limit 1;
  end if;

  -- La búsqueda parte el texto en palabras, sin importar mayúsculas, acentos ni signos ("1R-0716" = "1r0716"), y cada
  -- palabra debe aparecer en la línea (número de parte, descripción, CPC, n.º) o en un producto asignado a ella.
  if v_term is not null then
    select array_agg(public.supply_norm(w)) into v_words
    from unnest(regexp_split_to_array(v_term, '\s+')) as w
    where public.supply_norm(w) <> '';
  end if;

  select jsonb_build_object(
    'pending', count(*) filter (where state = 'pending'),
    'quoted', count(*) filter (where state = 'quoted'),
    'partial', count(*) filter (where state = 'partial'),
    'purchased', count(*) filter (where state = 'purchased'),
    'in_stock', count(*) filter (where state = 'in_stock'),
    'delivered', count(*) filter (where state = 'delivered')
  ) into v_counts
  from public.contract_item_supply where list_id = v_active;

  select count(*) into v_total from public.contract_item_supply v
  where v.list_id = v_active
    and (v_state is null or v.state = v_state)
    and (v_words is null or public.supply_line_matches(v.id, v.part_number, v.description, v.cpc, v.n, v_words));

  select coalesce(jsonb_agg(to_jsonb(t) order by t.n), '[]'::jsonb) into v_lines
  from (
    select v.id, v.list_id, v.n, v.part_number, v.description, v.quantity, v.unit, v.cpc,
           v.reserved, v.purchased, v.delivered, v.cost_cents, v.state
    from public.contract_item_supply v
    where v.list_id = v_active
      and (v_state is null or v.state = v_state)
      and (v_words is null or public.supply_line_matches(v.id, v.part_number, v.description, v.cpc, v.n, v_words))
    order by v.n
    offset greatest(p_offset, 0) limit least(greatest(p_limit, 1), 500)
  ) t;

  select count(*) into v_deliveries from public.deliveries where contract_id = p_contract_id;

  return jsonb_build_object(
    'status', v_status,
    'active_id', v_active,
    'total', v_total,
    'deliveries', v_deliveries,
    'counts', coalesce(v_counts, '{}'::jsonb),
    'lists', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', l.id,
          'asset_id', l.asset_id,
          'name', l.name,
          'count', (select count(*) from public.contract_items ci where ci.list_id = l.id),
          'asset', case when a.id is null then null else jsonb_build_object(
            'kind', a.kind, 'brand', a.brand, 'model', a.model,
            'serial', a.serial, 'engine', a.engine, 'identifier', a.identifier) end
        ) order by l.created_at, l.id)
      from public.contract_lists l
      left join public.assets a on a.id = l.asset_id and a.organization_id = l.organization_id
      where l.contract_id = p_contract_id
    ), '[]'::jsonb),
    'lines', v_lines
  );
end;
$$;
