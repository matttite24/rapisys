"use server";

import { withVatCents } from "@/lib/money";
import { VAT_RATE } from "@/lib/contracts";

import { requireUser } from "@/lib/auth";
import { getOrgId } from "@/lib/orgs";
import { createClient } from "@/lib/supabase/server";
import { cleanSearch } from "@/lib/search";
import { pageRange } from "@/lib/pagination";
import { isSchemaError, logDbError, SCHEMA_MESSAGE, type DbError } from "@/lib/db-error";
import { warehouseKind, type WarehouseView, type WarehouseItem, type WarehouseAsset, type WarehouseSupplier } from "@/lib/warehouse";

function message(error: DbError) { logDbError("bodega", error); return isSchemaError(error) ? SCHEMA_MESSAGE : "No se pudo cargar el catálogo. Inténtalo de nuevo."; }
export async function loadWarehouse(org: string, selected: string, search: string, requestedPage = 1): Promise<{ view?: WarehouseView; error?: string }> {
  await requireUser();
  const orgId = await getOrgId(org);
  if (!orgId) return { error: "Organización no disponible." };
  const db = await createClient();
  const kind = warehouseKind(selected), q = cleanSearch(search).slice(0, 200);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 && requestedPage <= 100000 ? requestedPage : 1;
  if (kind === "proveedores") {
    let query = db.from("suppliers").select("id, name, ruc, address", { count: "exact" })
      .eq("organization_id", orgId).order("name").order("id").range(...pageRange(page));
    if (q) query = query.or(`name.ilike.%${q}%,ruc.ilike.%${q}%,address.ilike.%${q}%`);
    const { data, count, error } = await query;
    if (error) return { error: message(error) };
    return { view: { kind, q, page, total: count ?? 0, rows: (data ?? []) as WarehouseSupplier[] } };
  }
  if (kind === "activos") {
    let query = db.from("assets").select("id, kind, name, brand, model, year, plate, serial, identifier", { count: "exact" })
      .eq("organization_id", orgId).order("kind").order("name").order("id").range(...pageRange(page));
    if (q) query = query.or(`name.ilike.%${q}%,brand.ilike.%${q}%,model.ilike.%${q}%,plate.ilike.%${q}%,serial.ilike.%${q}%,identifier.ilike.%${q}%`);
    const { data, count, error } = await query;
    if (error) return { error: message(error) };
    return { view: { kind, q, page, total: count ?? 0, rows: (data ?? []) as WarehouseAsset[] } };
  }
  let query = db.from("items").select("id, sku, name, line, category_id, part_numbers, margin_percent, is_active", { count: "exact" })
    .eq("organization_id", orgId).order("name").order("id").range(...pageRange(page));
  if (q) query = query.or(`name.ilike.%${q}%,tdr_name.ilike.%${q}%,internal_code.ilike.%${q}%,barcode.ilike.%${q}%,sku.ilike.%${q}%,part_numbers.cs.{${q}}`);
  const [items, categories] = await Promise.all([query, db.from("item_categories").select("id, name").eq("organization_id", orgId)]);
  if (items.error) return { error: message(items.error) };
  if (categories.error) return { error: message(categories.error) };
  const rows = (items.data ?? []) as { id: string; sku: string | null; name: string; line: string | null; category_id: string | null; part_numbers: string[]; margin_percent: number; is_active: boolean }[];
  const ids = rows.map((row) => row.id);
  // Costos y existencias son independientes; se cargan juntos para la página visible.
  const [prices, stock] = ids.length ? await Promise.all([
    db.from("item_supplier_prices").select("item_id, unit_cost_cents, vat_rate").in("item_id", ids),
    db.from("item_stock").select("item_id, on_hand").in("item_id", ids),
  ]) : [{ data: [], error: null }, { data: [], error: null }];
  if (prices.error) return { error: message(prices.error) };
  if (stock.error) return { error: message(stock.error) };
  // Costo con IVA (lo realmente pagado) del proveedor más barato: sobre ese valor se aplica el margen.
  const best = new Map<string, number>();
  for (const price of prices.data ?? []) {
    const cost = withVatCents(Number(price.unit_cost_cents), Number(price.vat_rate ?? VAT_RATE));
    if (!best.has(price.item_id) || cost < best.get(price.item_id)!) best.set(price.item_id, cost);
  }
  const cats = new Map((categories.data ?? []).map((row) => [row.id, row.name]));
  const onHand = new Map((stock.data ?? []).map((row) => [row.item_id, Number(row.on_hand)]));
  const result: WarehouseItem[] = rows.map((row) => ({
    id: row.id, sku: row.sku, name: row.name, line: row.line, category: cats.get(row.category_id ?? "") ?? null,
    part_numbers: row.part_numbers, margin_percent: Number(row.margin_percent), is_active: row.is_active,
    costCents: best.get(row.id) ?? null, stock: onHand.get(row.id) ?? 0,
  }));
  return { view: { kind, q, page, total: items.count ?? 0, rows: result } };
}
