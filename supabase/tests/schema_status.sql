-- ¿Qué migraciones tiene aplicadas esta base? Pégala en el SQL Editor y ejecútala.
-- Cada columna es `true` si esa migración está aplicada. Deben estar todas en true.
select
  to_regclass('public.organizations') is not null                          as "1_organizations",
  to_regclass('public.contracts') is not null                              as "2_contracts",
  to_regclass('public.suppliers') is not null                              as "3_members_suppliers",
  to_regclass('public.items') is not null                                  as "4_warehouse",
  to_regclass('public.contract_items') is not null                         as "5_contract_items",
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'contracts' and column_name = 'total_cents'
  )                                                                        as "6_cents_and_hardening",
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'contract_items' and column_name = 'description'
  )                                                                        as "7_contract_reference_lines";
