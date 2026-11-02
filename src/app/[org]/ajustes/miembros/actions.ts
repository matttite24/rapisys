"use server";

import { revalidatePath } from "next/cache";
import { getOrgId } from "@/lib/orgs";
import { createClient } from "@/lib/supabase/server";
import { SCHEMA_MESSAGE, isSchemaError, logDbError } from "@/lib/db-error";

export type MemberState = { error?: string; token?: string; email?: string } | undefined;

const ROLES = ["admin", "operator"];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Traduce los errores de la base a mensajes que el usuario pueda usar.
function friendly(error: { code?: string; message: string }) {
  if (error.message.includes("al menos un administrador")) {
    return "La organización debe conservar al menos un administrador.";
  }
  if (error.code === "23505") return "Ya hay una invitación pendiente para ese correo.";
  if (error.code === "42501") return "Solo los administradores pueden hacer esto.";
  logDbError("miembros", error);
  if (isSchemaError(error)) return SCHEMA_MESSAGE;
  return "No se pudo completar la acción. Inténtalo de nuevo.";
}

export async function inviteMember(
  org: string,
  _: MemberState,
  formData: FormData,
): Promise<MemberState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "");
  if (!EMAIL.test(email)) return { error: "Escribe un correo válido." };
  if (!ROLES.includes(role)) return { error: "Elige un rol." };

  const orgId = await getOrgId(org);
  if (!orgId) return { error: "No encontramos la organización." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invitations")
    .insert({ organization_id: orgId, email, role })
    .select("token")
    .single();
  if (error) return { error: friendly(error) };

  revalidatePath(`/${org}/ajustes/miembros`);
  return { token: data.token, email };
}

export async function revokeInvitation(org: string, id: string): Promise<MemberState> {
  const supabase = await createClient();
  const { error } = await supabase.from("invitations").delete().eq("id", id);
  if (error) return { error: friendly(error) };
  revalidatePath(`/${org}/ajustes/miembros`);
}

export async function changeRole(
  org: string,
  userId: string,
  role: string,
): Promise<MemberState> {
  if (!ROLES.includes(role)) return { error: "Rol no válido." };
  const orgId = await getOrgId(org);
  if (!orgId) return { error: "No encontramos la organización." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("memberships")
    .update({ role })
    .eq("organization_id", orgId)
    .eq("user_id", userId)
    .select("user_id");
  if (error) return { error: friendly(error) };
  if (!data?.length) return { error: "Solo los administradores pueden cambiar roles." };
  revalidatePath(`/${org}/ajustes/miembros`);
}

export async function removeMember(org: string, userId: string): Promise<MemberState> {
  const orgId = await getOrgId(org);
  if (!orgId) return { error: "No encontramos la organización." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("memberships")
    .delete()
    .eq("organization_id", orgId)
    .eq("user_id", userId)
    .select("user_id");
  if (error) return { error: friendly(error) };
  if (!data?.length) return { error: "No tienes permiso para quitar a este miembro." };
  revalidatePath(`/${org}/ajustes/miembros`);
}
