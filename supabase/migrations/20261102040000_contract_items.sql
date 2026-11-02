-- Líneas de contrato: cada línea es un item del catálogo con cantidad, precio y fase.

create type public.item_phase as enum (
  'pending',    -- Pendiente
  'quoted',     -- Proformado
  'purchased',  -- Comprado
  'received',   -- Recibido (parcial o total, ver received_qty)
  'in_stock',   -- En stock completo
  'ready',      -- Listo para entrega
  'delivered'   -- Entregado
);

-- Necesario para referenciar contratos por (id, organización).
alter table public.contracts add unique (id, organization_id);

create table public.contract_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  contract_id uuid not null,
  item_id uuid not null,
  quantity numeric(12, 2) not null check (quantity > 0),
  unit_price numeric(14, 4) not null check (unit_price >= 0),     -- sin IVA
  vat_rate numeric(5, 2) not null default 15 check (vat_rate >= 0),
  phase public.item_phase not null default 'pending',
  received_qty numeric(12, 2) not null default 0,
  created_at timestamptz not null default now(),
  check (received_qty >= 0 and received_qty <= quantity),
  unique (contract_id, item_id),
  foreign key (contract_id, organization_id)
    references public.contracts (id, organization_id) on delete cascade,
  foreign key (item_id, organization_id)
    references public.items (id, organization_id)
);
create index contract_items_contract_idx on public.contract_items (contract_id);

alter table public.contract_items enable row level security;
create policy "contract_items: miembros leen" on public.contract_items
  for select to authenticated using (public.is_member(organization_id));
create policy "contract_items: admin y operador crean" on public.contract_items
  for insert to authenticated
  with check (public.has_role(organization_id, array['admin','operator']::public.org_role[]));
create policy "contract_items: admin y operador editan" on public.contract_items
  for update to authenticated
  using (public.has_role(organization_id, array['admin','operator']::public.org_role[]))
  with check (public.has_role(organization_id, array['admin','operator']::public.org_role[]));
create policy "contract_items: admin y operador borran" on public.contract_items
  for delete to authenticated
  using (public.has_role(organization_id, array['admin','operator']::public.org_role[]));
