-- Abastecimiento, etapa 2: reservar existencias de la bodega para una línea del contrato.
-- Cada reserva toma unidades de UN lote (con su proveedor y costo) y las deja a nombre de la línea.

create table public.supply_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  contract_item_id uuid not null references public.contract_items (id) on delete cascade,
  item_id uuid not null,
  lot_id uuid not null,
  quantity numeric(12, 2) not null check (quantity > 0),
  -- Copia del lote al reservar: el costo de la línea no cambia si luego se ajusta el lote.
  unit_cost_cents bigint,
  supplier_id uuid,
  kind text not null default 'bodega' check (kind in ('bodega')),
  note text check (char_length(note) <= 300),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  foreign key (item_id, organization_id) references public.items (id, organization_id),
  foreign key (lot_id, organization_id) references public.stock_lots (id, organization_id)
);
create index supply_sources_line_idx on public.supply_sources (contract_item_id);
create index supply_sources_lot_idx on public.supply_sources (lot_id);

-- Solo lectura desde la API; las escrituras pasan por las funciones de abajo.
alter table public.supply_sources enable row level security;
create policy "supply_sources: miembros leen" on public.supply_sources
  for select to authenticated using (public.is_member(organization_id));

-- Estado de cada línea según lo reservado: pendiente (nada), parcial o en stock completo.
-- `n` es la posición de la línea en su lista (la misma que muestra Items).
create view public.contract_item_supply with (security_invoker = true) as
select
  ci.id, ci.organization_id, ci.contract_id, ci.list_id,
  row_number() over (partition by ci.list_id order by ci.created_at, ci.id) as n,
  ci.part_number, ci.description, ci.quantity, ci.unit, ci.cpc, ci.created_at,
  coalesce(s.reserved, 0) as reserved,
  s.cost_cents,
  case
    when coalesce(s.reserved, 0) = 0 then 'pending'
    when s.reserved < ci.quantity then 'partial'
    else 'in_stock'
  end as state
from public.contract_items ci
left join lateral (
  select
    sum(ss.quantity) as reserved,
    -- Costo unitario promedio ponderado; si algún tramo no tiene costo, se desconoce.
    case when count(*) filter (where ss.unit_cost_cents is null) = 0
      then round(sum(ss.quantity * ss.unit_cost_cents) / sum(ss.quantity)) end as cost_cents
  from public.supply_sources ss
  where ss.contract_item_id = ci.id
) s on true;

-- Reservar `p_qty` unidades de un lote para una línea del contrato.
create function public.supply_reserve(p_line_id uuid, p_lot_id uuid, p_qty numeric, p_note text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line public.contract_items;
  v_status public.contract_status;
  v_lot public.stock_lots;
  v_reserved numeric;
  v_id uuid;
begin
  -- Se bloquea la línea y el lote: dos reservas simultáneas no pasan de lo disponible ni de lo pedido.
  select * into v_line from public.contract_items where id = p_line_id for update;
  if v_line.id is null or not public.has_role(v_line.organization_id, array['admin', 'operator']::public.org_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select status into v_status from public.contracts where id = v_line.contract_id;
  if v_status <> 'in_progress' then
    raise exception 'not_in_progress' using errcode = 'P0001';
  end if;
  if p_qty is null or p_qty <= 0 then
    raise exception 'bad_quantity' using errcode = '22023';
  end if;

  select * into v_lot from public.stock_lots where id = p_lot_id for update;
  if v_lot.id is null or v_lot.organization_id <> v_line.organization_id then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_lot.remaining_qty < p_qty then
    raise exception 'insufficient' using errcode = 'P0001';
  end if;

  select coalesce(sum(quantity), 0) into v_reserved from public.supply_sources where contract_item_id = p_line_id;
  if v_reserved + p_qty > v_line.quantity then
    raise exception 'over_covered' using errcode = 'P0001';
  end if;

  update public.stock_lots set remaining_qty = remaining_qty - p_qty where id = p_lot_id;
  insert into public.stock_movements (organization_id, lot_id, item_id, quantity, kind, contract_item_id, note)
  values (v_lot.organization_id, p_lot_id, v_lot.item_id, -p_qty, 'reserva', p_line_id, nullif(trim(p_note), ''));
  insert into public.supply_sources
    (organization_id, contract_item_id, item_id, lot_id, quantity, unit_cost_cents, supplier_id, note)
  values
    (v_lot.organization_id, p_line_id, v_lot.item_id, p_lot_id, p_qty, v_lot.unit_cost_cents, v_lot.supplier_id,
     nullif(trim(p_note), ''))
  returning id into v_id;
  return v_id;
end;
$$;

-- Liberar una reserva: las unidades vuelven al lote del que salieron.
create function public.supply_release(p_source_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_src public.supply_sources;
  v_status public.contract_status;
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

  update public.stock_lots set remaining_qty = remaining_qty + v_src.quantity where id = v_src.lot_id;
  insert into public.stock_movements (organization_id, lot_id, item_id, quantity, kind, contract_item_id, note)
  values (v_src.organization_id, v_src.lot_id, v_src.item_id, v_src.quantity, 'liberacion',
          v_src.contract_item_id, nullif(trim(p_note), ''));
  delete from public.supply_sources where id = p_source_id;
end;
$$;

-- Si se borra una línea (o su lista, o el contrato), lo que tenía reservado vuelve a la bodega.
create function public.supply_release_on_line_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.supply_sources;
begin
  for s in select * from public.supply_sources where contract_item_id = old.id loop
    update public.stock_lots set remaining_qty = remaining_qty + s.quantity where id = s.lot_id;
    insert into public.stock_movements (organization_id, lot_id, item_id, quantity, kind, note)
    values (s.organization_id, s.lot_id, s.item_id, s.quantity, 'liberacion', 'La línea del contrato se eliminó');
  end loop;
  return old;
end;
$$;
create trigger contract_items_release_stock
  before delete on public.contract_items
  for each row execute function public.supply_release_on_line_delete();

-- La cantidad pedida no puede quedar por debajo de lo ya reservado.
create function public.contract_items_check_reserved()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.quantity < coalesce((select sum(quantity) from public.supply_sources where contract_item_id = new.id), 0) then
    raise exception 'below_reserved' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger contract_items_reserved_check
  before update of quantity on public.contract_items
  for each row execute function public.contract_items_check_reserved();

revoke execute on function public.supply_reserve(uuid, uuid, numeric, text) from public, anon;
revoke execute on function public.supply_release(uuid, text) from public, anon;
grant execute on function public.supply_reserve(uuid, uuid, numeric, text) to authenticated;
grant execute on function public.supply_release(uuid, text) to authenticated;

-- Todo lo que necesita la pantalla de Abastecimiento en UNA llamada: listas con su conteo y su
-- activo, la lista abierta, los contadores por estado, y la página de líneas (con búsqueda y filtro).
create function public.contract_supply_view(
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
    'in_stock', count(*) filter (where state = 'in_stock')
  ) into v_counts
  from public.contract_item_supply where list_id = v_active;

  select count(*) into v_total from public.contract_item_supply v
  where v.list_id = v_active
    and (v_state is null or v.state = v_state)
    and (v_pattern is null or v.part_number ilike v_pattern or v.description ilike v_pattern);

  select coalesce(jsonb_agg(to_jsonb(t) order by t.n), '[]'::jsonb) into v_lines
  from (
    select v.id, v.list_id, v.n, v.part_number, v.description, v.quantity, v.unit, v.cpc,
           v.reserved, v.cost_cents, v.state
    from public.contract_item_supply v
    where v.list_id = v_active
      and (v_state is null or v.state = v_state)
      and (v_pattern is null or v.part_number ilike v_pattern or v.description ilike v_pattern)
    order by v.n
    offset greatest(p_offset, 0) limit least(greatest(p_limit, 1), 500)
  ) t;

  return jsonb_build_object(
    'status', v_status,
    'active_id', v_active,
    'total', v_total,
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
revoke execute on function public.contract_supply_view(uuid, uuid, text, text, integer, integer) from public, anon;
grant execute on function public.contract_supply_view(uuid, uuid, text, text, integer, integer) to authenticated;
