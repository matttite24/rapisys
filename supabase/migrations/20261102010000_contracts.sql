-- Contratos y sus catálogos mínimos (clientes y responsables), todo por organización.

create type public.contract_status as enum (
  'new', 'in_progress', 'finished', 'invoiced', 'pending_payment', 'paid'
);

-- Instituciones a las que se vende.
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  ruc text,
  address text,
  created_at timestamptz not null default now(),
  unique (id, organization_id)
);
create index clients_org_idx on public.clients (organization_id);

-- Persona de contacto responsable del contrato.
create table public.contract_managers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  ruc text,
  address text,
  created_at timestamptz not null default now(),
  unique (id, organization_id)
);
create index contract_managers_org_idx on public.contract_managers (organization_id);

create table public.contracts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  code text not null check (length(trim(code)) > 0),
  name text not null check (length(trim(name)) > 0),
  client_id uuid not null,
  manager_id uuid not null,
  total_amount numeric(14, 2) not null check (total_amount >= 0), -- incluye IVA
  vat_rate numeric(5, 2) not null default 15 check (vat_rate >= 0),
  term_days integer not null check (term_days > 0),
  start_date date not null,
  status public.contract_status not null default 'new',
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  unique (organization_id, code),
  -- Garantiza que cliente y responsable pertenezcan a la misma organización.
  foreign key (client_id, organization_id) references public.clients (id, organization_id),
  foreign key (manager_id, organization_id) references public.contract_managers (id, organization_id)
);
create index contracts_org_idx on public.contracts (organization_id, created_at desc);

-- RLS: cualquier miembro lee; admin y operador escriben; solo admin borra.
do $$
declare
  t text;
begin
  foreach t in array array['clients', 'contract_managers', 'contracts']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "%1$s: miembros leen" on public.%1$I for select to authenticated using (public.is_member(organization_id))', t);
    execute format(
      'create policy "%1$s: admin y operador crean" on public.%1$I for insert to authenticated with check (public.has_role(organization_id, array[''admin'',''operator'']::public.org_role[]))', t);
    execute format(
      'create policy "%1$s: admin y operador editan" on public.%1$I for update to authenticated using (public.has_role(organization_id, array[''admin'',''operator'']::public.org_role[])) with check (public.has_role(organization_id, array[''admin'',''operator'']::public.org_role[]))', t);
    execute format(
      'create policy "%1$s: admin borra" on public.%1$I for delete to authenticated using (public.has_role(organization_id, array[''admin'']::public.org_role[]))', t);
  end loop;
end $$;
