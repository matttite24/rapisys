-- Pagos: movimientos de las facturas de compra y anticipos a proveedores.
--  * purchase_payments: dentro de cada factura. kind = 'payment' (pago), 'credit' (registro a crédito, con vencimiento)
--    o 'advance' (aplicación de un anticipo a la factura).
--  * supplier_advances: anticipo entregado a un proveedor, sin factura; se aplica después a una o varias facturas.
-- Ninguno de estos movimientos cambia la utilidad: el costo de la compra ya cuenta en la factura. Solo los gastos la restan.

create table public.supplier_advances (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  contract_id uuid not null,
  supplier_id uuid not null,
  paid_on date not null,
  amount_cents bigint not null check (amount_cents between 1 and 10000000000),
  method text not null check (method in ('cash', 'transfer', 'check', 'card', 'other')),
  bank_account_id uuid,
  reference text not null default '' check (char_length(reference) <= 100),
  notes text not null default '' check (char_length(notes) <= 500),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (contract_id, organization_id) references public.contracts (id, organization_id) on delete cascade,
  foreign key (supplier_id, organization_id) references public.suppliers (id, organization_id),
  foreign key (bank_account_id, organization_id) references public.bank_accounts (id, organization_id) on delete set null (bank_account_id)
);
create index supplier_advances_contract_idx on public.supplier_advances (contract_id, paid_on desc);

create table public.purchase_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  purchase_id uuid not null references public.purchases (id) on delete cascade,
  kind text not null check (kind in ('payment', 'credit', 'advance')),
  amount_cents bigint not null check (amount_cents between 1 and 10000000000),
  moved_on date not null,
  due_on date,
  method text check (method is null or method in ('cash', 'transfer', 'check', 'card', 'other')),
  bank_account_id uuid,
  advance_id uuid references public.supplier_advances (id),
  reference text not null default '' check (char_length(reference) <= 100),
  notes text not null default '' check (char_length(notes) <= 500),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  foreign key (bank_account_id, organization_id) references public.bank_accounts (id, organization_id) on delete set null (bank_account_id),
  check ((kind = 'credit') = (due_on is not null)),
  check ((kind = 'advance') = (advance_id is not null)),
  check (kind <> 'payment' or method is not null)
);
create index purchase_payments_purchase_idx on public.purchase_payments (purchase_id, moved_on, created_at);
create index purchase_payments_advance_idx on public.purchase_payments (advance_id) where advance_id is not null;

alter table public.supplier_advances enable row level security;
alter table public.purchase_payments enable row level security;
create policy "supplier_advances: miembros leen" on public.supplier_advances
  for select to authenticated using (public.is_member(organization_id));
create policy "supplier_advances: admin y operador crean" on public.supplier_advances
  for insert to authenticated with check (public.has_role(organization_id, array['admin','operator']::public.org_role[]));
create policy "supplier_advances: admin y operador borran" on public.supplier_advances
  for delete to authenticated using (public.has_role(organization_id, array['admin','operator']::public.org_role[]));
create policy "purchase_payments: miembros leen" on public.purchase_payments
  for select to authenticated using (public.is_member(organization_id));
create policy "purchase_payments: admin y operador borran" on public.purchase_payments
  for delete to authenticated using (public.has_role(organization_id, array['admin','operator']::public.org_role[]));
-- Los movimientos de factura se crean solo con la función de abajo (valida que no pase del total de la factura).

create or replace function public.purchase_movement_add(
  p_purchase_id uuid,
  p_kind text,
  p_amount_cents bigint,
  p_moved_on date,
  p_due_on date,
  p_method text,
  p_bank_account_id uuid,
  p_advance_id uuid,
  p_reference text,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_purchase public.purchases;
  v_total bigint;
  v_used bigint;
  v_adv public.supplier_advances;
  v_adv_used bigint;
  v_id uuid;
begin
  select * into v_purchase from public.purchases where id = p_purchase_id for update;
  if v_purchase.id is null or not public.has_role(v_purchase.organization_id, array['admin', 'operator']::public.org_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_purchase.status <> 'complete' then raise exception 'purchase_draft' using errcode = 'P0001'; end if;
  if p_kind not in ('payment', 'credit', 'advance') then raise exception 'bad_kind' using errcode = '22023'; end if;
  if p_amount_cents is null or p_amount_cents <= 0 then raise exception 'bad_amount' using errcode = '22023'; end if;

  -- Total de la factura (con IVA) y lo ya registrado: pagos, créditos y anticipos aplicados no pasan del total.
  select coalesce(subtotal_cents, 0) + coalesce(vat_cents, 0) into v_total from public.purchase_totals where purchase_id = p_purchase_id;
  select coalesce(sum(amount_cents), 0) into v_used from public.purchase_payments where purchase_id = p_purchase_id;
  if v_used + p_amount_cents > coalesce(v_total, 0) then raise exception 'over_paid' using errcode = 'P0001'; end if;

  if p_kind = 'advance' then
    select * into v_adv from public.supplier_advances where id = p_advance_id for update;
    if v_adv.id is null or v_adv.organization_id <> v_purchase.organization_id
       or v_adv.contract_id <> v_purchase.contract_id or v_adv.supplier_id <> v_purchase.supplier_id then
      raise exception 'bad_advance' using errcode = 'P0001';
    end if;
    select coalesce(sum(amount_cents), 0) into v_adv_used from public.purchase_payments where advance_id = v_adv.id;
    if v_adv_used + p_amount_cents > v_adv.amount_cents then raise exception 'over_advance' using errcode = 'P0001'; end if;
  end if;

  insert into public.purchase_payments
    (organization_id, purchase_id, kind, amount_cents, moved_on, due_on, method, bank_account_id, advance_id, reference, notes)
  values
    (v_purchase.organization_id, p_purchase_id, p_kind, p_amount_cents, p_moved_on,
     case when p_kind = 'credit' then p_due_on end,
     case when p_kind = 'payment' then p_method end,
     case when p_kind = 'payment' then p_bank_account_id end,
     case when p_kind = 'advance' then p_advance_id end,
     coalesce(trim(p_reference), ''), coalesce(trim(p_notes), ''))
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.purchase_movement_add(uuid, text, bigint, date, date, text, uuid, uuid, text, text) from public, anon;
grant execute on function public.purchase_movement_add(uuid, text, bigint, date, date, text, uuid, uuid, text, text) to authenticated;

-- Lista de Pagos del contrato: gastos, pagos de facturas, créditos y anticipos, juntos. `p_kind` filtra por tipo
-- ('expense', 'payment', 'credit', 'advance'); vacío = todos. Los anticipos aplicados a una factura no se repiten aquí
-- (el dinero salió con el anticipo). Los recuentos y totales por tipo salen siempre completos, para los filtros.
create or replace function public.contract_payments_view(p_contract_id uuid, p_kind text, p_offset integer, p_limit integer)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with m as (
    select 'expense'::text as kind, e.id, e.spent_on as on_date, e.concept as concept, e.payee as who, e.amount_cents,
           e.payment_method as method, e.document_ref as reference, null::uuid as purchase_id, null::date as due_on
    from public.contract_expenses e where e.contract_id = p_contract_id
    union all
    select pp.kind, pp.id, pp.moved_on, 'Factura ' || p.number, coalesce(s.name, ''), pp.amount_cents,
           pp.method, pp.reference, pp.purchase_id, pp.due_on
    from public.purchase_payments pp
    join public.purchases p on p.id = pp.purchase_id
    left join public.suppliers s on s.id = p.supplier_id
    where p.contract_id = p_contract_id and pp.kind in ('payment', 'credit')
    union all
    select 'advance', a.id, a.paid_on, 'Anticipo', coalesce(s.name, ''), a.amount_cents, a.method, a.reference, null, null
    from public.supplier_advances a
    left join public.suppliers s on s.id = a.supplier_id
    where a.contract_id = p_contract_id
  ),
  shown as (select * from m where coalesce(p_kind, '') = '' or kind = p_kind)
  select jsonb_build_object(
    'count', (select count(*) from shown),
    'total_cents', (select coalesce(sum(amount_cents), 0) from shown),
    'by_kind', coalesce((select jsonb_object_agg(kind, jsonb_build_object('count', n, 'total_cents', t))
                         from (select kind, count(*) as n, sum(amount_cents) as t from m group by kind) k), '{}'::jsonb),
    'rows', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.on_date desc, r.id)
      from (select * from shown order by on_date desc, id offset greatest(p_offset, 0) limit least(greatest(p_limit, 1), 200)) r
    ), '[]'::jsonb)
  )
$$;
revoke execute on function public.contract_payments_view(uuid, text, integer, integer) from public, anon;
grant execute on function public.contract_payments_view(uuid, text, integer, integer) to authenticated;
