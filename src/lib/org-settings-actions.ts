"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { getMyRole, getOrgId } from "@/lib/orgs";
import { SCHEMA_MESSAGE, isSchemaError, logDbError } from "@/lib/db-error";
import { createClient } from "@/lib/supabase/server";

export type OrgSettingsState = { error?: string; fields?: Record<string, string>; saved?: boolean } | undefined;

// Datos de la organización. Solo un administrador puede cambiarlos (y la base lo vuelve a comprobar).
export async function updateOrganization(org: string, _: OrgSettingsState, formData: FormData): Promise<OrgSettingsState> {
  await requireUser();
  const get = (k: string) => String(formData.get(k) ?? "").trim();
  const name = get("name");
  const ruc = get("ruc");
  const address = get("address");
  const phone = get("phone");
  const days = Number(get("invitation_days"));

  const fields: Record<string, string> = {};
  if (!name) fields.name = "Escribe el nombre de la organización.";
  else if (name.length > 120) fields.name = "Máximo 120 caracteres.";
  if (ruc && !/^[0-9]{13}$/.test(ruc)) fields.ruc = "El RUC tiene 13 dígitos.";
  if (address.length > 200) fields.address = "Máximo 200 caracteres.";
  if (phone.length > 30) fields.phone = "Máximo 30 caracteres.";
  if (!Number.isInteger(days) || days < 1 || days > 30) fields.invitation_days = "Escribe entre 1 y 30 días.";
  if (Object.keys(fields).length) return { fields };

  const orgId = await getOrgId(org);
  if (!orgId) return { error: "No encontramos la organización." };
  if ((await getMyRole(orgId)) !== "admin") return { error: "Solo los administradores pueden cambiar esto." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("organizations")
    .update({
      name,
      ruc: ruc || null,
      address: address || null,
      phone: phone || null,
      invitation_days: days,
    })
    .eq("id", orgId);
  if (error) {
    logDbError("ajustes", error);
    return { error: isSchemaError(error) ? SCHEMA_MESSAGE : "No se pudo guardar. Inténtalo de nuevo." };
  }
  // El nombre aparece en la cabecera, y el IVA y la zona horaria en las pantallas de la organización.
  revalidatePath(`/${org}`, "layout");
  return { saved: true };
}
