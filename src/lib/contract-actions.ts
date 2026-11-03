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

export async function addLine(
  org: string,
  contractId: string,
  _: LineState,
  formData: FormData,
): Promise<LineState> {
  const description = text(formData, "description");
  const unit = text(formData, "unit");
  const quantity = parseDecimal(text(formData, "quantity"));

  const fields: Record<string, string> = {};
  if (!description) fields.description = "Escribe la descripción del item.";
  else if (description.length > 500) fields.description = "Máximo 500 caracteres.";
  if (quantity === null || quantity <= 0 || quantity > 10_000_000) {
    fields.quantity = "Escribe una cantidad mayor a 0, con máximo 2 decimales.";
  }
  if (!isUnit(unit)) fields.unit = "Elige una unidad de medida.";
  if (Object.keys(fields).length) return { fields };

  // Una sola llamada: la función valida que el contrato esté En ejecución y la inserta.
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_contract_line", {
    p_contract_id: contractId,
    p_description: description,
    p_quantity: quantity as number,
    p_unit: unit,
  });
  if (error) {
    if (error.message === "contract_not_found") return { error: "No encontramos el contrato." };
    if (error.message === "not_in_progress") {
      return { error: "Los items se cargan cuando el contrato está En ejecución." };
    }
    return { error: friendly(error) };
  }
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
