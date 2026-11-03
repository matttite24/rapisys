-- Un contrato tiene varias listas de referencia, una por activo (máquina o
-- vehículo del cliente). Cada línea pertenece a una lista y puede traer número
-- de parte y CPC (código de clasificación de producto).

create table public.contract_lists (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  contract_id uuid not null,
  asset_id uuid,                                  -- activo del catálogo, si se eligió uno
  name text not null check (char_length(trim(name)) between 1 and 200),
  model text check (char_length(model) <= 100),
  serial text check (char_length(serial) <= 100),
  engine text check (char_length(engine) <= 100),
  identifier text check (char_length(identifier) <= 100),
  created_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (id, contract_id),
  foreign key (contract_id, organization_id)
    references public.contracts (id, organization_id) on delete cascade,
  foreign key (asset_id, organization_id)
    references public.assets (id, organization_id) on delete set null (asset_id)
);
create index contract_lists_contract_idx on public.contract_lists (contract_id);

alter table public.contract_lists enable row level security;
create policy "contract_lists: miembros leen" on public.contract_lists
  for select to authenticated using (public.is_member(organization_id));
create policy "contract_lists: admin y operador crean" on public.contract_lists
  for insert to authenticated
  with check (public.has_role(organization_id, array['admin','operator']::public.org_role[]));
create policy "contract_lists: admin y operador editan" on public.contract_lists
  for update to authenticated
  using (public.has_role(organization_id, array['admin','operator']::public.org_role[]))
  with check (public.has_role(organization_id, array['admin','operator']::public.org_role[]));
create policy "contract_lists: admin y operador borran" on public.contract_lists
  for delete to authenticated
  using (public.has_role(organization_id, array['admin','operator']::public.org_role[]));

alter table public.contract_items
  add column list_id uuid,
  add column part_number text check (char_length(part_number) <= 60),
  add column cpc text check (char_length(cpc) <= 20);

-- Las líneas que ya existían pasan a una lista general de su contrato.
insert into public.contract_lists (organization_id, contract_id, name)
select distinct organization_id, contract_id, 'Lista general' from public.contract_items;
update public.contract_items ci
set list_id = l.id
from public.contract_lists l
where l.contract_id = ci.contract_id;

alter table public.contract_items alter column list_id set not null;
alter table public.contract_items
  add foreign key (list_id, contract_id)
  references public.contract_lists (id, contract_id) on delete cascade;
create index contract_items_list_idx on public.contract_items (list_id);

-- La función de agregar ahora recibe la lista; el contrato sale de ella.
drop function public.add_contract_line(uuid, text, numeric, text);
create function public.add_contract_line(
  p_list_id uuid,
  p_part_number text,
  p_description text,
  p_quantity numeric,
  p_unit text,
  p_cpc text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_org uuid;
  v_contract uuid;
  v_status public.contract_status;
  v_id uuid;
begin
  select l.organization_id, l.contract_id, c.status into v_org, v_contract, v_status
  from public.contract_lists l
  join public.contracts c on c.id = l.contract_id
  where l.id = p_list_id;

  if v_org is null then
    raise exception 'list_not_found' using errcode = 'P0002';
  end if;
  if v_status <> 'in_progress' then
    raise exception 'not_in_progress' using errcode = 'P0001';
  end if;

  insert into public.contract_items
    (organization_id, contract_id, list_id, part_number, description, quantity, unit, cpc)
  values
    (v_org, v_contract, p_list_id, p_part_number, p_description, p_quantity, p_unit, p_cpc)
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.add_contract_line(uuid, text, text, numeric, text, text) from public, anon;
grant execute on function public.add_contract_line(uuid, text, text, numeric, text, text) to authenticated;
