import type { SupabaseClient } from "@supabase/supabase-js";

// Nombre de los proveedores que aparecen en una lista (solo esos, no todos los de la organización).
export async function supplierNames(supabase: SupabaseClient, ids: (string | null)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => !!id))];
  if (unique.length === 0) return new Map();
  const { data } = await supabase.from("suppliers").select("id, name").in("id", unique);
  return new Map(((data ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name]));
}
