-- Conciliación: una reserva en bloque puede salir de unidades que ya llegaron (un lote de la bodega) o de lo que
-- aún viene por llegar en la factura. Con "lot_id" se reserva ese lote; sin él se reserva "por llegar".
-- p_items: [{"purchase_line_id", "line_id", "qty", "lot_id"?}] -> ids de los tramos creados, en el mismo orden.
create or replace function public.purchase_assign_many(p_items jsonb)
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
    if v_elem ->> 'lot_id' is not null then
      v_ids := v_ids || public.supply_reserve(
        (v_elem ->> 'line_id')::uuid,
        (v_elem ->> 'lot_id')::uuid,
        (v_elem ->> 'qty')::numeric,
        ''
      );
    else
      v_ids := v_ids || public.purchase_assign(
        (v_elem ->> 'purchase_line_id')::uuid,
        (v_elem ->> 'line_id')::uuid,
        (v_elem ->> 'qty')::numeric
      );
    end if;
  end loop;
  return v_ids;
end;
$$;
