-- Gastos adicionales del contrato; las compras de productos siguen en Compras.
create table public.contract_expenses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contract_id uuid not null,
  spent_on date not null,
  concept text not null check (length(trim(concept)) between 1 and 200),
  category text not null check (category in ('food','transport','lodging','fuel','labor','supplies','other')),
  amount_cents bigint not null check (amount_cents between 1 and 10000000000),
  payee text not null default '' check (length(payee) <= 200),
  payment_method text not null check (payment_method in ('cash','transfer','card','other')),
  document_ref text not null default '' check (length(document_ref) <= 100),
  document_url text not null default '' check (length(document_url) <= 2000 and (document_url = '' or document_url ~ '^https?://[^[:space:]]+$')),
  notes text not null default '' check (length(notes) <= 2000),
  created_at timestamptz not null default now(),
  foreign key (contract_id, organization_id) references public.contracts(id, organization_id) on delete cascade
);
create index contract_expenses_contract_date_idx on public.contract_expenses(contract_id, spent_on desc, created_at desc, id desc);
alter table public.contract_expenses enable row level security;
create policy "contract_expenses: miembros leen" on public.contract_expenses
  for select to authenticated using (public.is_member(organization_id));
create policy "contract_expenses: operadores crean" on public.contract_expenses
  for insert to authenticated with check (public.has_role(organization_id, array['admin','operator']::public.org_role[]));
create policy "contract_expenses: operadores editan" on public.contract_expenses
  for update to authenticated using (public.has_role(organization_id, array['admin','operator']::public.org_role[]))
  with check (public.has_role(organization_id, array['admin','operator']::public.org_role[]));
create policy "contract_expenses: operadores borran" on public.contract_expenses
  for delete to authenticated using (public.has_role(organization_id, array['admin','operator']::public.org_role[]));
revoke all on public.contract_expenses from anon, authenticated;
grant select, insert, update, delete on public.contract_expenses to authenticated;

-- Total y página se calculan juntos. El total no queda limitado a las filas visibles.
create or replace function public.contract_expenses_view(
  p_contract_id uuid, p_q text, p_category text, p_offset integer, p_limit integer
) returns jsonb language sql stable security invoker set search_path = '' as $$
  with all_expenses as (
    select * from public.contract_expenses where contract_id = p_contract_id
  ), filtered as (
    select * from all_expenses e
    where (nullif(p_category, '') is null or e.category = p_category)
      and not exists (
        select 1 from unnest(regexp_split_to_array(coalesce(trim(p_q), ''), '\s+')) word
        where public.supply_norm(concat_ws(' ', e.concept, e.payee, e.document_ref, e.notes, e.spent_on::text))
          not like '%' || public.supply_norm(word) || '%'
      )
  ), page as (
    select * from filtered order by spent_on desc, created_at desc, id desc
    offset greatest(coalesce(p_offset, 0), 0) limit least(greatest(coalesce(p_limit, 25), 1), 100)
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(to_jsonb(p) - 'organization_id' - 'contract_id' - 'created_at' order by p.spent_on desc, p.created_at desc, p.id desc) from page p), '[]'::jsonb),
    'count', (select count(*) from filtered),
    'total_cents', (select coalesce(sum(amount_cents), 0) from filtered),
    'all_count', (select count(*) from all_expenses),
    'all_total_cents', (select coalesce(sum(amount_cents), 0) from all_expenses)
  );
$$;
revoke execute on function public.contract_expenses_view(uuid, text, text, integer, integer) from public, anon;
grant execute on function public.contract_expenses_view(uuid, text, text, integer, integer) to authenticated;
