"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { PARTIES, rucError, isClientType, partyListHref, type PartyKind } from "@/lib/parties";
import { getOrgId } from "@/lib/orgs";
import { createClient } from "@/lib/supabase/server";
import { SCHEMA_MESSAGE, isSchemaError, logDbError } from "@/lib/db-error";
import { requireUser } from "@/lib/auth";

export type PartyState =
  | { error?: string; fields?: Record<string, string> }
  | undefined;

const text = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();

export async function saveParty(
  kind: PartyKind,
  org: string,
  id: string | null,
  _: PartyState,
  formData: FormData,
): Promise<PartyState> {
  await requireUser();
  // La tabla sale de una lista cerrada, nunca del cliente.
  const cfg = PARTIES[kind];
  if (!cfg) return { error: "Catálogo no válido." };

  const name = text(formData, "name");
  const ruc = text(formData, "ruc");
  const address = text(formData, "address");
  const clientType = text(formData, "client_type");

  const fields: Record<string, string> = {};
  if (!name) fields.name = `Escribe el nombre del ${cfg.singular}.`;
  if (kind === "clients" && !isClientType(clientType)) fields.client_type = "Selecciona Empresa, Institución o Persona.";
  const rErr = rucError(ruc);
  if (rErr) fields.ruc = rErr;
  if (Object.keys(fields).length) return { fields };

  const orgId = await getOrgId(org);
  if (!orgId) return { error: "No encontramos la organización." };

  const supabase = await createClient();
  const values = { name, ruc: ruc || null, address: address || null, ...(kind === "clients" ? { client_type: clientType } : {}) };

  if (id) {
    const { data, error } = await supabase
      .from(cfg.table)
      .update(values)
      .eq("id", id)
      .eq("organization_id", orgId)
      .select("id");
    if (error) {
      logDbError("saveParty update", error);
      return { error: isSchemaError(error) ? SCHEMA_MESSAGE : "No se pudo guardar. Inténtalo de nuevo." };
    }
    if (!data?.length) return { error: "No tienes permiso para editar este registro." };
  } else {
    const { error } = await supabase
      .from(cfg.table)
      .insert({ organization_id: orgId, ...values });
    if (error) {
      logDbError("saveParty insert", error);
      return {
        error:
          isSchemaError(error)
            ? SCHEMA_MESSAGE
            : error.code === "42501"
            ? "No tienes permiso para crear registros."
            : "No se pudo guardar. Inténtalo de nuevo.",
      };
    }
  }

  revalidatePath(partyListHref(org, kind).split("?")[0]);
  if (kind !== "suppliers") revalidatePath(`/${org}/contratos`);
  redirect(partyListHref(org, kind, kind === "clients" && isClientType(clientType) ? clientType : undefined));
}

export async function deleteParty(
  kind: PartyKind,
  org: string,
  id: string,
): Promise<PartyState> {
  await requireUser();
  const cfg = PARTIES[kind];
  if (!cfg) return { error: "Catálogo no válido." };
  const orgId = await getOrgId(org);
  if (!orgId) return { error: "No encontramos la organización." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from(cfg.table)
    .delete()
    .eq("id", id)
    .eq("organization_id", orgId)
    .select("id");

  if (error) {
    return {
      error:
        error.code === "23503"
          ? `No se puede eliminar: tiene contratos asociados.`
          : "No se pudo eliminar. Inténtalo de nuevo.",
    };
  }
  if (!data?.length) return { error: "Solo los administradores pueden eliminar." };

  revalidatePath(partyListHref(org, kind).split("?")[0]);
  redirect(partyListHref(org, kind));
}

export type PartyCreated = { id?: string; name?: string; error?: string; fields?: Record<string, string> };

// Crea un cliente, proveedor o responsable sin salir de la pantalla (para el cajón de "crear aquí mismo").
// A diferencia de saveParty no redirige: devuelve el registro creado para que quien lo pidió lo use.
export async function createParty(
  kind: PartyKind,
  org: string,
  input: { name: string; ruc: string; address: string; clientType?: string },
): Promise<PartyCreated> {
  await requireUser();
  const cfg = PARTIES[kind];
  if (!cfg) return { error: "Catálogo no válido." };

  const name = input.name.trim();
  const ruc = input.ruc.trim();
  const address = input.address.trim();
  const clientType = input.clientType ?? "";
  const fields: Record<string, string> = {};
  if (kind === "clients" && !isClientType(clientType)) fields.client_type = "Selecciona Empresa, Institución o Persona.";
  if (!name) fields.name = `Escribe el nombre del ${cfg.singular}.`;
  const rErr = rucError(ruc);
  if (rErr) fields.ruc = rErr;
  if (Object.keys(fields).length) return { fields };

  const orgId = await getOrgId(org);
  if (!orgId) return { error: "No encontramos la organización." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from(cfg.table)
    .insert({ organization_id: orgId, name, ruc: ruc || null, address: address || null, ...(kind === "clients" ? { client_type: clientType } : {}) })
    .select("id, name")
    .single();
  if (error || !data) {
    if (error) logDbError("createParty", error);
    return {
      error:
        error && isSchemaError(error)
          ? SCHEMA_MESSAGE
          : error?.code === "42501"
          ? "No tienes permiso para crear registros."
          : "No se pudo guardar. Inténtalo de nuevo.",
    };
  }
  revalidatePath(partyListHref(org, kind).split("?")[0]);
  return { id: data.id as string, name: data.name as string };
}
