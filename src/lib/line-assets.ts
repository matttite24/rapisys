import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;
const chunks = <T,>(xs: T[], n = 150) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, (i + 1) * n));

// Nombre de cada activo relacionado con el producto asignado a cada línea. Devuelve línea → lista de activos (sin repetir).
export async function assetsForLines(supabase: Supabase, lineIds: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (!lineIds.length) return out;
  const sources: { contract_item_id: string; item_id: string }[] = [];
  for (const ids of chunks(lineIds)) {
    const { data } = await supabase.from("supply_sources").select("contract_item_id, item_id").in("contract_item_id", ids);
    sources.push(...((data ?? []) as { contract_item_id: string; item_id: string }[]));
  }
  const itemIds = [...new Set(sources.map((s) => s.item_id))];
  const links: { item_id: string; asset_id: string }[] = [];
  for (const ids of chunks(itemIds)) {
    const { data } = await supabase.from("item_assets").select("item_id, asset_id").in("item_id", ids);
    links.push(...((data ?? []) as { item_id: string; asset_id: string }[]));
  }
  const assetIds = [...new Set(links.map((l) => l.asset_id))];
  const names = new Map<string, string>();
  for (const ids of chunks(assetIds)) {
    const { data } = await supabase.from("assets").select("id, name, brand, model").in("id", ids);
    for (const a of (data ?? []) as { id: string; name: string; brand: string | null; model: string | null }[]) {
      const detail = [a.brand, a.model].filter(Boolean).join(" ");
      names.set(a.id, detail && !a.name.toLowerCase().includes(detail.toLowerCase()) ? `${a.name} (${detail})` : a.name);
    }
  }
  const byItem = new Map<string, string[]>();
  for (const l of links) byItem.set(l.item_id, [...(byItem.get(l.item_id) ?? []), names.get(l.asset_id) ?? ""].filter(Boolean));
  for (const s of sources) {
    const cur = out.get(s.contract_item_id) ?? [];
    for (const a of byItem.get(s.item_id) ?? []) if (!cur.includes(a)) cur.push(a);
    out.set(s.contract_item_id, cur);
  }
  return out;
}
