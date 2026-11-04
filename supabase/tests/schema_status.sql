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
  )                                                                        as "7_contract_reference_lines",
  to_regproc('public.add_contract_line') is not null                       as "8_add_contract_line",
  to_regclass('public.contract_lists') is not null                         as "9_contract_lists",
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'assets' and column_name = 'serial'
  )                                                                        as "10_asset_machine_data",
  to_regproc('public.add_contract_lines') is not null                      as "11_add_contract_lines",
  to_regproc('public.contract_list_counts') is not null                    as "12_list_limits_and_counts",
  to_regproc('public.contract_items_view') is not null                     as "13_contract_items_view",
  to_regclass('public.stock_lots') is not null                             as "14_stock",
  to_regclass('public.supply_sources') is not null                         as "15_supply_sources",
  to_regclass('public.deliveries') is not null                             as "16_deliveries",
  to_regclass('public.purchases') is not null                              as "17_purchases",
  pg_get_functiondef('public.delivery_create(uuid, uuid, date, text, text, jsonb)'::regprocedure)
    like '%not_deliverable%'                                               as "18_deliveries_whole_lines";
