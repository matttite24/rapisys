import type { SupabaseClient } from "@supabase/supabase-js";

export type ItemRow = { id: string; sku: string | null; name: string; part_numbers: string[] };

// Productos de la bodega que coinciden con el texto (máx. `limit`, 15 por defecto). Usa la función SQL `search_items`
// (índice de trigramas, números de parte parciales y coincidencia exacta primero). Si la migración
// aún no se aplicó, cae a la búsqueda simple para que la pantalla no se rompa.
export async function findItems(supabase: SupabaseClient, orgId: string, term: string, limit = 15): Promise<ItemRow[]> {
  const { data, error } = await supabase.rpc("search_items", { p_org: orgId, p_q: term, p_limit: limit });
  if (!error) return (data ?? []) as ItemRow[];

  let query = supabase
    .from("items")
    .select("id, sku, name, part_numbers")
    .eq("organization_id", orgId)
    .eq("is_active", true)
    .order("name")
    .limit(limit);
  if (term) {
    query = query.or(
      `name.ilike.%${term}%,sku.ilike.%${term}%,part_numbers.cs.{${term}},part_numbers.cs.{${term.toUpperCase()}}`,
    );
  }
  const { data: rows, error: fallbackError } = await query;
  if (fallbackError) throw new Error("No se pudieron buscar los productos.");
  return (rows ?? []) as ItemRow[];
}
