"use server";

import { revalidatePath } from "next/cache";
import { MAX_LINES_PER_LIST, STATUS_ORDER } from "@/lib/contracts";
import { parseDecimal } from "@/lib/money";
import { isUnit } from "@/lib/units";
import { createClient } from "@/lib/supabase/server";
import { SCHEMA_MESSAGE, isSchemaError, logDbError, type DbError } from "@/lib/db-error";

export type LineState = { error?: string; fields?: Record<string, string> } | undefined;

const text = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
const refresh = (org: string, contractId: string) =>
  revalidatePath(`/${org}/contratos/${contractId}`, "layout");

function friendly(error: DbError) {
  if (error.code === "42501") return "No tienes permiso para hacer esto.";
  logDbError("contrato", error);
  if (isSchemaError(error)) return SCHEMA_MESSAGE;
  return "No se pudo completar la acción. Inténtalo de nuevo.";
}

const LIST_FULL = `La lista llegó al máximo de ${MAX_LINES_PER_LIST.toLocaleString("es-EC")} líneas.`;

type LineValues = {
  partNumber: string | null;
  description: string;
  quantity: number;
  unit: string;
  cpc: string | null;
};

type RawLine = { partNumber: string; description: string; quantity: string; unit: string; cpc: string };

// Valida los campos de una línea; los mismos para agregar, editar y la carga masiva.
function parseLineValues(raw: RawLine): { values: LineValues } | { fields: Record<string, string> } {
  const partNumber = raw.partNumber.trim();
  const description = raw.description.trim();
  const unit = raw.unit.trim();
  const cpc = raw.cpc.trim();
  const quantity = parseDecimal(raw.quantity.trim());

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

function parseLine(formData: FormData) {
  return parseLineValues({
    partNumber: text(formData, "part_number"),
    description: text(formData, "description"),
    quantity: text(formData, "quantity"),
    unit: text(formData, "unit"),
    cpc: text(formData, "cpc"),
  });
}

export type BulkResult = { error?: string; fields?: Record<string, string>; count?: number } | undefined;

// Carga masiva (revisada por la persona): todas las filas entran juntas o no entra ninguna.
// Los errores por fila vienen con la posición como clave: "3.quantity".
export async function addLines(
  org: string,
  contractId: string,
  listId: string,
  rows: RawLine[],
): Promise<BulkResult> {
  if (!Array.isArray(rows) || rows.length === 0) return { error: "No hay líneas para cargar." };
  if (rows.length > 500) return { error: "Máximo 500 líneas por carga." };

  const fields: Record<string, string> = {};
  const clean: Record<string, unknown>[] = [];
  rows.forEach((r, i) => {
    const parsed = parseLineValues(r);
    if ("fields" in parsed) {
      for (const [k, v] of Object.entries(parsed.fields)) fields[`${i}.${k}`] = v;
      return;
    }
    const v = parsed.values;
    clean.push({
      part_number: v.partNumber ?? "",
      description: v.description,
      quantity: v.quantity,
      unit: v.unit,
      cpc: v.cpc ?? "",
    });
  });
  if (Object.keys(fields).length) return { fields };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("add_contract_lines", { p_list_id: listId, p_rows: clean });
  if (error) {
    if (error.message === "list_not_found") return { error: "No encontramos la lista." };
    if (error.message === "not_in_progress") {
      return { error: "Los items se cargan cuando el contrato está En ejecución." };
    }
    if (error.message === "list_full") return { error: LIST_FULL };
    return { error: friendly(error) };
  }
  refresh(org, contractId);
  return { count: Number(data) };
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
    if (error.message === "list_full") return { error: LIST_FULL };
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
    if (error.message === "below_reserved") {
      return { fields: { quantity: "La cantidad no puede ser menor a lo ya reservado en bodega." } };
    }
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

// Número de parte y descripción de todas las líneas de una lista (máx. 1.000), para avisar de
// repetidos al revisar una carga masiva. Se pide solo al abrir la carga.
export async function getListKeys(
  contractId: string,
  listId: string,
): Promise<{ part: string; description: string }[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("contract_items")
    .select("part_number, description")
    .eq("contract_id", contractId)
    .eq("list_id", listId)
    .order("created_at")
    .order("id")
    .limit(MAX_LINES_PER_LIST);
  return ((data ?? []) as { part_number: string | null; description: string }[]).map((r) => ({
    part: r.part_number ?? "",
    description: r.description,
  }));
}
