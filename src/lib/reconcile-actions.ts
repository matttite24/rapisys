"use server";

import { revalidatePath } from "next/cache";
import { getOrgId } from "@/lib/orgs";
import { logDbError } from "@/lib/db-error";
import { createClient } from "@/lib/supabase/server";

export type InvoiceLine = {
  id: string; // línea de factura
  itemId: string;
  name: string;
  sku: string | null;
  partNumbers: string[];
  // Código tal como vino en la factura; si no hay, el del producto.
  code: string;
  unitCostCents: number;
  quantity: number;
  received: number;
  // Unidades ya tomadas por líneas del contrato (de la bodega o reservadas por llegar).
  assigned: number;
  // Por llegar y sin reservar.
  available: number;
  // Ya llegó y sigue libre en la bodega (lotes de esta línea de factura con existencias).
  inStock: number;
  lots: { id: string; remaining: number }[];
  // Lo que todavía se puede asignar de esta línea: lo que ya llegó y lo que viene.
  free: number;
};

// Líneas de una factura completa del contrato, en el orden de la factura, con lo que ya se asignó de cada una.
export async function getInvoiceLines(org: string, contractId: string, invoiceId: string): Promise<InvoiceLine[]> {
  const orgId = await getOrgId(org);
  if (!orgId) return [];
  const supabase = await createClient();

  const { data: pls, error: lineError } = await supabase
    .from("purchase_lines")
    .select(
      "id, item_id, quantity, unit_cost_cents, received_qty, xml_code, new_part_number, purchases!inner(contract_id, status)",
    )
    .eq("purchase_id", invoiceId)
    .eq("purchases.contract_id", contractId)
    .eq("purchases.status", "complete")
    .order("position")
    .order("id")
    .limit(1000);
  if (lineError) { logDbError("productos de factura", lineError); throw new Error("No se pudieron cargar los productos."); }
  const lines = (pls ?? []) as unknown as {
    id: string;
    item_id: string;
    quantity: number;
    unit_cost_cents: number;
    received_qty: number;
    xml_code: string | null;
    new_part_number: string | null;
  }[];
  if (!lines.length) return [];

  const [itemResult, sourceResult, lotResult] = await Promise.all([
    supabase.from("items").select("id, name, sku, part_numbers").in("id", [...new Set(lines.map((l) => l.item_id))]),
    supabase.from("supply_sources").select("purchase_line_id, kind, quantity").in("purchase_line_id", lines.map((l) => l.id)),
    supabase
      .from("stock_lots")
      .select("id, purchase_line_id, remaining_qty, created_at")
      .in("purchase_line_id", lines.map((l) => l.id))
      .gt("remaining_qty", 0)
      .order("created_at"),
  ]);
  for (const result of [itemResult, sourceResult, lotResult]) {
    if (result.error) { logDbError("productos de factura", result.error); throw new Error("No se pudieron cargar los productos."); }
  }
  const items = itemResult.data;
  const sources = sourceResult.data;
  const lotRows = lotResult.data;
  const lotsByLine = new Map<string, { id: string; remaining: number }[]>();
  for (const r of (lotRows ?? []) as { id: string; purchase_line_id: string; remaining_qty: number }[]) {
    lotsByLine.set(r.purchase_line_id, [...(lotsByLine.get(r.purchase_line_id) ?? []), { id: r.id, remaining: Number(r.remaining_qty) }]);
  }
  const itemById = new Map(
    ((items ?? []) as { id: string; name: string; sku: string | null; part_numbers: string[] }[]).map((i) => [i.id, i]),
  );
  const assigned = new Map<string, number>();
  const pending = new Map<string, number>(); // lo reservado "por llegar" (kind compra)
  for (const s of (sources ?? []) as { purchase_line_id: string; kind: string; quantity: number }[]) {
    assigned.set(s.purchase_line_id, (assigned.get(s.purchase_line_id) ?? 0) + Number(s.quantity));
    if (s.kind === "compra") pending.set(s.purchase_line_id, (pending.get(s.purchase_line_id) ?? 0) + Number(s.quantity));
  }

  return lines.map((l) => {
    const item = itemById.get(l.item_id);
    const quantity = Number(l.quantity);
    const received = Number(l.received_qty);
    const lots = lotsByLine.get(l.id) ?? [];
    const inStock = lots.reduce((n, x) => n + x.remaining, 0);
    const available = Math.max(0, quantity - received - (pending.get(l.id) ?? 0));
    return {
      id: l.id,
      itemId: l.item_id,
      name: item?.name ?? "Producto eliminado",
      sku: item?.sku ?? null,
      partNumbers: item?.part_numbers ?? [],
      code: l.new_part_number || l.xml_code || item?.part_numbers?.[0] || item?.sku || "",
      unitCostCents: Number(l.unit_cost_cents),
      quantity,
      received,
      assigned: assigned.get(l.id) ?? 0,
      available,
      inStock,
      lots,
      free: available + inStock,
    };
  });
}

const norm = (v: string) => v.toUpperCase().replace(/[\s\-_.]+/g, "");

export type Proposal = {
  key: string;
  purchaseLineId: string;
  code: string;
  name: string;
  targetId: string;
  targetN: number;
  listName: string;
  targetPart: string;
  qty: number;
  // De dónde sale: un lote que ya llegó (lotId) o lo que aún viene por llegar en la factura.
  lotId?: string;
};

// Cruza las líneas de la factura que aún tienen unidades por reservar con las líneas pendientes del contrato por
// número de parte (sin importar mayúsculas, espacios ni guiones). Reparte en el orden de la factura y de las listas,
// descontando lo que ya se propuso, así dos líneas con el mismo código no se pasan de lo que pide el contrato.
export async function proposeMatches(
  org: string,
  contractId: string,
  invoiceId: string,
): Promise<{ proposals: Proposal[]; unmatched: number }> {
  const lines = (await getInvoiceLines(org, contractId, invoiceId)).filter((l) => l.free > 0);
  if (!lines.length) return { proposals: [], unmatched: 0 };

  const supabase = await createClient();
  // Solo las líneas con número de parte y unidades por cubrir, filtradas en la base.
  const { data } = await supabase.rpc("contract_open_lines", { p_contract_id: contractId });
  const rows = ((data ?? []) as {
    id: string;
    list_id: string;
    n: number;
    part_number: string;
    description: string;
    quantity: number;
    reserved: number;
    purchased: number;
  }[])
    .map((r) => ({ ...r, open: Number(r.quantity) - Number(r.reserved) - Number(r.purchased) }))
    .filter((r) => r.open > 0 && r.part_number.trim() !== "");
  if (!rows.length) return { proposals: [], unmatched: lines.length };

  const { data: lists } = await supabase
    .from("contract_lists")
    .select("id, name")
    .in("id", [...new Set(rows.map((r) => r.list_id))]);
  const listName = new Map(((lists ?? []) as { id: string; name: string }[]).map((l) => [l.id, l.name]));

  const byCode = new Map<string, typeof rows>();
  for (const r of rows) {
    const k = norm(r.part_number);
    byCode.set(k, [...(byCode.get(k) ?? []), r]);
  }
  const left = new Map(rows.map((r) => [r.id, r.open]));

  const proposals: Proposal[] = [];
  let unmatched = 0;
  for (const l of lines) {
    const codes = [...new Set([l.code, l.sku ?? "", ...l.partNumbers].filter(Boolean).map(norm))];
    // Primero lo que ya llegó (lotes libres), después lo que viene por llegar.
    const stock = l.lots.map((x) => ({ ...x }));
    let pendingLeft = l.available;
    let any = false;
    for (const c of codes) {
      for (const t of byCode.get(c) ?? []) {
        let room = left.get(t.id) ?? 0;
        while (room > 0) {
          const lot = stock.find((x) => x.remaining > 0);
          if (!lot && pendingLeft <= 0) break;
          const qty = Math.min(room, lot ? lot.remaining : pendingLeft);
          if (lot) lot.remaining -= qty;
          else pendingLeft -= qty;
          room -= qty;
          any = true;
          proposals.push({
            key: `${l.id}:${t.id}:${lot?.id ?? "llegar"}`,
            purchaseLineId: l.id,
            code: l.code,
            name: l.name,
            targetId: t.id,
            targetN: Number(t.n),
            listName: listName.get(t.list_id) ?? "",
            targetPart: t.part_number,
            qty,
            lotId: lot?.id,
          });
        }
        left.set(t.id, room);
      }
    }
    if (!any) unmatched++;
  }
  return { proposals, unmatched };
}

function friendlyMany(message: string): string {
  if (message === "over_covered") return "Alguna línea del contrato ya no necesita tantas unidades. Vuelve a proponer.";
  if (message === "insufficient") return "Un lote ya no tiene tantas unidades. Vuelve a proponer.";
  if (message === "over_assigned") return "Alguna línea de la factura ya no tiene tantas unidades libres. Vuelve a proponer.";
  if (message === "not_in_progress") return "El abastecimiento se trabaja cuando el contrato está En ejecución.";
  if (message === "forbidden") return "No tienes permiso para hacer esto.";
  if (message === "draft_purchase") return "La factura sigue en borrador: complétala primero.";
  return "No se pudo completar la acción. Inténtalo de nuevo.";
}

// Reserva todas las propuestas aceptadas, juntas: si una falla no se reserva ninguna.
export async function applyMatches(
  org: string,
  contractId: string,
  items: { purchaseLineId: string; targetId: string; qty: number; lotId?: string }[],
): Promise<{ ids?: string[]; error?: string }> {
  if (!items.length || items.length > 500) return { error: "Elige entre 1 y 500 reservas." };
  if (items.some((i) => !(i.qty > 0) || i.qty > 10_000_000)) return { error: "Hay una cantidad inválida." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("purchase_assign_many", {
    p_items: items.map((i) => ({ purchase_line_id: i.purchaseLineId, line_id: i.targetId, qty: i.qty, lot_id: i.lotId ?? null })),
  });
  if (error) {
    if (!["over_covered", "over_assigned", "insufficient", "not_in_progress", "forbidden", "draft_purchase"].includes(error.message)) logDbError("conciliar", error);
    return { error: friendlyMany(error.message) };
  }
  revalidatePath(`/${org}/contratos/${contractId}`, "layout");
  return { ids: (data ?? []) as string[] };
}

// Deshace una reserva en bloque.
export async function undoMatches(org: string, contractId: string, ids: string[]): Promise<{ error?: string }> {
  if (!ids.length) return {};
  const supabase = await createClient();
  const { error } = await supabase.rpc("supply_release_many", { p_ids: ids });
  if (error) return { error: friendlyMany(error.message) };
  revalidatePath(`/${org}/contratos/${contractId}`, "layout");
  return {};
}
