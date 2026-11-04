"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { SCHEMA_MESSAGE, isSchemaError, logDbError, type DbError } from "@/lib/db-error";

export type Deliverable = {
  id: string;
  n: number;
  partNumber: string;
  description: string;
  unit: string;
  // Las entregas son de la línea completa: siempre esta cantidad.
  quantity: number;
};

// Líneas de una lista listas para entregar: todas sus unidades están en stock y aún no se entregaron.
export async function getDeliverable(contractId: string, listId: string): Promise<Deliverable[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("contract_item_supply")
    .select("id, n, part_number, description, unit, quantity, reserved, delivered")
    .eq("contract_id", contractId)
    .eq("list_id", listId)
    .order("n")
    .limit(1000);
  return ((data ?? []) as {
    id: string;
    n: number;
    part_number: string | null;
    description: string;
    unit: string;
    quantity: number;
    reserved: number;
    delivered: number;
  }[])
    .filter((r) => Number(r.delivered) === 0 && Number(r.reserved) >= Number(r.quantity))
    .map((r) => ({
      id: r.id,
      n: Number(r.n),
      partNumber: r.part_number ?? "",
      description: r.description,
      unit: r.unit,
      quantity: Number(r.quantity),
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
  if (error.message === "not_in_progress") return "Las entregas se registran cuando el contrato está En ejecución.";
  if (error.message === "not_deliverable") return "Alguna línea ya no está lista para entregar (sin stock completo o ya entregada). Actualiza la pantalla.";
  if (error.message === "list_not_found") return "No encontramos la lista o alguna de sus líneas.";
  if (error.message === "duplicate_line") return "Una línea aparece repetida.";
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
