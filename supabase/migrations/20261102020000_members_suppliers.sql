-- Miembros visibles, creación de organizaciones solo por invitación, protección
-- del último administrador y catálogo de proveedores.

-- ---------------------------------------------------------------- profiles
-- Copia pública (por organización) de los datos de auth.users que la app necesita mostrar.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  created_at timestamptz not null default now()
);

create function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Usuarios que ya existen.
insert into public.profiles (id, email, full_name)
select id, email, raw_user_meta_data ->> 'full_name' from auth.users
on conflict (id) do nothing;

-- Permite incrustar el perfil al consultar membresías.
alter table public.memberships
  add constraint memberships_profile_fkey
  foreign key (user_id) references public.profiles (id) on delete cascade;

-- ¿Comparto organización con este usuario? (security definer evita recursión de RLS)
create function public.shares_org_with(other uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships mine
    join public.memberships theirs using (organization_id)
    where mine.user_id = (select auth.uid()) and theirs.user_id = other
  );
$$;

alter table public.profiles enable row level security;
create policy "profiles: ver el propio y los de mis organizaciones" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or public.shares_org_with(id));
create policy "profiles: editar el propio" on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- ------------------------------------------------- creación de organizaciones
-- Solo pueden crear organizaciones quienes figuran aquí. El primero en usar el
-- sistema (cuando aún no existe ninguna organización) queda registrado solo.
create table public.org_creators (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.org_creators enable row level security;
create policy "org_creators: ver el propio" on public.org_creators
  for select to authenticated using (user_id = (select auth.uid()));

-- Quienes ya administran una organización conservan la facultad.
insert into public.org_creators (user_id)
select distinct user_id from public.memberships where role = 'admin'
on conflict do nothing;

create function public.can_create_organization()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.org_creators where user_id = (select auth.uid()))
      or not exists (select 1 from public.organizations);
$$;

create or replace function public.create_organization(p_name text, p_slug text)
returns public.organizations
language plpgsql security definer set search_path = ''
as $$
declare
  org public.organizations;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  if not public.can_create_organization() then
    raise exception 'Necesitas una invitación para unirte a una organización';
  end if;

  insert into public.organizations (name, slug, created_by)
  values (trim(p_name), lower(trim(p_slug)), auth.uid())
  returning * into org;

  insert into public.memberships (organization_id, user_id, role)
  values (org.id, auth.uid(), 'admin');

  insert into public.org_creators (user_id) values (auth.uid()) on conflict do nothing;

  return org;
end;
$$;

revoke execute on function public.shares_org_with(uuid), public.can_create_organization()
  from public, anon;
grant execute on function public.shares_org_with(uuid), public.can_create_organization()
  to authenticated;

-- --------------------------------------------------- último administrador
create function public.keep_one_admin()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if old.role = 'admin'
     and (tg_op = 'DELETE' or new.role <> 'admin')
     -- Si la organización ya no existe (borrado en cascada) no hay nada que proteger.
     and exists (select 1 from public.organizations where id = old.organization_id)
     and not exists (
       select 1 from public.memberships
       where organization_id = old.organization_id
         and role = 'admin'
         and user_id <> old.user_id
     )
  then
    raise exception 'La organización debe conservar al menos un administrador';
  end if;
  return case tg_op when 'DELETE' then old else new end;
end;
$$;

create trigger memberships_keep_one_admin
  before update or delete on public.memberships
  for each row execute function public.keep_one_admin();

-- Una invitación pendiente por correo y organización.
create unique index invitations_pending_email_idx
  on public.invitations (organization_id, lower(email))
  where accepted_at is null;

-- ------------------------------------------------------------- proveedores
create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  ruc text,
  address text,
  created_at timestamptz not null default now(),
  unique (id, organization_id)
);
create index suppliers_org_idx on public.suppliers (organization_id);

alter table public.suppliers enable row level security;
create policy "suppliers: miembros leen" on public.suppliers
  for select to authenticated using (public.is_member(organization_id));
create policy "suppliers: admin y operador crean" on public.suppliers
  for insert to authenticated
  with check (public.has_role(organization_id, array['admin','operator']::public.org_role[]));
create policy "suppliers: admin y operador editan" on public.suppliers
  for update to authenticated
  using (public.has_role(organization_id, array['admin','operator']::public.org_role[]))
  with check (public.has_role(organization_id, array['admin','operator']::public.org_role[]));
create policy "suppliers: admin borra" on public.suppliers
  for delete to authenticated
  using (public.has_role(organization_id, array['admin']::public.org_role[]));
