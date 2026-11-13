"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { isAccountType } from "@/lib/banks";
import { SCHEMA_MESSAGE, isSchemaError, logDbError } from "@/lib/db-error";
import { parseCents } from "@/lib/money";
import { getOrgId } from "@/lib/orgs";
import { createClient } from "@/lib/supabase/server";

export type BankState = { error?: string; fields?: Record<string, string> } | undefined;

const text = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function saveBank(org: string, id: string | null, _: BankState, formData: FormData): Promise<BankState> {
  await requireUser();
  const bank = text(formData, "bank");
  const type = text(formData, "account_type");
  const number = text(formData, "account_number");
  const initial = text(formData, "initial");
  const manager = text(formData, "manager_id");

  const fields: Record<string, string> = {};
  if (!bank) fields.bank = "Escribe el nombre del banco.";
  else if (bank.length > 100) fields.bank = "Máximo 100 caracteres.";
  if (!isAccountType(type)) fields.account_type = "Elige el tipo de cuenta.";
  if (!number) fields.account_number = "Escribe el número de cuenta.";
  else if (number.length > 30) fields.account_number = "Máximo 30 caracteres.";
  let initialCents = 0;
  if (initial) {
    const m = parseCents(initial);
    if (!m.ok) fields.initial = m.error;
    else initialCents = m.cents;
  }
  if (manager && !UUID.test(manager)) fields.manager_id = "Elige un responsable de la lista.";
  if (Object.keys(fields).length) return { fields };

  const orgId = await getOrgId(org);
  if (!orgId) return { error: "No encontramos la organización." };
  const supabase = await createClient();
  const values = { bank, account_type: type, account_number: number, initial_cents: initialCents, manager_id: manager || null };

  const { data, error } = id
    ? await supabase.from("bank_accounts").update(values).eq("id", id).eq("organization_id", orgId).select("id")
    : await supabase.from("bank_accounts").insert({ organization_id: orgId, ...values }).select("id");
  if (error) {
    if (error.code === "23505") return { fields: { account_number: "Esa cuenta ya está registrada en ese banco." } };
    if (error.code === "23503") return { fields: { manager_id: "Ese responsable ya no existe." } };
    if (error.code === "42501") return { error: "No tienes permiso para guardar cuentas." };
    logDbError("saveBank", error);
    return { error: isSchemaError(error) ? SCHEMA_MESSAGE : "No se pudo guardar. Inténtalo de nuevo." };
  }
  if (!data?.length) return { error: "No tienes permiso para editar esta cuenta." };

  revalidatePath(`/${org}/bancos`);
  redirect(`/${org}/bancos`);
}

export async function deleteBank(org: string, id: string): Promise<BankState> {
  await requireUser();
  const orgId = await getOrgId(org);
  if (!orgId) return { error: "No encontramos la organización." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("bank_accounts").delete().eq("id", id).eq("organization_id", orgId).select("id");
  if (error) return { error: "No se pudo eliminar. Inténtalo de nuevo." };
  if (!data?.length) return { error: "Solo los administradores pueden eliminar cuentas." };
  revalidatePath(`/${org}/bancos`);
  redirect(`/${org}/bancos`);
}
