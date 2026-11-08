-- Búsqueda de la lista de Abastecimiento: encuentra por número de parte, descripción, CPC, n.º de línea y también por los
-- productos asignados a la línea (nombre, SKU y números de parte), ignorando mayúsculas, acentos y signos.

-- Texto comparable: minúsculas, sin acentos y solo letras y números.
create or replace function public.supply_norm(p_text text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select regexp_replace(translate(lower(coalesce(p_text, '')), 'áéíóúüñ', 'aeiouun'), '[^a-z0-9]+', '', 'g')
$$;

-- ¿La línea coincide con todas las palabras? Cada palabra puede estar en la línea o en alguno de sus productos asignados.
create or replace function public.supply_line_matches(
  p_line_id uuid,
  p_part text,
  p_desc text,
  p_cpc text,
  p_n bigint,
  p_words text[]
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select not exists (
    select 1
    from unnest(p_words) as w
    where not (
      public.supply_norm(coalesce(p_part, '') || ' ' || coalesce(p_desc, '') || ' ' || coalesce(p_cpc, '') || ' ' || p_n::text) like '%' || w || '%'
      or exists (
        select 1
        from public.supply_sources ss
        join public.items i on i.id = ss.item_id
        where ss.contract_item_id = p_line_id
          and public.supply_norm(i.name || ' ' || coalesce(i.sku, '') || ' ' || coalesce(array_to_string(i.part_numbers, ' '), '')) like '%' || w || '%'
      )
    )
  )
$$;

revoke execute on function public.supply_line_matches(uuid, text, text, text, bigint, text[]) from public, anon;
grant execute on function public.supply_line_matches(uuid, text, text, text, bigint, text[]) to authenticated;

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
