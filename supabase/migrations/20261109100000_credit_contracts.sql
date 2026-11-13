-- Contrato a crédito: sin monto ni plazo de entrega. Comparte listas, líneas, compras, entregas y archivos
-- con el contrato normal; solo cambia el ciclo de estados (Abierto/Entregando → Facturado → Cobrado) y
-- que no hay monto ni plazo. Se crea directamente en 'in_progress'.
alter table public.contracts add column kind text not null default 'standard' check (kind in ('standard', 'credit'));
alter table public.contracts alter column total_cents drop not null;
alter table public.contracts alter column term_days drop not null;
alter table public.contracts add constraint contracts_kind_terms check (
  (kind = 'standard' and total_cents is not null and term_days is not null)
  or (kind = 'credit' and total_cents is null and term_days is null)
);
