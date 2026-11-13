-- Reporte de cobro: ajustes por línea de una entrega, hechos en Revisión.
--  * margin_percent: margen aplicado distinto al real (si es null, se usa el valor final tal como está).
--  * excluded: la línea se omite del cálculo.
-- Son solo para el reporte de cobro: no cambian precios, márgenes de productos ni nada de lo anterior.
create table public.billing_adjustments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  delivery_id uuid not null references public.deliveries (id) on delete cascade,
  contract_item_id uuid not null references public.contract_items (id) on delete cascade,
  margin_percent numeric(7, 2) check (margin_percent is null or margin_percent between 0 and 1000),
  excluded boolean not null default false,
  updated_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  unique (delivery_id, contract_item_id),
  check (margin_percent is not null or excluded)
);
create index billing_adjustments_item_idx on public.billing_adjustments (contract_item_id);

alter table public.billing_adjustments enable row level security;
create policy "billing_adjustments: miembros leen" on public.billing_adjustments
  for select to authenticated using (public.is_member(organization_id));
create policy "billing_adjustments: admin y operador crean" on public.billing_adjustments
  for insert to authenticated with check (public.has_role(organization_id, array['admin','operator']::public.org_role[]));
create policy "billing_adjustments: admin y operador editan" on public.billing_adjustments
  for update to authenticated
  using (public.has_role(organization_id, array['admin','operator']::public.org_role[]))
  with check (public.has_role(organization_id, array['admin','operator']::public.org_role[]));
create policy "billing_adjustments: admin y operador borran" on public.billing_adjustments
  for delete to authenticated using (public.has_role(organization_id, array['admin','operator']::public.org_role[]));

-- Líneas de una entrega para el reporte de cobro: costo con IVA (lo realmente pagado), el ajuste de cada línea, su valor
-- final y los totales de TODAS las líneas incluidas (no solo de la página). Con margen ajustado, valor final = costo × (1 + margen).
create or replace function public.contract_billing_lines(p_delivery_id uuid, p_offset integer, p_limit integer)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with base as (
    select
      ci.id,
      ci.created_at,
      ci.part_number,
      ci.description,
      ci.quantity,
      ci.unit,
      ci.reference_price_cents as reference_cents,
      coalesce(round(sum(ss.quantity * ss.unit_cost_cents * (100 + coalesce(pl.vat_rate, 15)) / 100)), 0)::bigint as cost_cents,
      count(ss.id) filter (where ss.unit_cost_cents is null) as unknown,
      count(ss.id) as sources,
      ba.margin_percent as margin_override,
      coalesce(ba.excluded, false) as excluded
    from public.delivery_lines dl
    join public.contract_items ci on ci.id = dl.contract_item_id
    left join public.supply_sources ss on ss.contract_item_id = ci.id
    left join public.stock_lots sl on sl.id = ss.lot_id
    left join public.purchase_lines pl on pl.id = coalesce(ss.purchase_line_id, sl.purchase_line_id)
    left join public.billing_adjustments ba on ba.delivery_id = dl.delivery_id and ba.contract_item_id = ci.id
    where dl.delivery_id = p_delivery_id
    group by ci.id, ba.margin_percent, ba.excluded
  ),
  calc as (
    select b.*,
      case
        when b.margin_override is not null and b.sources > 0
          then round(b.cost_cents * (10000 + round(b.margin_override * 100)) / 10000)::bigint
        else b.reference_cents
      end as final_cents
    from base b
  )
  select jsonb_build_object(
    'total', (select count(*) from calc),
    'totals', (
      select jsonb_build_object(
        'cost_cents', coalesce(sum(cost_cents) filter (where ok), 0)::bigint,
        'final_cents', coalesce(sum(final_cents) filter (where ok), 0)::bigint,
        'included', count(*) filter (where not excluded),
        'excluded', count(*) filter (where excluded),
        'uncalculated', count(*) filter (where not excluded and not ok)
      )
      from (select *, (not excluded and sources > 0 and final_cents is not null) as ok from calc) c
    ),
    'lines', coalesce((
      select jsonb_agg(t order by t.created_at, t.id)
      from (
        select id, created_at, part_number, description, quantity, unit, reference_cents, cost_cents, unknown, sources,
               margin_override, excluded, final_cents
        from calc
        order by created_at, id
        offset greatest(p_offset, 0)
        limit least(greatest(p_limit, 1), 200)
      ) t
    ), '[]'::jsonb)
  )
$$;
revoke execute on function public.contract_billing_lines(uuid, integer, integer) from public, anon;
grant execute on function public.contract_billing_lines(uuid, integer, integer) to authenticated;
