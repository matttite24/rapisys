-- El código interno del CSV va como número de parte 1 (no en un campo aparte). Corrige lo ya importado:
-- pasa el código interno al inicio de los números de parte (sin repetirlo, máximo 3) y lo borra del campo aparte.
update public.items
set part_numbers = (array[internal_code] || array(select p from unnest(part_numbers) p where p is distinct from internal_code))[1:3],
    internal_code = null,
    updated_at = now()
where internal_code is not null;
