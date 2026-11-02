"use server";

import { redirect } from "next/navigation";
import { VAT_RATE } from "@/lib/contracts";
import { parseCents } from "@/lib/money";
import { getOrgId } from "@/lib/orgs";
import { createClient } from "@/lib/supabase/server";

// `fields` asocia cada mensaje con el campo que lo causó; `error` es general.
export type ContractState =
  | { error?: string; fields?: Record<string, string> }
  | undefined;

const NEW = "__new__";

const text = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();

export async function createContract(
  _: ContractState,
  formData: FormData,
): Promise<ContractState> {
  const org = text(formData, "org");
  const name = text(formData, "name");
  const code = text(formData, "code");
  const total = parseCents(text(formData, "total"));
  const termDays = Number(text(formData, "term_days"));
  const startDate = text(formData, "start_date");
  const clientChoice = text(formData, "client_id");
  const managerChoice = text(formData, "manager_id");

  // Se validan todos los campos a la vez para mostrar todos los problemas juntos.
  const fields: Record<string, string> = {};
  if (!name) fields.name = "Escribe el nombre del contrato.";
  if (!code) fields.code = "Escribe el código del contrato.";
  if (!clientChoice) fields.client_id = "Selecciona un cliente o crea uno nuevo.";
  if (clientChoice === NEW && !text(formData, "client_name")) {
    fields.client_name = "Escribe el nombre del cliente.";
  }
  if (!managerChoice) fields.manager_id = "Selecciona un responsable o crea uno nuevo.";
  if (managerChoice === NEW && !text(formData, "manager_name")) {
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

  const organizationId = await getOrgId(org);
  if (!organizationId) {
    return { error: "No encontramos la organización. Vuelve a abrirla desde el menú." };
  }

  const supabase = await createClient();

  // Cliente y responsable: existentes, o se crean aquí mismo.
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
        name: text(formData, `${prefix}_name`),
        ruc: text(formData, `${prefix}_ruc`) || null,
        address: text(formData, `${prefix}_address`) || null,
      })
      .select("id")
      .single();
    if (error) {
      console.error(`createContract: no se pudo crear en ${table}`, error);
      return null;
    }
    return data.id;
  }

  const clientId = await resolve("clients", "client", clientChoice);
  if (!clientId) return { error: "No se pudo crear el cliente. Inténtalo de nuevo." };
  const managerId = await resolve("contract_managers", "manager", managerChoice);
  if (!managerId) return { error: "No se pudo crear el responsable. Inténtalo de nuevo." };

  const { error } = await supabase.from("contracts").insert({
    organization_id: organizationId,
    code,
    name,
    client_id: clientId,
    manager_id: managerId,
    total_cents: totalCents,
    vat_rate: VAT_RATE,
    term_days: termDays,
    start_date: startDate,
  });

  if (error) {
    if (error.code === "23505") {
      return { fields: { code: "Ya existe un contrato con ese código. Usa otro." } };
    }
    console.error("createContract: no se pudo crear el contrato", error);
    return {
      error:
        "No se pudo guardar el contrato. Revisa los datos e inténtalo de nuevo; lo que escribiste se conserva.",
    };
  }

  redirect(`/${org}/contratos`);
}
