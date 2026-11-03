"use server";

import { revalidatePath } from "next/cache";
import { STATUS_ORDER } from "@/lib/contracts";
import { parseDecimal } from "@/lib/money";
import { isUnit } from "@/lib/units";
import { createClient } from "@/lib/supabase/server";
import { SCHEMA_MESSAGE, isSchemaError, logDbError, type DbError } from "@/lib/db-error";

export type LineState = { error?: string; fields?: Record<string, string> } | undefined;

const text = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
const refresh = (org: string, contractId: string) =>
  revalidatePath(`/${org}/contratos/${contractId}`);

function friendly(error: DbError) {
  if (error.code === "42501") return "No tienes permiso para hacer esto.";
  logDbError("contrato", error);
  if (isSchemaError(error)) return SCHEMA_MESSAGE;
  return "No se pudo completar la acción. Inténtalo de nuevo.";
}

type LineValues = {
  partNumber: string | null;
  description: string;
  quantity: number;
  unit: string;
  cpc: string | null;
};

// Lee y valida los campos de una línea; los mismos para agregar y editar.
function parseLine(formData: FormData): { values: LineValues } | { fields: Record<string, string> } {
  const partNumber = text(formData, "part_number");
  const description = text(formData, "description");
  const unit = text(formData, "unit");
  const cpc = text(formData, "cpc");
  const quantity = parseDecimal(text(formData, "quantity"));

  const fields: Record<string, string> = {};
  if (partNumber.length > 60) fields.part_number = "Máximo 60 caracteres.";
  if (!description) fields.description = "Escribe la descripción del item.";
  else if (description.length > 500) fields.description = "Máximo 500 caracteres.";
  if (quantity === null || quantity <= 0 || quantity > 10_000_000) {
    fields.quantity = "Escribe una cantidad mayor a 0, con máximo 2 decimales.";
  }
  if (!isUnit(unit)) fields.unit = "Elige una unidad de medida.";
  if (cpc.length > 20) fields.cpc = "Máximo 20 caracteres.";
  if (Object.keys(fields).length || quantity === null) return { fields };

  return {
    values: { partNumber: partNumber || null, description, quantity, unit, cpc: cpc || null },
  };
}

export async function addLine(
  org: string,
  contractId: string,
  listId: string,
  formData: FormData,
): Promise<LineState> {
  const parsed = parseLine(formData);
  if ("fields" in parsed) return { fields: parsed.fields };
  const v = parsed.values;

  // Una sola llamada: la función valida que el contrato esté En ejecución y la inserta.
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_contract_line", {
    p_list_id: listId,
    p_part_number: v.partNumber as string,
    p_description: v.description,
    p_quantity: v.quantity,
    p_unit: v.unit,
    p_cpc: v.cpc as string,
  });
  if (error) {
    if (error.message === "list_not_found") return { error: "No encontramos la lista." };
    if (error.message === "not_in_progress") {
      return { error: "Los items se cargan cuando el contrato está En ejecución." };
    }
    return { error: friendly(error) };
  }
  refresh(org, contractId);
}

export async function updateLine(
  org: string,
  contractId: string,
  lineId: string,
  formData: FormData,
): Promise<LineState> {
  const parsed = parseLine(formData);
  if ("fields" in parsed) return { fields: parsed.fields };
  const v = parsed.values;

  const supabase = await createClient();
  const { data: contract } = await supabase
    .from("contracts")
    .select("status")
    .eq("id", contractId)
    .maybeSingle();
  if (!contract) return { error: "No encontramos el contrato." };
  if (contract.status !== "in_progress") {
    return { error: "Los items se editan cuando el contrato está En ejecución." };
  }

  const { data, error } = await supabase
    .from("contract_items")
    .update({
      part_number: v.partNumber,
      description: v.description,
      quantity: v.quantity,
      unit: v.unit,
      cpc: v.cpc,
    })
    .eq("id", lineId)
    .eq("contract_id", contractId)
    .select("id");
  if (error) {
    // La cantidad no puede quedar por debajo de lo ya recibido.
    if (error.code === "23514") return { fields: { quantity: "La cantidad es menor a lo ya recibido." } };
    return { error: friendly(error) };
  }
  if (!data?.length) return { error: "No tienes permiso para editar esta línea." };
  refresh(org, contractId);
}

export async function removeLine(org: string, contractId: string, lineId: string): Promise<LineState> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contract_items")
    .delete()
    .eq("id", lineId)
    .select("id");
  if (error) return { error: friendly(error) };
  if (!data?.length) return { error: "No tienes permiso para quitar esta línea." };
  refresh(org, contractId);
}

export async function setContractStatus(
  org: string,
  contractId: string,
  status: string,
): Promise<LineState> {
  if (!(STATUS_ORDER as readonly string[]).includes(status)) return { error: "Estado no válido." };

  const supabase = await createClient();
  const { data: current } = await supabase
    .from("contracts")
    .select("status")
    .eq("id", contractId)
    .maybeSingle();
  if (!current) return { error: "No encontramos el contrato." };

  // Un contrato con items no puede volver a Nuevo: ahí los items todavía no se trabajan.
  if (status === "new") {
    const { count } = await supabase
      .from("contract_items")
      .select("id", { count: "exact", head: true })
      .eq("contract_id", contractId);
    if (count) return { error: "Quita los items del contrato antes de volver a Nuevo." };
  }

  // Solo se avanza o retrocede un paso a la vez.
  const delta = STATUS_ORDER.indexOf(status as (typeof STATUS_ORDER)[number]) -
    STATUS_ORDER.indexOf(current.status as (typeof STATUS_ORDER)[number]);
  if (Math.abs(delta) !== 1) return { error: "El estado solo cambia un paso a la vez." };

  const { data, error } = await supabase
    .from("contracts")
    .update({ status })
    .eq("id", contractId)
    .select("id");
  if (error) return { error: friendly(error) };
  if (!data?.length) return { error: "No tienes permiso para cambiar el estado." };
  revalidatePath(`/${org}/contratos`);
  refresh(org, contractId);
}
