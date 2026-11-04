"use server";

import { revalidatePath } from "next/cache";
import { MAX_CENTS, parseCents, parseDecimal } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { SCHEMA_MESSAGE, isSchemaError, logDbError, type DbError } from "@/lib/db-error";

export type StockState = { error?: string; fields?: Record<string, string>; ok?: boolean } | undefined;

const text = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
const MAX_QTY = 10_000_000;

function friendly(error: DbError) {
  if (error.code === "42501" || error.message === "forbidden") return "No tienes permiso para hacer esto.";
  if (error.message === "bad_supplier") return "El proveedor no es válido.";
  if (error.message === "insufficient") return "No hay tantas unidades en ese lote.";
  logDbError("existencias", error);
  if (isSchemaError(error)) return SCHEMA_MESSAGE;
  return "No se pudo guardar. Inténtalo de nuevo.";
}

const refresh = (org: string, itemId: string) => {
  revalidatePath(`/${org}/bodega/${itemId}`);
  revalidatePath(`/${org}/bodega`);
};

// Entrada manual de existencias (inventario inicial o reposición sin factura): crea un lote.
export async function addStock(org: string, itemId: string, formData: FormData): Promise<StockState> {
  const qty = parseDecimal(text(formData, "quantity"));
  const costRaw = text(formData, "unit_cost");
  const cost = costRaw ? parseCents(costRaw) : null;
  const note = text(formData, "note");

  const fields: Record<string, string> = {};
  if (qty === null || qty <= 0 || qty > MAX_QTY) fields.quantity = "Escribe una cantidad mayor a 0, con máximo 2 decimales.";
  if (cost && !cost.ok) fields.unit_cost = cost.error;
  if (note.length > 300) fields.note = "Máximo 300 caracteres.";
  if (Object.keys(fields).length) return { fields };

  const supabase = await createClient();
  const { error } = await supabase.rpc("stock_add", {
    p_item_id: itemId,
    p_supplier_id: (text(formData, "supplier_id") || null) as string,
    p_unit_cost_cents: (cost && cost.ok ? Math.min(cost.cents, MAX_CENTS) : null) as number,
    p_qty: qty as number,
    p_note: note,
  });
  if (error) return { error: friendly(error) };
  refresh(org, itemId);
  return { ok: true };
}

// Ajuste de un lote: suma o resta unidades (merma, conteo, corrección).
export async function adjustLot(org: string, itemId: string, lotId: string, formData: FormData): Promise<StockState> {
  const qty = parseDecimal(text(formData, "quantity"));
  const sign = text(formData, "mode") === "remove" ? -1 : 1;
  const note = text(formData, "note");

  const fields: Record<string, string> = {};
  if (qty === null || qty <= 0 || qty > MAX_QTY) fields.quantity = "Escribe una cantidad mayor a 0, con máximo 2 decimales.";
  if (note.length > 300) fields.note = "Máximo 300 caracteres.";
  if (Object.keys(fields).length) return { fields };

  const supabase = await createClient();
  const { error } = await supabase.rpc("stock_adjust", {
    p_lot_id: lotId,
    p_delta: sign * (qty as number),
    p_note: note,
  });
  if (error) return { error: friendly(error) };
  refresh(org, itemId);
  return { ok: true };
}
