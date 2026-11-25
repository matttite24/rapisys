import type { createClient } from "@/lib/supabase/server";
import type { DbError } from "@/lib/db-error";

// Producto real de la bodega que cubre una línea del proceso (lo asignado en Abastecimiento).
export type DeliveryProduct = {
  id: string;
  name: string;
  sku: string | null;
  partNumbers: string[];
  description: string | null;
  line: string | null;
  supplier: string;
  quantity: number;
};

type Db = Awaited<ReturnType<typeof createClient>>;

// Productos asignados desde la bodega a cada línea, con su proveedor. Consultas por lotes acotados para no exceder el
// tamaño de URL ni truncar los productos. `fail` convierte el error de la base en el que verá la persona.
export async function loadLineProducts(db: Db, lineIds: string[], fail: (error: DbError) => Error): Promise<Map<string, DeliveryProduct[]>> {
  const out = new Map<string, DeliveryProduct[]>();
  if (!lineIds.length) return out;
  const batches = (ids: string[]) => Array.from({ length: Math.ceil(ids.length / 100) }, (_, i) => ids.slice(i * 100, (i + 1) * 100));
  type Source = { id: string; contract_item_id: string; item_id: string; supplier_id: string | null; quantity: number };
  const sourceBatches = await Promise.all(batches(lineIds).map(async (ids) => {
    const rows: Source[] = [];
    for (let offset = 0; ; offset += 1000) {
      const result = await db.from("supply_sources")
        .select("id, contract_item_id, item_id, supplier_id, quantity")
        .in("contract_item_id", ids).eq("kind", "bodega")
        .order("created_at").order("id").range(offset, offset + 999);
      if (result.error) throw fail(result.error);
      rows.push(...(result.data ?? []));
      if ((result.data?.length ?? 0) < 1000) break;
    }
    return rows;
  }));
  const sources = sourceBatches.flat();
  const itemIds = [...new Set(sources.map((r) => r.item_id))];
  const supplierIds = [...new Set(sources.map((r) => r.supplier_id).filter((id): id is string => !!id))];
  const [itemResults, supplierResults] = await Promise.all([
    Promise.all(batches(itemIds).map((ids) => db.from("items").select("id, name, sku, part_numbers, description, line").in("id", ids))),
    Promise.all(batches(supplierIds).map((ids) => db.from("suppliers").select("id, name").in("id", ids))),
  ]);
  for (const result of [...itemResults, ...supplierResults]) {
    if (result.error) throw fail(result.error);
  }
  const itemById = new Map(itemResults.flatMap((result) => result.data ?? []).map((item) => [item.id, item]));
  const supplierById = new Map(supplierResults.flatMap((result) => result.data ?? []).map((supplier) => [supplier.id, supplier.name]));
  for (const source of sources) {
    const item = itemById.get(source.item_id);
    const products = out.get(source.contract_item_id) ?? [];
    products.push({
      id: source.id, name: item?.name ?? "Producto no disponible", sku: item?.sku ?? null,
      partNumbers: item?.part_numbers ?? [], description: item?.description ?? null, line: item?.line ?? null,
      supplier: source.supplier_id ? (supplierById.get(source.supplier_id) ?? "") : "",
      quantity: Number(source.quantity),
    });
    out.set(source.contract_item_id, products);
  }
  return out;
}
