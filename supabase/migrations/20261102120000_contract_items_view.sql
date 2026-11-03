-- Todo lo que necesita la pantalla de Items en UNA sola llamada: listas con su conteo y los datos
-- de su activo, la lista abierta, su página de líneas (con búsqueda) y las claves de toda la lista
-- (para numerar y marcar repetidas). Antes eran varias consultas en cadena.
create function public.contract_items_view(
  p_contract_id uuid,
  p_list_id uuid,
  p_q text,
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
  v_total bigint := 0;
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

  if v_active is not null then
    select count(*) into v_total from public.contract_items ci
    where ci.list_id = v_active
      and (v_pattern is null or ci.part_number ilike v_pattern or ci.description ilike v_pattern);
  end if;

  return jsonb_build_object(
    'status', v_status,
    'active_id', v_active,
    'total', v_total,
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
    'lines', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.created_at, t.id)
      from (
        select ci.id, ci.list_id, ci.part_number, ci.description, ci.quantity, ci.unit, ci.cpc, ci.created_at
        from public.contract_items ci
        where ci.list_id = v_active
          and (v_pattern is null or ci.part_number ilike v_pattern or ci.description ilike v_pattern)
        order by ci.created_at, ci.id
        offset greatest(p_offset, 0) limit least(greatest(p_limit, 1), 500)
      ) t
    ), '[]'::jsonb),
    'keys', coalesce((
      select jsonb_agg(jsonb_build_object('id', k.id, 'part', k.part_number, 'description', k.description)
                       order by k.created_at, k.id)
      from (
        select ci.id, ci.part_number, ci.description, ci.created_at
        from public.contract_items ci
        where ci.list_id = v_active
        order by ci.created_at, ci.id
        limit 1000
      ) k
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.contract_items_view(uuid, uuid, text, integer, integer) from public, anon;
grant execute on function public.contract_items_view(uuid, uuid, text, integer, integer) to authenticated;
