-- Un activo puede ser una máquina, un vehículo u otra cosa: además de tipo, marca, modelo, serie, serie del motor, año de
-- fabricación y número de identificación, lleva un campo libre para lo que no encaje en los demás.
alter table public.assets add column other text check (char_length(other) <= 200);
