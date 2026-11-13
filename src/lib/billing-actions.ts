"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { SCHEMA_MESSAGE, isSchemaError, logDbError } from "@/lib/db-error";
import { getOrgId } from "@/lib/orgs";
import { createClient } from "@/lib/supabase/server";

export type BillingChange = { lineId: string; margin: number | null; excluded: boolean };
export type BillingResult = { error?: string; ok?: boolean };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Guarda los ajustes del reporte de cobro de una entrega: margen ajustado y/o línea omitida. Una línea sin ajuste (margen
// vacío y no omitida) se quita de la tabla. No toca precios, márgenes de productos ni nada de lo anterior.
export async function saveBillingAdjustments(org: string, contractId: string, deliveryId: string, changes: BillingChange[]): Promise<BillingResult> {
  await requireUser();
  if (!Array.isArray(changes) || changes.length === 0 || changes.length > 500) return { error: "No hay cambios que guardar." };
  for (const c of changes) {
    if (!UUID.test(c.lineId)) return { error: "Línea no válida." };
    if (c.margin !== null && (!Number.isFinite(c.margin) || c.margin < 0 || c.margin > 1000)) return { error: "El margen debe estar entre 0 y 1000." };
  }
  const orgId = await getOrgId(org);
  if (!orgId) return { error: "No encontramos la organización." };
  const supabase = await createClient();

  // Solo líneas de esta entrega.
  const { data: own, error: ownError } = await supabase
    .from("delivery_lines")
    .select("contract_item_id, deliveries!inner(contract_id)")
    .eq("delivery_id", deliveryId)
    .eq("deliveries.contract_id", contractId)
    .in("contract_item_id", changes.map((c) => c.lineId));
  if (ownError) { logDbError("reporte de cobro", ownError); return { error: isSchemaError(ownError) ? SCHEMA_MESSAGE : "No se pudo guardar. Inténtalo de nuevo." }; }
  const valid = new Set((own ?? []).map((r) => r.contract_item_id as string));
  if (changes.some((c) => !valid.has(c.lineId))) return { error: "Alguna línea no es de esta entrega. Actualiza la pantalla." };

  const keep = changes.filter((c) => c.margin !== null || c.excluded);
  const drop = changes.filter((c) => c.margin === null && !c.excluded).map((c) => c.lineId);
  if (keep.length) {
    const { error } = await supabase.from("billing_adjustments").upsert(
      keep.map((c) => ({ organization_id: orgId, delivery_id: deliveryId, contract_item_id: c.lineId, margin_percent: c.margin, excluded: c.excluded, updated_at: new Date().toISOString() })),
      { onConflict: "delivery_id,contract_item_id" },
    );
    if (error) { logDbError("reporte de cobro: guardar", error); return { error: error.code === "42501" ? "No tienes permiso para ajustar el reporte de cobro." : isSchemaError(error) ? SCHEMA_MESSAGE : "No se pudo guardar. Inténtalo de nuevo." }; }
  }
  if (drop.length) {
    const { error } = await supabase.from("billing_adjustments").delete().eq("delivery_id", deliveryId).in("contract_item_id", drop);
    if (error) { logDbError("reporte de cobro: restablecer", error); return { error: "No se pudo guardar. Inténtalo de nuevo." }; }
  }
  revalidatePath(`/${org}/contratos/${contractId}/revision`);
  return { ok: true };
}
