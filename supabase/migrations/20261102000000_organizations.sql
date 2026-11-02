-- Base multiorganización: todo dato de negocio cuelga de una organización.
-- Las tablas futuras deben llevar organization_id y políticas con is_member / has_role.

create type public.org_role as enum ('admin', 'operator');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now()
);

create table public.memberships (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.org_role not null default 'operator',
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create index memberships_user_id_idx on public.memberships (user_id);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email text not null,
  role public.org_role not null default 'operator',
  token uuid not null unique default gen_random_uuid(),
  invited_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz
);
create index invitations_org_idx on public.invitations (organization_id);

-- Helpers para RLS. security definer evita recursión al leer memberships.
create function public.is_member(org uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.memberships
    where organization_id = org and user_id = (select auth.uid())
  );
$$;

create function public.has_role(org uuid, roles public.org_role[])
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.memberships
    where organization_id = org
      and user_id = (select auth.uid())
      and role = any (roles)
  );
$$;

-- Crea la organización y deja al creador como administrador.
create function public.create_organization(p_name text, p_slug text)
returns public.organizations
language plpgsql security definer set search_path = ''
as $$
declare
  org public.organizations;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  insert into public.organizations (name, slug, created_by)
  values (trim(p_name), lower(trim(p_slug)), auth.uid())
  returning * into org;

  insert into public.memberships (organization_id, user_id, role)
  values (org.id, auth.uid(), 'admin');

  return org;
end;
$$;

-- Acepta una invitación: el correo del usuario debe coincidir con el invitado.
create function public.accept_invitation(p_token uuid)
returns public.organizations
language plpgsql security definer set search_path = ''
as $$
declare
  inv public.invitations;
  org public.organizations;
begin
  select * into inv from public.invitations
  where token = p_token and accepted_at is null and expires_at > now();

  if not found then
    raise exception 'Invitación inválida o vencida';
  end if;
  if lower(inv.email) <> lower(coalesce(auth.jwt() ->> 'email', '')) then
    raise exception 'La invitación es para otro correo';
  end if;

  insert into public.memberships (organization_id, user_id, role)
  values (inv.organization_id, auth.uid(), inv.role)
  on conflict (organization_id, user_id) do nothing;

  update public.invitations set accepted_at = now() where id = inv.id;

  select * into org from public.organizations where id = inv.organization_id;
  return org;
end;
$$;

-- Solo usuarios autenticados pueden ejecutar las funciones.
revoke execute on function
  public.is_member(uuid),
  public.has_role(uuid, public.org_role[]),
  public.create_organization(text, text),
  public.accept_invitation(uuid)
from public, anon;
grant execute on function
  public.is_member(uuid),
  public.has_role(uuid, public.org_role[]),
  public.create_organization(text, text),
  public.accept_invitation(uuid)
to authenticated;

-- RLS
alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.invitations enable row level security;

create policy "organizations: ver las propias" on public.organizations
  for select to authenticated using (public.is_member(id));
create policy "organizations: admin edita" on public.organizations
  for update to authenticated
  using (public.has_role(id, array['admin']::public.org_role[]))
  with check (public.has_role(id, array['admin']::public.org_role[]));

create policy "memberships: ver las de mis organizaciones" on public.memberships
  for select to authenticated using (public.is_member(organization_id));
create policy "memberships: admin cambia roles" on public.memberships
  for update to authenticated
  using (public.has_role(organization_id, array['admin']::public.org_role[]))
  with check (public.has_role(organization_id, array['admin']::public.org_role[]));
create policy "memberships: admin quita o uno se va" on public.memberships
  for delete to authenticated
  using (
    public.has_role(organization_id, array['admin']::public.org_role[])
    or user_id = (select auth.uid())
  );

create policy "invitations: admin gestiona" on public.invitations
  for all to authenticated
  using (public.has_role(organization_id, array['admin']::public.org_role[]))
  with check (public.has_role(organization_id, array['admin']::public.org_role[]));
