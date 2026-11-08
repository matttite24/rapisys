-- El catálogo anterior de clientes se presentaba como Instituciones. Se conservan IDs y vínculos.
alter table public.clients add column client_type text not null default 'institution'
  check (client_type in ('company', 'institution', 'person'));
create index clients_org_type_name_idx on public.clients(organization_id, client_type, name);
