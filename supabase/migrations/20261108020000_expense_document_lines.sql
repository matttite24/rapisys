-- Cada gasto pasa a ser un documento con detalle. Los registros existentes conservan monto y concepto.
alter table public.contract_expenses add constraint contract_expenses_id_org_key unique(id, organization_id);
create table public.contract_expense_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  expense_id uuid not null,
  position integer not null check (position between 0 and 99),
  concept text not null check (length(trim(concept)) between 1 and 200),
  category text not null check (category in ('food','transport','lodging','fuel','labor','supplies','other')),
  amount_cents bigint not null check (amount_cents between 1 and 10000000000),
  unique(expense_id, position),
  foreign key (expense_id, organization_id) references public.contract_expenses(id, organization_id) on delete cascade
);
alter table public.contract_expense_lines enable row level security;
create policy "contract_expense_lines: miembros leen" on public.contract_expense_lines
  for select to authenticated using (public.is_member(organization_id));
revoke all on public.contract_expense_lines from anon, authenticated;
grant select on public.contract_expense_lines to authenticated;
insert into public.contract_expense_lines(organization_id, expense_id, position, concept, category, amount_cents)
  select organization_id, id, 0, concept, category, amount_cents from public.contract_expenses;

-- Solo la función transaccional cambia encabezado/detalle: no pueden quedar totales desincronizados.
revoke insert, update on public.contract_expenses from authenticated;
create or replace function public.contract_expense_save(p_org_id uuid, p_contract_id uuid, p_id uuid, p_header jsonb, p_lines jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_total bigint;
  v_concept text;
  v_category text;
  v_count integer;
begin
  if not public.has_role(p_org_id, array['admin','operator']::public.org_role[]) then raise exception 'forbidden' using errcode = '42501'; end if;
  perform 1 from public.contracts where id = p_contract_id and organization_id = p_org_id for key share;
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then raise exception 'bad_lines'; end if;
  v_count := jsonb_array_length(p_lines);
  if v_count < 1 or v_count > 100 then raise exception 'bad_lines'; end if;
  select sum((r->>'amount_cents')::bigint),
    case when count(distinct r->>'category') = 1 then min(r->>'category') else 'other' end
    into v_total, v_category from jsonb_array_elements(p_lines) r;
  if v_total is null or v_total < 1 or v_total > 10000000000 then raise exception 'bad_amount'; end if;
  v_concept := case when v_count = 1 then trim(p_lines->0->>'concept')
    else left(trim(p_lines->0->>'concept'), 180) || ' · +' || (v_count - 1)::text end;
  if p_id is null then
    insert into public.contract_expenses(organization_id, contract_id, spent_on, concept, category, amount_cents, payee, payment_method, document_ref, document_url, notes)
    values (p_org_id, p_contract_id, (p_header->>'spent_on')::date, v_concept, v_category, v_total,
      coalesce(p_header->>'payee',''), p_header->>'payment_method', coalesce(p_header->>'document_ref',''), coalesce(p_header->>'document_url',''), coalesce(p_header->>'notes',''))
    returning id into v_id;
  else
    update public.contract_expenses set spent_on = (p_header->>'spent_on')::date, concept = v_concept,
      category = v_category, amount_cents = v_total, payee = coalesce(p_header->>'payee',''), payment_method = p_header->>'payment_method',
      document_ref = coalesce(p_header->>'document_ref',''), document_url = coalesce(p_header->>'document_url',''), notes = coalesce(p_header->>'notes','')
    where id = p_id and contract_id = p_contract_id and organization_id = p_org_id returning id into v_id;
    if not found then raise exception 'expense_not_found'; end if;
    delete from public.contract_expense_lines where expense_id = v_id;
  end if;
  insert into public.contract_expense_lines(organization_id, expense_id, position, concept, category, amount_cents)
    select p_org_id, v_id, ordinality - 1, trim(value->>'concept'), value->>'category', (value->>'amount_cents')::bigint
    from jsonb_array_elements(p_lines) with ordinality;
  return v_id;
end;
$$;
revoke execute on function public.contract_expense_save(uuid, uuid, uuid, jsonb, jsonb) from public, anon;
grant execute on function public.contract_expense_save(uuid, uuid, uuid, jsonb, jsonb) to authenticated;

create or replace function public.contract_expenses_view(p_contract_id uuid, p_q text, p_category text, p_offset integer, p_limit integer)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with all_expenses as (
    select e.*, coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'concept', l.concept, 'category', l.category, 'amount_cents', l.amount_cents) order by l.position)
      from public.contract_expense_lines l where l.expense_id = e.id), '[]'::jsonb) as lines
    from public.contract_expenses e where e.contract_id = p_contract_id
  ), filtered as (
    select * from all_expenses e
    where (nullif(p_category, '') is null or exists (select 1 from public.contract_expense_lines l where l.expense_id = e.id and l.category = p_category))
      and not exists (
        select 1 from unnest(regexp_split_to_array(coalesce(trim(p_q), ''), '\s+')) word
        where public.supply_norm(concat_ws(' ', e.payee, e.document_ref, e.notes, e.spent_on::text,
          (select string_agg(l.concept, ' ') from public.contract_expense_lines l where l.expense_id = e.id))) not like '%' || public.supply_norm(word) || '%'
      )
  ), page as (
    select * from filtered order by spent_on desc, created_at desc, id desc
    offset greatest(coalesce(p_offset, 0), 0) limit least(greatest(coalesce(p_limit, 25), 1), 100)
  )
  select jsonb_build_object(
    'version', 2,
    'rows', coalesce((select jsonb_agg(to_jsonb(p) - 'organization_id' - 'contract_id' - 'created_at' order by p.spent_on desc, p.created_at desc, p.id desc) from page p), '[]'::jsonb),
    'count', (select count(*) from filtered), 'total_cents', (select coalesce(sum(amount_cents), 0) from filtered),
    'all_count', (select count(*) from all_expenses), 'all_total_cents', (select coalesce(sum(amount_cents), 0) from all_expenses)
  );
$$;
