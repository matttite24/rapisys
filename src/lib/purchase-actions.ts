"use server";

import { revalidatePath } from "next/cache";
import { MAX_CENTS, parseDecimal } from "@/lib/money";
import { getOrgId } from "@/lib/orgs";
import { findItems } from "@/lib/item-search";
import { cleanSearch } from "@/lib/search";
import { createClient } from "@/lib/supabase/server";
import { SCHEMA_MESSAGE, isSchemaError, logDbError, type DbError } from "@/lib/db-error";

function friendly(error: DbError) {
  const m = error.message;
  if (error.code === "42501" || m === "forbidden") return "No tienes permiso para hacer esto.";
  if (m === "not_in_progress") return "Las compras se registran cuando el contrato está En ejecución.";
  if (m === "bad_supplier") return "El proveedor no es válido.";
  if (m === "bad_invoice") return "Escribe el número y la fecha de la factura.";
  if (m === "no_lines") return "Agrega al menos una línea a la factura.";
  if (m === "bad_item") return "Algún producto no es válido.";
  if (m === "bad_quantity") return "Revisa cantidades y costos: deben ser mayores a 0.";
  if (m === "duplicate_invoice") return "Ese proveedor ya tiene una factura con ese número en este contrato.";
  if (m === "over_assigned") return "No se puede asignar más de lo que trae la línea de la factura.";
  if (m === "over_covered") return "Eso supera lo que pide la línea del contrato.";
  if (m === "line_not_found") return "No encontramos la línea del contrato.";
  if (m === "over_received") return "No puedes recibir más de lo que falta de esa línea.";
  if (m === "has_received") return "La factura ya tiene unidades recibidas: no se puede eliminar.";
  logDbError("compras", error);
  if (isSchemaError(error)) return SCHEMA_MESSAGE;
  return "No se pudo completar la acción. Inténtalo de nuevo.";
}

const refresh = (org: string, contractId: string) => {
  revalidatePath(`/${org}/contratos/${contractId}`, "layout");
  revalidatePath(`/${org}/bodega`);
};

export type ItemOption = {
  id: string;
  name: string;
  sku: string | null;
  partNumbers: string[];
  // Costo y IVA que tiene registrados cada proveedor para este producto (referencia).
  prices: { supplierId: string; costCents: number; vat: number }[];
};

// Productos de la bodega para elegir en una línea de factura.
export async function searchItems(org: string, q: string): Promise<ItemOption[]> {
  const orgId = await getOrgId(org);
  if (!orgId) return [];
  const term = cleanSearch(q);
  const supabase = await createClient();
  const rows = await findItems(supabase, orgId, term);
  if (!rows.length) return [];

  const { data: prices } = await supabase
    .from("item_supplier_prices")
    .select("item_id, supplier_id, unit_cost_cents, vat_rate")
    .in("item_id", rows.map((r) => r.id));
  const byItem = new Map<string, ItemOption["prices"]>();
  for (const p of (prices ?? []) as { item_id: string; supplier_id: string; unit_cost_cents: number; vat_rate: number }[]) {
    const list = byItem.get(p.item_id) ?? [];
    list.push({ supplierId: p.supplier_id, costCents: Number(p.unit_cost_cents), vat: Number(p.vat_rate) });
    byItem.set(p.item_id, list);
  }
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    sku: r.sku,
    partNumbers: r.part_numbers ?? [],
    prices: byItem.get(r.id) ?? [],
  }));
}

export type CoverableLine = {
  id: string;
  listName: string;
  n: number;
  partNumber: string;
  description: string;
  unit: string;
  // Unidades que aún no tienen reserva ni compra.
  open: number;
};

// Líneas del contrato que todavía necesitan cubrirse (para asignarles una compra).
export async function searchCoverable(contractId: string, q: string): Promise<CoverableLine[]> {
  const term = cleanSearch(q);
  const supabase = await createClient();
  let query = supabase
    .from("contract_item_supply")
    .select("id, list_id, n, part_number, description, unit, quantity, reserved, purchased")
    .eq("contract_id", contractId)
    .order("list_id")
    .order("n")
    .limit(400);
  if (term) query = query.or(`part_number.ilike.%${term}%,description.ilike.%${term}%`);
  const { data } = await query;
  const rows = ((data ?? []) as {
    id: string;
    list_id: string;
    n: number;
    part_number: string | null;
    description: string;
    unit: string;
    quantity: number;
    reserved: number;
    purchased: number;
  }[])
    .map((r) => ({ ...r, open: Number(r.quantity) - Number(r.reserved) - Number(r.purchased) }))
    .filter((r) => r.open > 0)
    .slice(0, 25);
  if (!rows.length) return [];

  const { data: lists } = await supabase
    .from("contract_lists")
    .select("id, name")
    .in("id", [...new Set(rows.map((r) => r.list_id))]);
  const name = new Map(((lists ?? []) as { id: string; name: string }[]).map((l) => [l.id, l.name]));
  return rows.map((r) => ({
    id: r.id,
    listName: name.get(r.list_id) ?? "",
    n: Number(r.n),
    partNumber: r.part_number ?? "",
    description: r.description,
    unit: r.unit,
    open: r.open,
  }));
}

export type PurchaseInput = {
  supplierId: string;
  number: string;
  date: string;
  notes: string;
  lines: {
    itemId: string;
    quantity: string;
    unitCostCents: number;
    vatRate: string;
    // Línea del contrato a la que se asigna (opcional) y cuántas unidades.
    contractLineId?: string;
    assignQty?: string;
  }[];
};
export type PurchaseResult = { error?: string; id?: string } | undefined;

export async function createPurchase(org: string, contractId: string, input: PurchaseInput): Promise<PurchaseResult> {
  if (!input.supplierId) return { error: "Elige el proveedor." };
  if (!input.number.trim()) return { error: "Escribe el número de la factura." };
  if (input.number.length > 60) return { error: "El número de la factura admite máximo 60 caracteres." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { error: "Elige la fecha de la factura." };
  if (input.notes.length > 500) return { error: "Las notas admiten máximo 500 caracteres." };
  if (!input.lines.length) return { error: "Agrega al menos una línea a la factura." };

  const lines = [];
  for (const [i, l] of input.lines.entries()) {
    const qty = parseDecimal(l.quantity);
    const vat = parseDecimal(l.vatRate);
    if (!l.itemId) return { error: `Línea ${i + 1}: elige el producto.` };
    if (qty === null || qty <= 0 || qty > 10_000_000) return { error: `Línea ${i + 1}: la cantidad debe ser mayor a 0.` };
    if (!Number.isInteger(l.unitCostCents) || l.unitCostCents < 0 || l.unitCostCents > MAX_CENTS) {
      return { error: `Línea ${i + 1}: revisa el costo.` };
    }
    if (vat === null || vat < 0 || vat > 100) return { error: `Línea ${i + 1}: el IVA debe estar entre 0 y 100.` };
    let assign: number | undefined;
    if (l.contractLineId) {
      assign = parseDecimal(l.assignQty ?? "") ?? undefined;
      if (assign === undefined || assign <= 0 || assign > qty) {
        return { error: `Línea ${i + 1}: las unidades a asignar deben estar entre 0,01 y ${qty}.` };
      }
    }
    lines.push({
      item_id: l.itemId,
      quantity: qty,
      unit_cost_cents: l.unitCostCents,
      vat_rate: vat,
      contract_item_id: l.contractLineId || null,
      assign_qty: assign ?? null,
    });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("purchase_create", {
    p_contract_id: contractId,
    p_supplier_id: input.supplierId,
    p_number: input.number,
    p_date: input.date,
    p_notes: input.notes,
    p_lines: lines,
  });
  if (error) return { error: friendly(error) };
  refresh(org, contractId);
  return { id: data as string };
}

export async function deletePurchase(org: string, contractId: string, purchaseId: string): Promise<PurchaseResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("purchase_delete", { p_purchase_id: purchaseId });
  if (error) return { error: friendly(error) };
  refresh(org, contractId);
  return {};
}

export type PurchaseOption = {
  id: string; // línea de factura
  invoice: string;
  supplier: string;
  itemName: string;
  unitCostCents: number;
  // Unidades de la línea de factura que aún no se asignaron a ninguna línea del contrato.
  available: number;
};

// Líneas de facturas del contrato con unidades por asignar, filtradas por lo que se busca.
export async function getPurchaseOptions(contractId: string, q: string): Promise<PurchaseOption[]> {
  const term = cleanSearch(q).toLowerCase();
  const supabase = await createClient();
  const { data: purchases } = await supabase
    .from("purchases")
    .select("id, number, supplier_id")
    .eq("contract_id", contractId)
    .limit(500);
  const ps = (purchases ?? []) as { id: string; number: string; supplier_id: string }[];
  if (!ps.length) return [];

  const { data: pls } = await supabase
    .from("purchase_lines")
    .select("id, purchase_id, item_id, quantity, unit_cost_cents, received_qty")
    .in("purchase_id", ps.map((p) => p.id));
  const lines = (pls ?? []) as {
    id: string;
    purchase_id: string;
    item_id: string;
    quantity: number;
    unit_cost_cents: number;
    received_qty: number;
  }[];
  if (!lines.length) return [];

  const [{ data: assigned }, { data: items }, { data: sups }] = await Promise.all([
    supabase
      .from("supply_sources")
      .select("purchase_line_id, quantity")
      .eq("kind", "compra")
      .in("purchase_line_id", lines.map((l) => l.id)),
    supabase.from("items").select("id, name, sku, part_numbers").in("id", [...new Set(lines.map((l) => l.item_id))]),
    supabase.from("suppliers").select("id, name").in("id", [...new Set(ps.map((p) => p.supplier_id))]),
  ]);
  const used = new Map<string, number>();
  for (const a of (assigned ?? []) as { purchase_line_id: string; quantity: number }[]) {
    used.set(a.purchase_line_id, (used.get(a.purchase_line_id) ?? 0) + Number(a.quantity));
  }
  const itemById = new Map(
    ((items ?? []) as { id: string; name: string; sku: string | null; part_numbers: string[] }[]).map((i) => [i.id, i]),
  );
  const supplierById = new Map(((sups ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name]));
  const purchaseById = new Map(ps.map((p) => [p.id, p]));

  return lines
    .map((l) => {
      const item = itemById.get(l.item_id);
      const p = purchaseById.get(l.purchase_id)!;
      return {
        id: l.id,
        invoice: p.number,
        supplier: supplierById.get(p.supplier_id) ?? "",
        itemName: item?.name ?? "Producto eliminado",
        haystack: [item?.name, item?.sku, ...(item?.part_numbers ?? [])].join(" ").toLowerCase(),
        unitCostCents: Number(l.unit_cost_cents),
        // Por recibir y sin destino: lo recibido ya es existencia y se reserva desde la bodega.
        available: Number(l.quantity) - Number(l.received_qty) - (used.get(l.id) ?? 0),
      };
    })
    .filter((o) => o.available > 0 && (!term || o.haystack.includes(term)))
    .slice(0, 15)
    .map(({ haystack: _h, ...o }) => {
      void _h;
      return o;
    });
}

export async function assignPurchase(
  org: string,
  contractId: string,
  purchaseLineId: string,
  lineId: string,
  rawQty: string,
): Promise<PurchaseResult> {
  const qty = parseDecimal(rawQty);
  if (qty === null || qty <= 0) return { error: "Escribe una cantidad mayor a 0, con máximo 2 decimales." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("purchase_assign", { p_purchase_line_id: purchaseLineId, p_line_id: lineId, p_qty: qty });
  if (error) return { error: friendly(error) };
  refresh(org, contractId);
  return {};
}

// Recibir unidades de una línea de factura: entran a la bodega y se reservan para lo asignado.
export async function receivePurchaseLine(
  org: string,
  contractId: string,
  purchaseLineId: string,
  rawQty: string,
): Promise<PurchaseResult> {
  const qty = parseDecimal(rawQty);
  if (qty === null || qty <= 0) return { error: "Escribe una cantidad mayor a 0, con máximo 2 decimales." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("purchase_receive", { p_purchase_line_id: purchaseLineId, p_qty: qty });
  if (error) return { error: friendly(error) };
  refresh(org, contractId);
  return {};
}

// Recibir todo lo que falta de una factura.
export async function receiveAllPurchase(org: string, contractId: string, purchaseId: string): Promise<PurchaseResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("purchase_receive_all", { p_purchase_id: purchaseId });
  if (error) return { error: friendly(error) };
  refresh(org, contractId);
  return {};
}
