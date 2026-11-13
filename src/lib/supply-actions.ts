"use server";

import { revalidatePath } from "next/cache";
import { parseDecimal } from "@/lib/money";
import { getOrgId } from "@/lib/orgs";
import { findItems } from "@/lib/item-search";
import { cleanSearch } from "@/lib/search";
import { createClient } from "@/lib/supabase/server";
import { SCHEMA_MESSAGE, isSchemaError, logDbError, type DbError } from "@/lib/db-error";

export type SupplyState = { error?: string; ok?: boolean; id?: string } | undefined;

function friendly(error: DbError) {
  if (error.code === "42501" || error.message === "forbidden") return "No tienes permiso para hacer esto.";
  if (error.message === "not_in_progress") return "El abastecimiento se trabaja cuando el contrato está En ejecución.";
  if (error.message === "insufficient") return "Ese lote no tiene tantas unidades. Actualiza la búsqueda.";
  if (error.message === "over_covered") return "Eso supera lo que pide la línea.";
  if (error.message === "bad_quantity") return "Escribe una cantidad mayor a 0.";
  if (error.message === "already_delivered") return "Esas unidades ya se entregaron: no se pueden liberar.";
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
  kind: "bodega" | "compra";
  // Para una compra: número de la factura.
  invoice: string;
  itemName: string;
  itemSku: string | null;
  partNumbers: string[];
  supplier: string;
  costCents: number | null;
  quantity: number;
};

// Lo reservado hasta ahora para una línea, con el producto y el lote de cada tramo.
export async function getLineSupply(lineId: string): Promise<SourceView[]> {
  const supabase = await createClient();
  const { data: rows, error: sourceError } = await supabase
    .from("supply_sources")
    .select("id, kind, item_id, supplier_id, purchase_line_id, unit_cost_cents, quantity")
    .eq("contract_item_id", lineId)
    .order("created_at");
  if (sourceError) throw new Error(friendly(sourceError));
  const sources = (rows ?? []) as {
    id: string;
    kind: "bodega" | "compra";
    item_id: string;
    supplier_id: string | null;
    purchase_line_id: string | null;
    unit_cost_cents: number | null;
    quantity: number;
  }[];
  if (!sources.length) return [];

  const itemIds = [...new Set(sources.map((s) => s.item_id))];
  const supplierIds = [...new Set(sources.map((s) => s.supplier_id).filter((x): x is string => !!x))];
  const plIds = sources.map((s) => s.purchase_line_id).filter((x): x is string => !!x);
  const [items, suppliers, pls] = await Promise.all([
    supabase.from("items").select("id, name, sku, part_numbers").in("id", itemIds),
    supplierIds.length ? supabase.from("suppliers").select("id, name").in("id", supplierIds) : { data: [], error: null },
    plIds.length ? supabase.from("purchase_lines").select("id, purchase_id").in("id", plIds) : { data: [], error: null },
  ]);
  for (const result of [items, suppliers, pls]) {
    if (result.error) throw new Error(friendly(result.error));
  }
  const plRows = (pls.data ?? []) as { id: string; purchase_id: string }[];
  const { data: purchaseRows, error: purchaseError } = plRows.length
    ? await supabase.from("purchases").select("id, number").in("id", [...new Set(plRows.map((p) => p.purchase_id))])
    : { data: [], error: null };
  if (purchaseError) throw new Error(friendly(purchaseError));
  const numberByPurchase = new Map(((purchaseRows ?? []) as { id: string; number: string }[]).map((p) => [p.id, p.number]));
  const invoiceByLine = new Map(plRows.map((p) => [p.id, numberByPurchase.get(p.purchase_id) ?? ""]));
  const itemById = new Map(((items.data ?? []) as { id: string; name: string; sku: string | null; part_numbers: string[] }[]).map((i) => [i.id, i]));
  const supplierById = new Map(((suppliers.data ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name]));

  return sources.map((s) => ({
    id: s.id,
    kind: s.kind,
    invoice: s.purchase_line_id ? (invoiceByLine.get(s.purchase_line_id) ?? "") : "",
    itemName: itemById.get(s.item_id)?.name ?? "Producto eliminado",
    itemSku: itemById.get(s.item_id)?.sku ?? null,
    partNumbers: itemById.get(s.item_id)?.part_numbers ?? [],
    supplier: s.supplier_id ? (supplierById.get(s.supplier_id) ?? "") : "",
    costCents: s.unit_cost_cents === null ? null : Number(s.unit_cost_cents),
    quantity: Number(s.quantity),
  }));
}

export type LotOption = { id: string; supplier: string; costCents: number | null; remaining: number };
export type StockResult = {
  id: string;
  name: string;
  tdrName?: string | null;
  sku: string | null;
  partNumbers: string[];
  onHand: number;
  lots: LotOption[];
};

const SEARCH_PAGE = 15;

// Productos de la bodega que coinciden con la búsqueda (nombre, SKU o número de parte), con sus
// lotes que aún tienen unidades. El lote más barato va primero. Sin texto no hay búsqueda: devuelve vacío.
// `more` avisa que hay más resultados de los que se muestran (máx. SEARCH_PAGE).
export async function searchStock(
  org: string,
  q: string,
  invoiceId?: string,
): Promise<{ rows: StockResult[]; more: boolean }> {
  const orgId = await getOrgId(org);
  const term = cleanSearch(q);
  if (!orgId || (!term && !invoiceId)) return { rows: [], more: false };

  const supabase = await createClient();
  let more = false;
  let rows: { id: string; sku: string | null; name: string; part_numbers: string[] }[];
  let lotFilter: string[] | null = null; // con factura: solo los lotes que vienen de sus líneas

  if (invoiceId) {
    const { data: pls } = await supabase.from("purchase_lines").select("id, item_id").eq("purchase_id", invoiceId).limit(1000);
    const lines = (pls ?? []) as { id: string; item_id: string }[];
    if (!lines.length) return { rows: [], more: false };
    lotFilter = lines.map((l) => l.id);
    const { data: itemRows } = await supabase
      .from("items")
      .select("id, sku, name, part_numbers")
      .in("id", [...new Set(lines.map((l) => l.item_id))]);
    rows = (itemRows ?? []) as typeof rows;
    if (term) {
      const t = term.toLowerCase();
      rows = rows.filter((r) => [r.name, r.sku, ...(r.part_numbers ?? [])].some((v) => v && v.toLowerCase().includes(t)));
    }
    more = rows.length > SEARCH_PAGE;
    rows = rows.slice(0, SEARCH_PAGE);
  } else {
    const found = await findItems(supabase, orgId, term, SEARCH_PAGE + 1);
    more = found.length > SEARCH_PAGE;
    rows = found.slice(0, SEARCH_PAGE);
  }
  if (!rows.length) return { rows: [], more: false };

  // Nombre TDR de cada producto (la búsqueda no lo trae).
  const { data: tdrRows } = await supabase.from("items").select("id, tdr_name").in("id", rows.map((r) => r.id));
  const tdrById = new Map(((tdrRows ?? []) as { id: string; tdr_name: string | null }[]).map((r) => [r.id, r.tdr_name]));

  let lotsQuery = supabase
    .from("stock_lots")
    .select("id, item_id, supplier_id, unit_cost_cents, remaining_qty, created_at")
    .in("item_id", rows.map((r) => r.id))
    .gt("remaining_qty", 0)
    .order("created_at");
  if (lotFilter) lotsQuery = lotsQuery.in("purchase_line_id", lotFilter);
  const { data: lotRows, error: lotError } = await lotsQuery;
  if (lotError) throw new Error(friendly(lotError));
  const lots = (lotRows ?? []) as {
    id: string;
    item_id: string;
    supplier_id: string | null;
    unit_cost_cents: number | null;
    remaining_qty: number;
  }[];

  const supplierIds = [...new Set(lots.map((l) => l.supplier_id).filter((x): x is string => !!x))];
  const { data: sups, error: supplierError } = supplierIds.length
    ? await supabase.from("suppliers").select("id, name").in("id", supplierIds)
    : { data: [], error: null };
  if (supplierError) throw new Error(friendly(supplierError));
  const supplierById = new Map(((sups ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name]));

  return {
    more,
    rows: rows
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
          tdrName: tdrById.get(r.id) ?? null,
          sku: r.sku,
          partNumbers: r.part_numbers ?? [],
          onHand: mine.reduce((s, l) => s + l.remaining, 0),
          lots: mine,
        };
      })
      // Con existencias primero.
      .sort((a, b) => Number(b.onHand > 0) - Number(a.onHand > 0)),
  };
}

// Cuántos productos tienen existencias en la bodega y cuántas unidades hay en total.
export async function getStockSummary(org: string): Promise<{ products: number; units: number } | null> {
  const orgId = await getOrgId(org);
  if (!orgId) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("stock_summary", { p_org: orgId });
  if (error) throw new Error(friendly(error));
  const r = data as { products: number; units: number } | null;
  return r ? { products: Number(r.products), units: Number(r.units) } : null;
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
  const { data, error } = await supabase.rpc("supply_reserve", {
    p_line_id: lineId,
    p_lot_id: lotId,
    p_qty: qty,
    p_note: "",
  });
  if (error) return { error: friendly(error) };
  refresh(org, contractId);
  // `id` es el tramo creado en la línea del contrato: sirve para deshacer.
  return { ok: true, id: data as string };
}

export async function releaseSource(org: string, contractId: string, sourceId: string): Promise<SupplyState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("supply_release", { p_source_id: sourceId, p_note: "" });
  if (error) return { error: friendly(error) };
  refresh(org, contractId);
  return { ok: true };
}

// Cambia la descripción de una línea de la lista (al asignarle un producto con otro nombre, p. ej. su Nombre TDR).
export async function renameLine(org: string, contractId: string, lineId: string, rawDescription: string): Promise<SupplyState> {
  const description = rawDescription.trim();
  if (!description) return { error: "Escribe el nombre de la línea." };
  if (description.length > 500) return { error: "Máximo 500 caracteres." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contract_items")
    .update({ description })
    .eq("id", lineId)
    .eq("contract_id", contractId)
    .select("id");
  if (error) return { error: friendly(error) };
  if (!data?.length) return { error: "No tienes permiso para cambiar esta línea." };
  refresh(org, contractId);
  return { ok: true };
}

// Crea la línea de la lista para un producto (proceso a crédito: la línea nace del producto, con su Nombre TDR).
export async function addLineForProduct(
  org: string,
  contractId: string,
  listId: string,
  input: { partNumber: string; description: string; quantity: number },
): Promise<{ error?: string; id?: string }> {
  const description = input.description.trim();
  const partNumber = input.partNumber.trim();
  if (!description) return { error: "Escribe el nombre de la línea." };
  if (description.length > 500) return { error: "El nombre pasa de 500 caracteres." };
  if (partNumber.length > 60) return { error: "El número de parte pasa de 60 caracteres." };
  if (!(input.quantity > 0) || input.quantity > 10_000_000) return { error: "La cantidad no es válida." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("add_contract_line", {
    p_list_id: listId,
    p_part_number: partNumber,
    p_description: description,
    p_quantity: input.quantity,
    p_unit: "unit",
    p_reference_price_cents: null,
  });
  if (error) {
    if (error.message === "list_not_found") return { error: "No encontramos la lista." };
    if (error.message === "not_in_progress") return { error: "Los items se cargan cuando el contrato está en ejecución." };
    if (error.message === "list_full") return { error: "La lista llegó a su tope de líneas." };
    return { error: friendly(error) };
  }
  refresh(org, contractId);
  return { id: data as string };
}
