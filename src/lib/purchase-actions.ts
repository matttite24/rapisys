"use server";

import { revalidatePath } from "next/cache";
import { MAX_CENTS, parseDecimal } from "@/lib/money";
import { getOrgId } from "@/lib/orgs";
import { findItems } from "@/lib/item-search";
import { codesInText } from "@/lib/sri-xml";
import { cleanSearch } from "@/lib/search";
import { createClient } from "@/lib/supabase/server";
import { SCHEMA_MESSAGE, isSchemaError, logDbError, type DbError } from "@/lib/db-error";

function friendly(error: DbError) {
  const m = error.message;
  if (error.code === "42501" || m === "forbidden") return "No tienes permiso para hacer esto.";
  if (m === "not_in_progress") return "Las compras se registran cuando el contrato está En ejecución.";
  if (m === "bad_supplier") return "Elige el proveedor.";
  if (m === "bad_invoice") return "Escribe el número y la fecha de la factura.";
  if (m === "no_lines") return "Agrega al menos una línea a la factura.";
  if (m === "bad_item") return "Hay líneas sin producto, o algún producto no es válido.";
  if (m === "not_draft") return "Esta factura ya está completa y no se puede editar.";
  if (m === "draft_purchase") return "La factura sigue en borrador: complétala primero.";
  if (m === "bad_quantity") return "Revisa cantidades y costos: deben ser mayores a 0.";
  if (error.code === "23505") return "Ese proveedor ya tiene una factura con ese número en este contrato.";
  if (m === "duplicate_invoice") return "Ese proveedor ya tiene una factura con ese número en este contrato.";
  if (m === "over_assigned") return "No se puede reservar más de lo que trae la línea de la factura.";
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

export type SupplierOption = { id: string; name: string; ruc: string | null };

// Proveedores de la organización que coinciden con el texto, por nombre o RUC (máx. 15).
export async function searchSuppliers(org: string, q: string): Promise<SupplierOption[]> {
  const orgId = await getOrgId(org);
  if (!orgId) return [];
  const term = cleanSearch(q);
  const supabase = await createClient();
  let query = supabase.from("suppliers").select("id, name, ruc").eq("organization_id", orgId).order("name").limit(15);
  if (term) query = query.or(`name.ilike.%${term}%,ruc.ilike.%${term}%`);
  const { data } = await query;
  return (data ?? []) as SupplierOption[];
}

export type XmlLineMatch = {
  item: ItemOption | null;
  // Cómo se encontró el producto: por el código del proveedor o por un número de parte dentro de la descripción.
  how: "code" | "description" | null;
};

// Empareja las líneas de una factura leída del XML: proveedor por RUC y productos por código (o por números
// de parte que aparezcan en la descripción). Consulta por lotes. Asignar al contrato se hace después, en Abastecimiento.
export async function matchXmlLines(
  org: string,
  input: { supplierRuc: string; lines: { code: string; description: string }[] },
): Promise<{ supplier: { id: string; name: string } | null; lines: XmlLineMatch[] } | undefined> {
  const orgId = await getOrgId(org);
  if (!orgId || input.lines.length > 1000) return undefined;
  const supabase = await createClient();

  const { data: sup } = input.supplierRuc
    ? await supabase.from("suppliers").select("id, name").eq("organization_id", orgId).eq("ruc", input.supplierRuc).limit(1)
    : { data: [] };
  const supplier = ((sup ?? []) as { id: string; name: string }[])[0] ?? null;

  const byCode = input.lines.map((l) => (l.code ? [l.code.toUpperCase()] : []));
  const byText = input.lines.map((l) => codesInText(l.description));
  const keys = [...new Set([...byCode.flat(), ...byText.flat()])].slice(0, 1500);
  const variants = [...new Set(keys.flatMap((k) => [k, k.toLowerCase()]))];

  type Row = { id: string; sku: string | null; name: string; part_numbers: string[] };
  const found = new Map<string, Row>();
  if (keys.length) {
    const base = () => supabase.from("items").select("id, sku, name, part_numbers").eq("organization_id", orgId).eq("is_active", true);
    const [a, b] = await Promise.all([base().in("sku", variants), base().overlaps("part_numbers", variants)]);
    for (const r of [...((a.data ?? []) as Row[]), ...((b.data ?? []) as Row[])]) found.set(r.id, r);
  }
  const itemsByKey = new Map<string, Row[]>();
  for (const r of found.values()) {
    for (const k of new Set([r.sku, ...(r.part_numbers ?? [])].filter(Boolean).map((x) => x!.toUpperCase()))) {
      itemsByKey.set(k, [...(itemsByKey.get(k) ?? []), r]);
    }
  }
  // Un código que coincide con varios productos es ambiguo: no se adivina.
  const unique = (k: string) => {
    const hit = itemsByKey.get(k);
    return hit?.length === 1 ? hit[0] : null;
  };

  const picks = input.lines.map((_, i) => {
    for (const k of byCode[i]) {
      const r = unique(k);
      if (r) return { row: r, how: "code" as const };
    }
    for (const k of byText[i]) {
      const r = unique(k);
      if (r) return { row: r, how: "description" as const };
    }
    return null;
  });

  const ids = [...new Set(picks.flatMap((p) => (p ? [p.row.id] : [])))];
  const prices = new Map<string, ItemOption["prices"]>();
  if (ids.length) {
    const { data } = await supabase.from("item_supplier_prices").select("item_id, supplier_id, unit_cost_cents, vat_rate").in("item_id", ids);
    for (const p of (data ?? []) as { item_id: string; supplier_id: string; unit_cost_cents: number; vat_rate: number }[]) {
      prices.set(p.item_id, [...(prices.get(p.item_id) ?? []), { supplierId: p.supplier_id, costCents: Number(p.unit_cost_cents), vat: Number(p.vat_rate) }]);
    }
  }

  const lines: XmlLineMatch[] = picks.map((p) =>
    p
      ? {
          item: { id: p.row.id, name: p.row.name, sku: p.row.sku, partNumbers: p.row.part_numbers ?? [], prices: prices.get(p.row.id) ?? [] },
          how: p.how,
        }
      : { item: null, how: null },
  );
  return { supplier, lines };
}

// Datos de la factura electrónica del SRI que se cargó; se guardan con la factura.
export type XmlInfo = {
  fileName: string;
  accessKey: string;
  authorization: string;
  authorizedAt: string;
  buyerRuc: string;
  buyerName: string;
  subtotalCents: number;
  totalCents: number;
};

export type PurchaseInput = {
  xml?: XmlInfo | null;
  supplierId: string;
  number: string;
  date: string;
  notes: string;
  lines: {
    itemId?: string; // un borrador puede tener líneas sin producto
    quantity: string;
    unitCostCents: number;
    // Subtotal exacto de la línea (viene del XML del SRI); si falta, es cantidad x costo.
    lineTotalCents?: number;
    vatRate: string;
    // Lo que decía el XML en esta línea.
    xmlCode?: string;
    xmlDescription?: string;
    // Línea sin producto que se crea como producto nuevo al completar (número de parte y nombre ya editados).
    createItem?: boolean;
    newPartNumber?: string;
    newName?: string;
    // La persona confirmó el producto emparejado.
    verified?: boolean;
  }[];
};
export type PurchaseResult = { error?: string; id?: string } | undefined;

// Guarda la factura como borrador (nueva o reemplazando el borrador `draftId`). No toca el abastecimiento.
export async function savePurchaseDraft(
  org: string,
  contractId: string,
  draftId: string | null,
  input: PurchaseInput,
): Promise<PurchaseResult> {
  if (input.number.length > 60) return { error: "El número de la factura admite máximo 60 caracteres." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { error: "Elige la fecha de la factura." };
  if (input.notes.length > 500) return { error: "Las notas admiten máximo 500 caracteres." };
  if (input.lines.length > 1000) return { error: "Una factura admite hasta 1.000 líneas." };

  const lines = [];
  for (const [i, l] of input.lines.entries()) {
    const qty = parseDecimal(l.quantity);
    const vat = parseDecimal(l.vatRate);
    if (qty === null || qty <= 0 || qty > 10_000_000) return { error: `Línea ${i + 1}: la cantidad debe ser mayor a 0.` };
    if (!Number.isInteger(l.unitCostCents) || l.unitCostCents < 0 || l.unitCostCents > MAX_CENTS) {
      return { error: `Línea ${i + 1}: revisa el costo.` };
    }
    if (vat === null || vat < 0 || vat > 100) return { error: `Línea ${i + 1}: el IVA debe estar entre 0 y 100.` };
    if (l.lineTotalCents !== undefined && (!Number.isInteger(l.lineTotalCents) || l.lineTotalCents < 0 || l.lineTotalCents > MAX_CENTS)) {
      return { error: `Línea ${i + 1}: revisa el subtotal.` };
    }
    lines.push({
      item_id: l.itemId || null,
      quantity: qty,
      unit_cost_cents: l.unitCostCents,
      line_total_cents: l.lineTotalCents ?? null,
      vat_rate: vat,
      xml_code: l.xmlCode?.slice(0, 300) || null,
      xml_description: l.xmlDescription?.slice(0, 300) || null,
      create_item: !l.itemId && !!l.createItem,
      new_part_number: l.newPartNumber?.trim().slice(0, 60) || null,
      new_name: l.newName?.trim().slice(0, 300) || null,
      verified: !!l.verified && !!l.itemId,
    });
  }

  const x = input.xml;
  const clip = (v: unknown, n: number) => String(v ?? "").slice(0, n);
  const xml = x
    ? {
        file_name: clip(x.fileName, 200),
        access_key: clip(x.accessKey, 60),
        authorization: clip(x.authorization, 60),
        authorized_at: clip(x.authorizedAt, 40),
        buyer_ruc: clip(x.buyerRuc, 20),
        buyer_name: clip(x.buyerName, 300),
        subtotal_cents: Number.isInteger(x.subtotalCents) ? x.subtotalCents : 0,
        total_cents: Number.isInteger(x.totalCents) ? x.totalCents : 0,
      }
    : null;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("purchase_save_draft", {
    p_contract_id: contractId,
    p_id: draftId,
    p_supplier_id: input.supplierId || null,
    p_number: input.number,
    p_date: input.date,
    p_notes: input.notes,
    p_lines: lines,
    p_xml: xml,
  });
  if (error) return { error: friendly(error) };
  refresh(org, contractId);
  return { id: data as string };
}

// Pasa el borrador a factura completa: exige proveedor, número y producto en todas las líneas.
export async function completePurchase(org: string, contractId: string, purchaseId: string): Promise<PurchaseResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("purchase_complete", { p_purchase_id: purchaseId });
  if (error) return { error: friendly(error) };
  refresh(org, contractId);
  return { id: purchaseId };
}

export async function deletePurchase(org: string, contractId: string, purchaseId: string): Promise<PurchaseResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("purchase_delete", { p_purchase_id: purchaseId });
  if (error) return { error: friendly(error) };
  refresh(org, contractId);
  return {};
}

export type ContractInvoice = { id: string; number: string; supplier: string };

// Facturas completas del contrato, para filtrar la búsqueda de abastecimiento por una de ellas.
export async function listContractInvoices(contractId: string): Promise<ContractInvoice[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("purchases")
    .select("id, number, supplier_id")
    .eq("contract_id", contractId)
    .eq("status", "complete")
    .order("purchased_on", { ascending: false })
    .limit(200);
  if (error) throw new Error(friendly(error));
  const ps = (data ?? []) as { id: string; number: string; supplier_id: string }[];
  if (!ps.length) return [];
  const { data: sups, error: supplierError } = await supabase.from("suppliers").select("id, name").in("id", [...new Set(ps.map((p) => p.supplier_id))]);
  if (supplierError) throw new Error(friendly(supplierError));
  const name = new Map(((sups ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name]));
  return ps.map((p) => ({ id: p.id, number: p.number, supplier: name.get(p.supplier_id) ?? "" }));
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
  const { data, error } = await supabase.rpc("purchase_assign", { p_purchase_line_id: purchaseLineId, p_line_id: lineId, p_qty: qty });
  if (error) return { error: friendly(error) };
  refresh(org, contractId);
  // `id` es el tramo creado en la línea del contrato: sirve para deshacer.
  return { id: data as string };
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
