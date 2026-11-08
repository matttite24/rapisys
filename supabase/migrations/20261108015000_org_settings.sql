-- Ajustes de la organización: datos para documentos (RUC, dirección, teléfono), IVA por defecto de los contratos nuevos,
-- vigencia de las invitaciones (días) y zona horaria para calcular "hoy" (plazos y atrasos).
-- Los cambios los hace un administrador: la política "organizations: admin edita" ya cubre las columnas nuevas.

alter table public.organizations
  add column if not exists ruc text check (ruc is null or ruc ~ '^[0-9]{13}$'),
  add column if not exists address text check (address is null or char_length(address) <= 200),
  add column if not exists phone text check (phone is null or char_length(phone) <= 30),
  add column if not exists vat_rate numeric(5, 2) not null default 15 check (vat_rate >= 0 and vat_rate <= 100),
  add column if not exists invitation_days integer not null default 7 check (invitation_days between 1 and 30),
  add column if not exists timezone text not null default 'America/Guayaquil' check (char_length(timezone) between 3 and 60);

-- La vigencia de una invitación nueva sale de la organización (la columna sigue con su valor por defecto para las
-- invitaciones existentes).
