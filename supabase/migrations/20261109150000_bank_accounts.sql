-- Módulo de Bancos: cuentas bancarias de la organización, con un responsable de contrato asociado (opcional).
create table public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  bank text not null check (char_length(trim(bank)) between 1 and 100),
  account_type text not null check (account_type in ('checking', 'savings')),
  account_number text not null check (char_length(trim(account_number)) between 1 and 30),
  -- Monto inicial de la cuenta, en centavos.
  initial_cents bigint not null default 0 check (initial_cents between 0 and 10000000000),
  manager_id uuid,
  created_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (manager_id, organization_id)
    references public.contract_managers (id, organization_id) on delete set null (manager_id)
);
-- La misma cuenta no se registra dos veces en un banco.
create unique index bank_accounts_number_idx on public.bank_accounts (organization_id, lower(bank), lower(account_number));
create index bank_accounts_manager_idx on public.bank_accounts (manager_id);

alter table public.bank_accounts enable row level security;
create policy "bank_accounts: miembros leen" on public.bank_accounts
  for select to authenticated using (public.is_member(organization_id));
create policy "bank_accounts: admin y operador crean" on public.bank_accounts
  for insert to authenticated
  with check (public.has_role(organization_id, array['admin','operator']::public.org_role[]));
create policy "bank_accounts: admin y operador editan" on public.bank_accounts
  for update to authenticated
  using (public.has_role(organization_id, array['admin','operator']::public.org_role[]))
  with check (public.has_role(organization_id, array['admin','operator']::public.org_role[]));
create policy "bank_accounts: admin borra" on public.bank_accounts
  for delete to authenticated
  using (public.has_role(organization_id, array['admin']::public.org_role[]));
