import type { AssetKind } from "@/lib/items";
export type WarehouseKind = "items" | "activos";
export const warehouseKind = (value: string): WarehouseKind => value === "activos" ? "activos" : "items";
export type WarehouseItem = {
  id: string; sku: string | null; name: string; line: string | null; category: string | null;
  part_numbers: string[]; margin_percent: number; is_active: boolean; costCents: number | null; stock: number; // costCents: con IVA
};
export type WarehouseAsset = {
  id: string; kind: AssetKind; name: string; brand: string | null; model: string | null; year: number | null;
  plate: string | null; serial: string | null; identifier: string | null;
};
export type WarehouseView = { q: string; page: number; total: number } & (
  { kind: "items"; rows: WarehouseItem[] } | { kind: "activos"; rows: WarehouseAsset[] }
);
export function filterWarehouse(view: WarehouseView, q: string): WarehouseView {
  const text = q.toLowerCase();
  if (view.kind === "items") {
    const rows = view.rows.filter((row) => [row.name, row.sku].some((value) => value?.toLowerCase().includes(text)) || row.part_numbers.includes(q));
    return { ...view, q, page: 1, rows, total: rows.length };
  }
  const rows = view.rows.filter((row) => [row.name, row.brand, row.model, row.plate, row.serial, row.identifier].some((value) => value?.toLowerCase().includes(text)));
  return { ...view, q, page: 1, rows, total: rows.length };
}
