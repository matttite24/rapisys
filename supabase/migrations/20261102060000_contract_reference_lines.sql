-- Las líneas del contrato son la lista de referencia del cliente (términos de
-- referencia): descripción, cantidad y unidad. No apuntan al catálogo ni llevan
-- precio; ambos se completan después, al conciliar con bodega o compras.

alter table public.contract_items add column description text;
alter table public.contract_items add column unit text not null default 'unit';

-- Las líneas que ya existían toman el nombre de su item.
update public.contract_items ci
set description = i.name
from public.items i
where i.id = ci.item_id;
update public.contract_items set description = 'Sin descripción' where description is null;

alter table public.contract_items alter column description set not null;
alter table public.contract_items add check (char_length(description) between 1 and 500);

alter table public.contract_items alter column item_id drop not null;
alter table public.contract_items alter column unit_price_cents drop not null;
