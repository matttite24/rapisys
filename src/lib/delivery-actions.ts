"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadLineProducts, type DeliveryProduct } from "@/lib/line-products";
import { SCHEMA_MESSAGE, isSchemaError, logDbError, type DbError } from "@/lib/db-error";

export type { DeliveryProduct };

export type Deliverable = {
  id: string;
  n: number;
  partNumber: string;
  description: string;
  unit: string;
  // Las entregas son de la línea completa: siempre esta cantidad.
  quantity: number;
  products: DeliveryProduct[];
};

// Líneas de una lista listas para entregar: todas sus unidades están en stock y aún no se entregaron.
export async function getDeliverable(contractId: string, listId: string): Promise<Deliverable[]> {
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contract_item_supply")
    .select("id, n, part_number, description, unit, quantity, reserved, delivered")
    .eq("contract_id", contractId)
    .eq("list_id", listId)
    .order("n")
    .limit(1000);
  if (error) throw new Error(friendly(error));
  const ready = ((data ?? []) as {
    id: string;
    n: number;
    part_number: string | null;
    description: string;
    unit: string;
    quantity: number;
    reserved: number;
    delivered: number;
  }[])
    .filter((r) => Number(r.delivered) === 0 && Number(r.reserved) >= Number(r.quantity));
  if (!ready.length) return [];

  const productsByLine = await loadLineProducts(supabase, ready.map((r) => r.id), (e) => new Error(friendly(e)));
  return ready.map((r) => ({
    id: r.id, n: Number(r.n), partNumber: r.part_number ?? "", description: r.description,
    unit: r.unit, quantity: Number(r.quantity), products: productsByLine.get(r.id) ?? [],
  }));
}

export type DeliveryInput = {
  date: string;
  receivedBy: string;
  notes: string;
  // Líneas completas que se entregan (la cantidad es la de cada línea).
  lineIds: string[];
};
export type DeliveryResult = { error?: string; id?: string } | undefined;

function friendly(error: DbError) {
  if (error.code === "42501" || error.message === "forbidden") return "No tienes permiso para hacer esto.";
  if (error.message === "not_in_progress") return "Las entregas se registran cuando el proceso está En ejecución.";
  if (error.message === "not_deliverable") return "Alguna línea ya no está lista para entregar (sin todo asignado de la bodega o ya entregada). Actualiza la pantalla.";
  if (error.message === "list_not_found") return "No encontramos la lista o alguna de sus líneas.";
  if (error.message === "duplicate_line") return "Una línea aparece repetida.";
  if (error.message === "already_void") return "Esta entrega ya está anulada.";
  if (error.message === "bad_date") return "Elige la fecha de la entrega.";
  if (error.message === "nothing_to_deliver" || error.message === "bad_quantity") return "Elige al menos una línea con cantidad mayor a 0.";
  logDbError("entrega", error);
  if (isSchemaError(error)) return SCHEMA_MESSAGE;
  return "No se pudo registrar la entrega. Inténtalo de nuevo.";
}

// Registra una entrega (total o parcial de la lista) y devuelve su id para abrir el reporte.
export async function createDelivery(
  org: string,
  contractId: string,
  listId: string,
  input: DeliveryInput,
): Promise<DeliveryResult> {
  await requireUser();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { error: "Elige la fecha de la entrega." };
  if (input.receivedBy.length > 200) return { error: "Quien recibe: máximo 200 caracteres." };
  if (input.notes.length > 500) return { error: "Las notas admiten máximo 500 caracteres." };

  if (!input.lineIds.length) return { error: "Elige al menos una línea para entregar." };
  const lines = input.lineIds.map((line_id) => ({ line_id }));

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("delivery_create", {
    p_contract_id: contractId,
    p_list_id: listId,
    p_date: input.date,
    p_received_by: input.receivedBy,
    p_notes: input.notes,
    p_lines: lines,
  });
  if (error) return { error: friendly(error) };
  revalidatePath(`/${org}/contratos/${contractId}`, "layout");
  return { id: (data as { id: string }).id };
}

// Anula una entrega: sus líneas vuelven a la bodega (listas para entregar otra vez). Queda en el historial como anulada.
export async function voidDelivery(org: string, contractId: string, deliveryId: string, reason: string): Promise<DeliveryResult> {
  await requireUser();
  if (reason.length > 300) return { error: "El motivo admite máximo 300 caracteres." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("delivery_void", { p_delivery_id: deliveryId, p_reason: reason });
  if (error) return { error: friendly(error) };
  revalidatePath(`/${org}/contratos/${contractId}`, "layout");
  return { id: deliveryId };
}

// Corrige fecha, quién recibe y notas de una entrega ya registrada (p. ej. se reprograma si no la recibieron).
export async function updateDelivery(
  org: string,
  contractId: string,
  deliveryId: string,
  input: { date: string; receivedBy: string; notes: string },
): Promise<DeliveryResult> {
  await requireUser();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { error: "Elige la fecha de la entrega." };
  if (input.receivedBy.length > 200) return { error: "Quien recibe: máximo 200 caracteres." };
  if (input.notes.length > 500) return { error: "Las notas admiten máximo 500 caracteres." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("delivery_update", {
    p_delivery_id: deliveryId,
    p_date: input.date,
    p_received_by: input.receivedBy,
    p_notes: input.notes,
  });
  if (error) return { error: friendly(error) };
  revalidatePath(`/${org}/contratos/${contractId}`, "layout");
  return { id: deliveryId };
}
