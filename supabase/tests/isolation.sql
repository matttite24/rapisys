-- Prueba de aislamiento entre organizaciones.
-- Pégala completa en el SQL Editor de Supabase. Falla con "FALLO: ..." si algún permiso
-- se abre de más; si termina mostrando "OK", pasó. Todo se revierte al final (rollback).
begin;

-- Dos usuarios, cada uno administrador de su propia organización.
insert into auth.users (id, aud, role, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'a@test.invalid'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'b@test.invalid');

insert into public.organizations (id, name, slug, created_by) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'Org A', 'test-a', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('bbbbbbbb-0000-0000-0000-0000000000b1', 'Org B', 'test-b', 'bbbbbbbb-0000-0000-0000-000000000001');

insert into public.memberships (organization_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-000000000001', 'admin'),
  ('bbbbbbbb-0000-0000-0000-0000000000b1', 'bbbbbbbb-0000-0000-0000-000000000001', 'admin');

insert into public.clients (organization_id, name) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'Cliente de A'),
  ('bbbbbbbb-0000-0000-0000-0000000000b1', 'Cliente de B');

-- A partir de aquí se actúa como el usuario A, con las políticas RLS aplicadas.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);

do $$
declare n int;
begin
  select count(*) into n from public.clients;
  if n <> 1 then raise exception 'FALLO: A ve % clientes (esperaba 1, el suyo)', n; end if;

  select count(*) into n from public.organizations;
  if n <> 1 then raise exception 'FALLO: A ve % organizaciones (esperaba 1)', n; end if;

  -- No puede crear datos en la organización de B.
  begin
    insert into public.clients (organization_id, name)
    values ('bbbbbbbb-0000-0000-0000-0000000000b1', 'intruso');
    raise exception 'FALLO: A pudo insertar un cliente en la organización B';
  exception when insufficient_privilege then null;
  end;

  -- No puede editar ni borrar datos de B (la política los oculta: 0 filas afectadas).
  update public.clients set name = 'hackeado'
    where organization_id = 'bbbbbbbb-0000-0000-0000-0000000000b1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLO: A editó % clientes de B', n; end if;

  delete from public.clients where organization_id = 'bbbbbbbb-0000-0000-0000-0000000000b1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLO: A borró % clientes de B', n; end if;

  -- Un administrador no puede mover una membresía a otra cuenta (solo puede cambiar el rol).
  begin
    update public.memberships set user_id = 'bbbbbbbb-0000-0000-0000-000000000001'
      where organization_id = 'aaaaaaaa-0000-0000-0000-0000000000a1';
    raise exception 'FALLO: A pudo reasignar una membresía a otro usuario';
  exception when insufficient_privilege then null;
  end;

  -- Nadie puede dejar la organización sin administrador.
  begin
    delete from public.memberships
      where organization_id = 'aaaaaaaa-0000-0000-0000-0000000000a1'
        and user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
    raise exception 'FALLO: se quitó al único administrador';
  exception when raise_exception then
    if sqlerrm not like '%al menos un administrador%' then raise; end if;
  end;
end $$;

select 'OK: el aislamiento entre organizaciones se mantiene' as resultado;

rollback;
