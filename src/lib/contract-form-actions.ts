"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { VAT_RATE } from "@/lib/contracts";
import { SCHEMA_MESSAGE, isSchemaError, logDbError } from "@/lib/db-error";
import { parseCents } from "@/lib/money";
import { getOrgId } from "@/lib/orgs";
import { createClient } from "@/lib/supabase/server";

// `fields` asocia cada mensaje con el campo que lo causó; `error` es general.
export type ContractState =
  | { error?: string; fields?: Record<string, string>; saved?: boolean }
  | undefined;

const NEW = "__new__";
const text = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();

type Values = {
  name: string;
  code: string;
  totalCents: number;
  termDays: number;
  startDate: string;
  clientChoice: string;
  managerChoice: string;
};

// Valida todos los campos a la vez, para mostrar todos los problemas juntos.
function parseForm(fd: FormData): { fields: Record<string, string> } | { values: Values } {
  const name = text(fd, "name");
  const code = text(fd, "code");
  const total = parseCents(text(fd, "total"));
  const termDays = Number(text(fd, "term_days"));
  const startDate = text(fd, "start_date");
  const clientChoice = text(fd, "client_id");
  const managerChoice = text(fd, "manager_id");

  const fields: Record<string, string> = {};
  if (!name) fields.name = "Escribe el nombre del contrato.";
  if (!code) fields.code = "Escribe el código del contrato.";
  if (!clientChoice) fields.client_id = "Selecciona un cliente o crea uno nuevo.";
  if (clientChoice === NEW && !text(fd, "client_name")) {
    fields.client_name = "Escribe el nombre del cliente.";
  }
  if (!managerChoice) fields.manager_id = "Selecciona un responsable o crea uno nuevo.";
  if (managerChoice === NEW && !text(fd, "manager_name")) {
    fields.manager_name = "Escribe el nombre del responsable.";
  }
  let totalCents = 0;
  if (!total.ok) fields.total = total.error;
  else if (total.cents <= 0) fields.total = "El monto debe ser mayor a 0.";
  else totalCents = total.cents;
  if (!Number.isInteger(termDays) || termDays <= 0) {
    fields.term_days = "Escribe los días de plazo como número entero mayor a 0.";
  }
  if (!startDate) fields.start_date = "Elige la fecha de inicio.";

  if (Object.keys(fields).length > 0) return { fields };
  return { values: { name, code, totalCents, termDays, startDate, clientChoice, managerChoice } };
}

// Cliente y responsable: existentes, o se crean aquí mismo.
async function resolveParties(
  organizationId: string,
  fd: FormData,
  v: Values,
): Promise<{ clientId: string; managerId: string } | { error: string }> {
  const supabase = await createClient();

  async function resolve(
    table: "clients" | "contract_managers",
    prefix: "client" | "manager",
    choice: string,
  ): Promise<string | null> {
    if (choice !== NEW) return choice;
    const { data, error } = await supabase
      .from(table)
      .insert({
        organization_id: organizationId,
        name: text(fd, `${prefix}_name`),
        ruc: text(fd, `${prefix}_ruc`) || null,
        address: text(fd, `${prefix}_address`) || null,
      })
      .select("id")
      .single();
    if (error) {
      logDbError(`contrato: no se pudo crear en ${table}`, error);
      return null;
    }
    return data.id;
  }

  const clientId = await resolve("clients", "client", v.clientChoice);
  if (!clientId) return { error: "No se pudo crear el cliente. Inténtalo de nuevo." };
  const managerId = await resolve("contract_managers", "manager", v.managerChoice);
  if (!managerId) return { error: "No se pudo crear el responsable. Inténtalo de nuevo." };
  return { clientId, managerId };
}

function saveError(scope: string, error: { code?: string; message?: string }): ContractState {
  if (error.code === "23505") {
    return { fields: { code: "Ya existe un contrato con ese código. Usa otro." } };
  }
  logDbError(scope, error);
  if (isSchemaError(error)) return { error: SCHEMA_MESSAGE };
  return {
    error:
      "No se pudo guardar el contrato. Revisa los datos e inténtalo de nuevo; lo que escribiste se conserva.",
  };
}

export async function createContract(_: ContractState, formData: FormData): Promise<ContractState> {
  const org = text(formData, "org");
  const parsed = parseForm(formData);
  if ("fields" in parsed) return { fields: parsed.fields };
  const v = parsed.values;

  const organizationId = await getOrgId(org);
  if (!organizationId) {
    return { error: "No encontramos la organización. Vuelve a abrirla desde el menú." };
  }

  const parties = await resolveParties(organizationId, formData, v);
  if ("error" in parties) return { error: parties.error };

  const supabase = await createClient();
  const { error } = await supabase.from("contracts").insert({
    organization_id: organizationId,
    code: v.code,
    name: v.name,
    client_id: parties.clientId,
    manager_id: parties.managerId,
    total_cents: v.totalCents,
    vat_rate: VAT_RATE,
    term_days: v.termDays,
    start_date: v.startDate,
  });
  if (error) return saveError("createContract", error);

  redirect(`/${org}/contratos`);
}

// Corregir los datos de un contrato. Solo mientras está en estado Nuevo: desde
// "En ejecución" ya se trabaja con items y los datos base quedan fijos.
export async function updateContract(
  org: string,
  contractId: string,
  _: ContractState,
  formData: FormData,
): Promise<ContractState> {
  const parsed = parseForm(formData);
  if ("fields" in parsed) return { fields: parsed.fields };
  const v = parsed.values;

  const organizationId = await getOrgId(org);
  if (!organizationId) return { error: "No encontramos la organización." };

  const supabase = await createClient();
  const { data: current } = await supabase
    .from("contracts")
    .select("status")
    .eq("id", contractId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!current) return { error: "No encontramos el contrato." };
  if (current.status !== "new") {
    return { error: "Los datos solo se corrigen mientras el contrato está en Nuevo." };
  }

  const parties = await resolveParties(organizationId, formData, v);
  if ("error" in parties) return { error: parties.error };

  const { data, error } = await supabase
    .from("contracts")
    .update({
      code: v.code,
      name: v.name,
      client_id: parties.clientId,
      manager_id: parties.managerId,
      total_cents: v.totalCents,
      term_days: v.termDays,
      start_date: v.startDate,
    })
    .eq("id", contractId)
    .eq("organization_id", organizationId)
    .eq("status", "new")
    .select("id");
  if (error) return saveError("updateContract", error);
  if (!data?.length) return { error: "No tienes permiso para editar este contrato." };

  revalidatePath(`/${org}/contratos/${contractId}`);
  revalidatePath(`/${org}/contratos`);
  return { saved: true };
}
