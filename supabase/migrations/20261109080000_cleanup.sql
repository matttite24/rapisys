-- Limpieza: la revisión de rentabilidad ahora usa contract_profit_summary y contract_profit_lines.
drop function if exists public.contract_profit_view(uuid);
