-- Archivos del contrato en Supabase Storage. Un solo lugar para los documentos propios del contrato y los de sus compras
-- y gastos. El bucket es privado: se leen con URLs firmadas de corta duración.
--
-- Ruta de cada objeto: {organization_id}/{contract_id}/{uuid}-{nombre}. La primera carpeta decide quién puede tocarlo:
-- solo los miembros de esa organización.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'contract-files', 'contract-files', false, 15728640,
  array[
    'application/pdf',
    'image/png', 'image/jpeg', 'image/webp', 'image/heic',
    'application/xml', 'text/xml',
    'text/csv',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]
)
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create table public.contract_files (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  contract_id uuid not null,
  -- A qué pertenece: al contrato en general, a una compra o a un gasto.
  source text not null default 'contract' check (source in ('contract', 'purchase', 'expense')),
  source_id uuid,
  name text not null check (char_length(name) between 1 and 255),
  path text not null unique,
  mime_type text not null check (char_length(mime_type) <= 150),
  size_bytes bigint not null check (size_bytes between 1 and 15728640),
  created_by uuid default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  foreign key (contract_id, organization_id) references public.contracts (id, organization_id) on delete cascade,
  check ((source = 'contract') = (source_id is null))
);
create index contract_files_contract_idx on public.contract_files (contract_id, created_at desc);
create index contract_files_source_idx on public.contract_files (source, source_id);

alter table public.contract_files enable row level security;
create policy "contract_files: miembros leen" on public.contract_files
  for select to authenticated using (public.is_member(organization_id));
create policy "contract_files: miembros suben" on public.contract_files
  for insert to authenticated with check (public.is_member(organization_id));
create policy "contract_files: miembros borran" on public.contract_files
  for delete to authenticated using (public.is_member(organization_id));

-- Storage: solo los miembros de la organización de la primera carpeta de la ruta.
create policy "contract-files: miembros leen" on storage.objects
  for select to authenticated
  using (bucket_id = 'contract-files' and public.is_member(((storage.foldername(name))[1])::uuid));
create policy "contract-files: miembros suben" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'contract-files' and public.is_member(((storage.foldername(name))[1])::uuid));
create policy "contract-files: miembros borran" on storage.objects
  for delete to authenticated
  using (bucket_id = 'contract-files' and public.is_member(((storage.foldername(name))[1])::uuid));
