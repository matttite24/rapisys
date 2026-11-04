"use server";

import { revalidatePath } from "next/cache";
import { parseDecimal } from "@/lib/money";
import { getOrgId } from "@/lib/orgs";
import { cleanSearch } from "@/lib/search";
import { createClient } from "@/lib/supabase/server";
import { SCHEMA_MESSAGE, isSchemaError, logDbError, type DbError } from "@/lib/db-error";

export type SupplyState = { error?: string; ok?: boolean } | undefined;

function friendly(error: DbError) {
  if (error.code === "42501" || error.message === "forbidden") return "No tienes permiso para hacer esto.";
  if (error.message === "not_in_progress") return "El abastecimiento se trabaja cuando el contrato está En ejecución.";
  if (error.message === "insufficient") return "Ese lote no tiene tantas unidades. Actualiza la búsqueda.";
  if (error.message === "over_covered") return "Eso supera lo que pide la línea.";
  if (error.message === "bad_quantity") return "Escribe una cantidad mayor a 0.";
  logDbError("abastecimiento", error);
  if (isSchemaError(error)) return SCHEMA_MESSAGE;
  return "No se pudo completar la acción. Inténtalo de nuevo.";
}

const refresh = (org: string, contractId: string) => {
  revalidatePath(`/${org}/contratos/${contractId}`, "layout");
  revalidatePath(`/${org}/bodega`);
};

export type SourceView = {
  id: string;
  itemName: string;
  itemSku: string | null;
  supplier: string;
  costCents: number | null;
  quantity: number;
};

// Lo reservado hasta ahora para una línea, con el producto y el lote de cada tramo.
export async function getLineSupply(lineId: string): Promise<SourceView[]> {
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("supply_sources")
    .select("id, item_id, supplier_id, unit_cost_cents, quantity")
    .eq("contract_item_id", lineId)
    .order("created_at");
  const sources = (rows ?? []) as {
    id: string;
    item_id: string;
    supplier_id: string | null;
    unit_cost_cents: number | null;
    quantity: number;
  }[];
  if (!sources.length) return [];

  const itemIds = [...new Set(sources.map((s) => s.item_id))];
  const supplierIds = [...new Set(sources.map((s) => s.supplier_id).filter((x): x is string => !!x))];
  const [items, suppliers] = await Promise.all([
    supabase.from("items").select("id, name, sku").in("id", itemIds),
    supplierIds.length ? supabase.from("suppliers").select("id, name").in("id", supplierIds) : { data: [] },
  ]);
  const itemById = new Map(((items.data ?? []) as { id: string; name: string; sku: string | null }[]).map((i) => [i.id, i]));
  const supplierById = new Map(((suppliers.data ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name]));

  return sources.map((s) => ({
    id: s.id,
    itemName: itemById.get(s.item_id)?.name ?? "Producto eliminado",
    itemSku: itemById.get(s.item_id)?.sku ?? null,
    supplier: s.supplier_id ? (supplierById.get(s.supplier_id) ?? "") : "",
    costCents: s.unit_cost_cents === null ? null : Number(s.unit_cost_cents),
    quantity: Number(s.quantity),
  }));
}

export type LotOption = { id: string; supplier: string; costCents: number | null; remaining: number };
export type StockResult = {
  id: string;
  name: string;
  sku: string | null;
  partNumbers: string[];
  onHand: number;
  lots: LotOption[];
};

// Productos de la bodega que coinciden con la búsqueda (nombre, SKU o número de parte), con sus
// lotes que aún tienen unidades. El lote más barato va primero.
export async function searchStock(org: string, q: string): Promise<StockResult[]> {
  const orgId = await getOrgId(org);
  if (!orgId) return [];
  const term = cleanSearch(q);

  const supabase = await createClient();
  let query = supabase
    .from("items")
    .select("id, sku, name, part_numbers")
    .eq("organization_id", orgId)
    .eq("is_active", true)
    .order("name")
    .limit(15);
  if (term) {
    query = query.or(
      `name.ilike.%${term}%,sku.ilike.%${term}%,part_numbers.cs.{${term}},part_numbers.cs.{${term.toUpperCase()}}`,
    );
  }
  const { data: items } = await query;
  const rows = (items ?? []) as { id: string; sku: string | null; name: string; part_numbers: string[] }[];
  if (!rows.length) return [];

  const { data: lotRows } = await supabase
    .from("stock_lots")
    .select("id, item_id, supplier_id, unit_cost_cents, remaining_qty, created_at")
    .in("item_id", rows.map((r) => r.id))
    .gt("remaining_qty", 0)
    .order("created_at");
  const lots = (lotRows ?? []) as {
    id: string;
    item_id: string;
    supplier_id: string | null;
    unit_cost_cents: number | null;
    remaining_qty: number;
  }[];

  const supplierIds = [...new Set(lots.map((l) => l.supplier_id).filter((x): x is string => !!x))];
  const { data: sups } = supplierIds.length
    ? await supabase.from("suppliers").select("id, name").in("id", supplierIds)
    : { data: [] };
  const supplierById = new Map(((sups ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name]));

  return rows
    .map((r) => {
      const mine: LotOption[] = lots
        .filter((l) => l.item_id === r.id)
        .map((l) => ({
          id: l.id,
          supplier: l.supplier_id ? (supplierById.get(l.supplier_id) ?? "") : "",
          costCents: l.unit_cost_cents === null ? null : Number(l.unit_cost_cents),
          remaining: Number(l.remaining_qty),
        }))
        // Más barato primero; sin costo conocido, al final.
        .sort((a, b) => (a.costCents ?? Infinity) - (b.costCents ?? Infinity));
      return {
        id: r.id,
        name: r.name,
        sku: r.sku,
        partNumbers: r.part_numbers ?? [],
        onHand: mine.reduce((s, l) => s + l.remaining, 0),
        lots: mine,
      };
    })
    // Con existencias primero.
    .sort((a, b) => Number(b.onHand > 0) - Number(a.onHand > 0));
}

export async function reserveStock(
  org: string,
  contractId: string,
  lineId: string,
  lotId: string,
  rawQty: string,
): Promise<SupplyState> {
  const qty = parseDecimal(rawQty);
  if (qty === null || qty <= 0) return { error: "Escribe una cantidad mayor a 0, con máximo 2 decimales." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("supply_reserve", {
    p_line_id: lineId,
    p_lot_id: lotId,
    p_qty: qty,
    p_note: "",
  });
  if (error) return { error: friendly(error) };
  refresh(org, contractId);
  return { ok: true };
}

export async function releaseSource(org: string, contractId: string, sourceId: string): Promise<SupplyState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("supply_release", { p_source_id: sourceId, p_note: "" });
  if (error) return { error: friendly(error) };
  refresh(org, contractId);
  return { ok: true };
}
