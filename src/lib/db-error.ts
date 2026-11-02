// Errores de la base: se registran con sus campos reales (el objeto de error no se
// imprime bien con console.error) y un esquema desactualizado se reconoce como tal.
export type DbError = { code?: string; message?: string; details?: string; hint?: string };

// Columna, tabla o función que no existen: casi siempre falta aplicar una migración.
const SCHEMA_CODES = new Set(["42703", "42P01", "42883", "PGRST202", "PGRST204", "PGRST205"]);

export const isSchemaError = (e: DbError) => !!e.code && SCHEMA_CODES.has(e.code);

export const SCHEMA_MESSAGE =
  "La base de datos no está al día: falta aplicar una migración. Avisa a quien administra el sistema.";

export function logDbError(scope: string, e: DbError) {
  console.error(`${scope}: ${JSON.stringify({ code: e.code, message: e.message, details: e.details, hint: e.hint })}`);
}
