-- Entregas (reporte de entrega). A veces se entrega solo una parte de la lista: las líneas que ya
-- tienen stock completo. Cada entrega queda registrada con su número, fecha, quién recibe y las
-- líneas y cantidades entregadas, y no se puede entregar dos veces la misma unidad.

create table public.deliveries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  contract_id uuid not null,
  list_id uuid not null references public.contract_lists (id) on delete cascade,
  number integer not null check (number > 0),
  delivered_on date not null,
  received_by text check (char_length(received_by) <= 200),
  notes text check (char_length(notes) <= 500),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (contract_id, number),
  unique (id, organization_id),
  foreign key (contract_id, organization_id)
    references public.contracts (id, organization_id) on delete cascade
);
create index deliveries_list_idx on public.deliveries (list_id);

create table public.delivery_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  delivery_id uuid not null references public.deliveries (id) on delete cascade,
  contract_item_id uuid not null references public.contract_items (id) on delete cascade,
  quantity numeric(12, 2) not null check (quantity > 0),
  unique (delivery_id, contract_item_id)
);
create index delivery_lines_item_idx on public.delivery_lines (contract_item_id);

-- Solo lectura desde la API; se crean con la función de abajo.
alter table public.deliveries enable row level security;
alter table public.delivery_lines enable row level security;
create policy "deliveries: miembros leen" on public.deliveries
  for select to authenticated using (public.is_member(organization_id));
create policy "delivery_lines: miembros leen" on public.delivery_lines
  for select to authenticated using (public.is_member(organization_id));

-- Una línea con entregas no se puede borrar (ni su lista): el reporte perdería su respaldo.
create function public.contract_items_block_delivered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.delivery_lines where contract_item_id = old.id) then
    raise exception 'has_deliveries' using errcode = 'P0001';
  end if;
  return old;
end;
$$;
create trigger contract_items_block_delivered
  before delete on public.contract_items
  for each row execute function public.contract_items_block_delivered();

-- Una reserva ya entregada no se puede liberar: lo reservado no puede quedar por debajo de lo entregado.
create or replace function public.supply_release(p_source_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_src public.supply_sources;
  v_status public.contract_status;
  v_reserved numeric;
  v_delivered numeric;
begin
  select * into v_src from public.supply_sources where id = p_source_id for update;
  if v_src.id is null or not public.has_role(v_src.organization_id, array['admin', 'operator']::public.org_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select c.status into v_status
  from public.contract_items ci join public.contracts c on c.id = ci.contract_id
  where ci.id = v_src.contract_item_id;
  if v_status <> 'in_progress' then
    raise exception 'not_in_progress' using errcode = 'P0001';
  end if;

  select coalesce(sum(quantity), 0) into v_reserved from public.supply_sources where contract_item_id = v_src.contract_item_id;
  select coalesce(sum(quantity), 0) into v_delivered from public.delivery_lines where contract_item_id = v_src.contract_item_id;
  if v_reserved - v_src.quantity < v_delivered then
    raise exception 'already_delivered' using errcode = 'P0001';
  end if;

  update public.stock_lots set remaining_qty = remaining_qty + v_src.quantity where id = v_src.lot_id;
  insert into public.stock_movements (organization_id, lot_id, item_id, quantity, kind, contract_item_id, note)
  values (v_src.organization_id, v_src.lot_id, v_src.item_id, v_src.quantity, 'liberacion',
          v_src.contract_item_id, nullif(trim(p_note), ''));
  delete from public.supply_sources where id = p_source_id;
end;
$$;

-- Estado por línea: ahora con lo entregado. `delivered` (entregado por completo) pasa por encima.
create or replace view public.contract_item_supply with (security_invoker = true) as
select
  ci.id, ci.organization_id, ci.contract_id, ci.list_id,
  row_number() over (partition by ci.list_id order by ci.created_at, ci.id) as n,
  ci.part_number, ci.description, ci.quantity, ci.unit, ci.cpc, ci.created_at,
  coalesce(s.reserved, 0) as reserved,
  s.cost_cents,
  case
    when coalesce(d.delivered, 0) >= ci.quantity then 'delivered'
    when coalesce(s.reserved, 0) = 0 then 'pending'
    when s.reserved < ci.quantity then 'partial'
    else 'in_stock'
  end as state,
  coalesce(d.delivered, 0) as delivered
from public.contract_items ci
left join lateral (
  select
    sum(ss.quantity) as reserved,
    case when count(*) filter (where ss.unit_cost_cents is null) = 0
      then round(sum(ss.quantity * ss.unit_cost_cents) / sum(ss.quantity)) end as cost_cents
  from public.supply_sources ss
  where ss.contract_item_id = ci.id
) s on true
left join lateral (
  select sum(dl.quantity) as delivered from public.delivery_lines dl where dl.contract_item_id = ci.id
) d on true;

-- Crear una entrega: valida cada línea (lo entregable = reservado − ya entregado) y numera.
-- p_lines: [{"line_id": "...", "quantity": 2}, ...]
create function public.delivery_create(
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
  v_qty numeric;
  v_reserved numeric;
  v_delivered numeric;
  v_seen uuid[] := '{}';
begin
  -- Se bloquea el contrato: dos entregas simultáneas reciben números distintos.
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
    v_qty := (v_elem ->> 'quantity')::numeric;
    select * into v_line from public.contract_items
    where id = (v_elem ->> 'line_id')::uuid and list_id = p_list_id for update;
    if v_line.id is null then
      raise exception 'list_not_found' using errcode = 'P0002';
    end if;
    if v_line.id = any (v_seen) then
      raise exception 'duplicate_line' using errcode = '22023';
    end if;
    v_seen := v_seen || v_line.id;
    if v_qty is null or v_qty <= 0 then
      raise exception 'bad_quantity' using errcode = '22023';
    end if;

    select coalesce(sum(quantity), 0) into v_reserved from public.supply_sources where contract_item_id = v_line.id;
    select coalesce(sum(quantity), 0) into v_delivered from public.delivery_lines where contract_item_id = v_line.id;
    if v_qty > v_reserved - v_delivered then
      raise exception 'over_deliverable' using errcode = 'P0001';
    end if;

    insert into public.delivery_lines (organization_id, delivery_id, contract_item_id, quantity)
    values (v_contract.organization_id, v_id, v_line.id, v_qty);
  end loop;

  return jsonb_build_object('id', v_id, 'number', v_number);
end;
$$;
revoke execute on function public.delivery_create(uuid, uuid, date, text, text, jsonb) from public, anon;
grant execute on function public.delivery_create(uuid, uuid, date, text, text, jsonb) to authenticated;

-- La pantalla de Abastecimiento: ahora con el estado "entregado" y lo entregado por línea.
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
  v_pattern text;
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

  if v_term is not null then
    v_pattern := '%' || replace(replace(replace(v_term, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  select jsonb_build_object(
    'pending', count(*) filter (where state = 'pending'),
    'partial', count(*) filter (where state = 'partial'),
    'in_stock', count(*) filter (where state = 'in_stock'),
    'delivered', count(*) filter (where state = 'delivered')
  ) into v_counts
  from public.contract_item_supply where list_id = v_active;

  select count(*) into v_total from public.contract_item_supply v
  where v.list_id = v_active
    and (v_state is null or v.state = v_state)
    and (v_pattern is null or v.part_number ilike v_pattern or v.description ilike v_pattern);

  select coalesce(jsonb_agg(to_jsonb(t) order by t.n), '[]'::jsonb) into v_lines
  from (
    select v.id, v.list_id, v.n, v.part_number, v.description, v.quantity, v.unit, v.cpc,
           v.reserved, v.delivered, v.cost_cents, v.state
    from public.contract_item_supply v
    where v.list_id = v_active
      and (v_state is null or v.state = v_state)
      and (v_pattern is null or v.part_number ilike v_pattern or v.description ilike v_pattern)
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
