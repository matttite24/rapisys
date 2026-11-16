-- Cotizaciones: proveedor elegido del catálogo (o guardado desde la gestión), teléfono y correo del contacto,
-- y documentos adjuntos a cada registro.
alter table public.suppliers
  add column if not exists phone text check (phone is null or length(phone) <= 50),
  add column if not exists email text check (email is null or length(email) <= 200);

alter table public.line_quotations
  add column if not exists supplier_id uuid references public.suppliers(id) on delete set null,
  add column if not exists phone text not null default '' check (length(phone) <= 50),
  add column if not exists email text not null default '' check (length(email) <= 200);

create table if not exists public.line_quotation_files (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  quotation_id uuid not null references public.line_quotations(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 255),
  path text not null unique,
  mime_type text not null check (char_length(mime_type) <= 150),
  size_bytes bigint not null check (size_bytes between 1 and 15728640),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists line_quotation_files_quotation_idx on public.line_quotation_files(quotation_id, created_at);
alter table public.line_quotation_files enable row level security;
create policy "line_quotation_files: miembros leen" on public.line_quotation_files
  for select to authenticated using (public.is_member(organization_id));
create policy "line_quotation_files: admin y operador suben" on public.line_quotation_files
  for insert to authenticated with check (public.has_role(organization_id, array['admin','operator']::public.org_role[]));
create policy "line_quotation_files: admin y operador borran" on public.line_quotation_files
  for delete to authenticated using (public.has_role(organization_id, array['admin','operator']::public.org_role[]));
revoke all on public.line_quotation_files from anon;
grant select, insert, delete on public.line_quotation_files to authenticated;

drop function if exists public.line_quotation_add(uuid, uuid, uuid, text, text, text, bigint, text, text, text);
create or replace function public.line_quotation_add(
  p_org_id uuid, p_contract_id uuid, p_line_id uuid,
  p_supplier text, p_phone text, p_email text, p_note text, p_unit_cost_cents bigint,
  p_availability text, p_lead_time text, p_proforma_url text, p_supplier_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.contract_status;
  v_id uuid;
begin
  if not public.has_role(p_org_id, array['admin','operator']::public.org_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select c.status into v_status from public.contracts c
    where c.id = p_contract_id and c.organization_id = p_org_id for update;
  if v_status is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if v_status <> 'in_progress' then raise exception 'not_in_progress'; end if;
  perform 1 from public.contract_items ci
    where ci.id = p_line_id and ci.contract_id = p_contract_id and ci.organization_id = p_org_id for update;
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_supplier_id is not null then
    perform 1 from public.suppliers s where s.id = p_supplier_id and s.organization_id = p_org_id;
    if not found then raise exception 'forbidden' using errcode = '42501'; end if;
  end if;
  insert into public.line_quotations (
    organization_id, contract_item_id, supplier, supplier_id, phone, email, note, unit_cost_cents,
    availability, lead_time, proforma_url
  ) values (
    p_org_id, p_line_id, trim(p_supplier), p_supplier_id, trim(p_phone), trim(p_email), trim(p_note), p_unit_cost_cents,
    trim(p_availability), trim(p_lead_time), trim(p_proforma_url)
  ) returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.line_quotation_add(uuid, uuid, uuid, text, text, text, text, bigint, text, text, text, uuid) from public, anon;
grant execute on function public.line_quotation_add(uuid, uuid, uuid, text, text, text, text, bigint, text, text, text, uuid) to authenticated;
