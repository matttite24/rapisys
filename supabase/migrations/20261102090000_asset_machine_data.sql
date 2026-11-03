-- Un activo es una máquina o vehículo concreto: además del tipo, marca y modelo,
-- lleva su serie, motor e identificador.
alter table public.assets
  add column serial text check (char_length(serial) <= 100),
  add column engine text check (char_length(engine) <= 100),
  add column identifier text check (char_length(identifier) <= 100);
