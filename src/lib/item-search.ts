import type { SupabaseClient } from "@supabase/supabase-js";
import { isSchemaError, logDbError, SCHEMA_MESSAGE } from "@/lib/db-error";

export type ItemRow = { id: string; sku: string | null; name: string; part_numbers: string[] };

// La función indexada busca en todo el catálogo, incluidos números de parte parciales.
// No sustituir por un filtro de arrays: solo encontraría números de parte completos.
export async function findItems(supabase: SupabaseClient, orgId: string, term: string, limit = 15): Promise<ItemRow[]> {
  const size = Number.isSafeInteger(limit) ? Math.min(50, Math.max(1, limit)) : 15;
  const { data, error } = await supabase.rpc("search_items", { p_org: orgId, p_q: term.trim().slice(0, 200), p_limit: size });
  if (error) {
    logDbError("búsqueda de productos", error);
    throw new Error(isSchemaError(error) ? SCHEMA_MESSAGE : "No se pudieron buscar los productos. Inténtalo de nuevo.");
  }
  return (data ?? []) as ItemRow[];
}
