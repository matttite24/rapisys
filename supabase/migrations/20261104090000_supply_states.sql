-- Estados de una línea del contrato en Abastecimiento, por lo que tiene asignado (el recuento es por líneas):
--   Pendiente  : no hay nada asignado.
--   Por llegar : solo hay productos reservados que aún no llegan; cambia cuando se reciben.
--   Parcial    : ya hay algo en la bodega asignado, pero no completo.
--   En bodega  : todo asignado, desde la bodega (stock completo).
--   Entregado  : ya entregada.
-- Antes "Por llegar" exigía la línea completa y "Parcial" abarcaba cualquier cobertura incompleta; con varios productos por
-- línea esos filtros no reflejaban lo que muestra la lista.
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
