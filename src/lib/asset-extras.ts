import type { SupabaseClient } from "@supabase/supabase-js";

// Datos del activo que no vienen en las vistas de las listas del contrato (año de fabricación, "otro" y placa), por activo.
export async function assetExtras(
  supabase: SupabaseClient,
  assetIds: (string | null)[],
): Promise<Map<string, { year: string; other: string; plate: string }>> {
  const ids = [...new Set(assetIds.filter((x): x is string => !!x))];
  const out = new Map<string, { year: string; other: string; plate: string }>();
  if (!ids.length) return out;
  const { data } = await supabase.from("assets").select("id, year, other, plate").in("id", ids);
  for (const a of (data ?? []) as { id: string; year: number | null; other: string | null; plate: string | null }[]) {
    out.set(a.id, { year: a.year === null ? "" : String(a.year), other: a.other ?? "", plate: a.plate ?? "" });
  }
  return out;
}
