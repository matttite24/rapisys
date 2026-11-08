-- Conciliación de facturas: reservar varias líneas de factura a la vez (todo o nada) y deshacerlo de una vez.
-- Cada reserva pasa por las mismas validaciones de purchase_assign.

-- p_items: [{"purchase_line_id", "line_id", "qty"}] -> ids de los tramos creados, en el mismo orden.
create function public.purchase_assign_many(p_items jsonb)
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_elem jsonb;
  v_ids uuid[] := '{}';
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 500 then
    raise exception 'bad_quantity' using errcode = '22023';
  end if;
  for v_elem in select * from jsonb_array_elements(p_items) loop
    v_ids := v_ids || public.purchase_assign(
      (v_elem ->> 'purchase_line_id')::uuid,
      (v_elem ->> 'line_id')::uuid,
      (v_elem ->> 'qty')::numeric
    );
  end loop;
  return v_ids;
end;
$$;

-- Quita varios tramos (todo o nada), como "Deshacer" de una reserva en bloque.
create function public.supply_release_many(p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  foreach v_id in array coalesce(p_ids, '{}') loop
    perform public.supply_release(v_id, '');
  end loop;
end;
$$;

revoke execute on function public.purchase_assign_many(jsonb) from public, anon;
revoke execute on function public.supply_release_many(uuid[]) from public, anon;
grant execute on function public.purchase_assign_many(jsonb) to authenticated;
grant execute on function public.supply_release_many(uuid[]) to authenticated;
