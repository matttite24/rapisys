# Gastos del contrato

Cada registro representa un documento con una o varias líneas de gasto. Fecha,
beneficiario, método de pago, referencia/enlace del comprobante y observaciones
son comunes. Cada línea guarda concepto, categoría y monto final en USD. El total
se calcula sumando centavos enteros, con un máximo de 100 líneas por documento.

El drawer permite añadir/quitar líneas y muestra el total automático. Guardar
crea o reemplaza encabezado y detalle en una transacción: si falla una línea, no
se guarda ninguna parte del cambio. Los registros anteriores se convierten a
documentos de una línea conservando sus datos.

La búsqueda incluye conceptos de todas las líneas. El filtro por categoría
muestra documentos que contienen esa categoría. El total mostrado suma los
documentos completos, incluidas las demás categorías de su detalle. La página
muestra 25 documentos; los totales y contadores incluyen todas las páginas.

Miembros de la organización pueden consultar. Administradores y operadores
pueden guardar mediante la función transaccional y eliminar con confirmación.
Eliminar un documento elimina también todas sus líneas. RLS mantiene aislamiento
por organización y el guardado comprueba el contrato y organización.

Aplica en orden las migraciones del proyecto. Si la primera versión de Gastos ya
está instalada, la nueva migración es
`supabase/migrations/20261108020000_expense_document_lines.sql`.
`supabase/tests/schema_status.sql` permite comprobar su presencia.
