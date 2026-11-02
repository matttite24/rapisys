"use server";

import { redirect } from "next/navigation";
import { PARTIES, rucError, type PartyKind } from "@/lib/parties";
import { getOrgId } from "@/lib/orgs";
import { createClient } from "@/lib/supabase/server";

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
  // La tabla sale de una lista cerrada, nunca del cliente.
  const cfg = PARTIES[kind];
  if (!cfg) return { error: "Catálogo no válido." };

  const name = text(formData, "name");
  const ruc = text(formData, "ruc");
  const address = text(formData, "address");

  const fields: Record<string, string> = {};
  if (!name) fields.name = `Escribe el nombre del ${cfg.singular}.`;
  const rErr = rucError(ruc);
  if (rErr) fields.ruc = rErr;
  if (Object.keys(fields).length) return { fields };

  const orgId = await getOrgId(org);
  if (!orgId) return { error: "No encontramos la organización." };

  const supabase = await createClient();
  const values = { name, ruc: ruc || null, address: address || null };

  if (id) {
    const { data, error } = await supabase
      .from(cfg.table)
      .update(values)
      .eq("id", id)
      .eq("organization_id", orgId)
      .select("id");
    if (error) {
      console.error("saveParty update:", error);
      return { error: "No se pudo guardar. Inténtalo de nuevo." };
    }
    if (!data?.length) return { error: "No tienes permiso para editar este registro." };
  } else {
    const { error } = await supabase
      .from(cfg.table)
      .insert({ organization_id: orgId, ...values });
    if (error) {
      console.error("saveParty insert:", error);
      return {
        error:
          error.code === "42501"
            ? "No tienes permiso para crear registros."
            : "No se pudo guardar. Inténtalo de nuevo.",
      };
    }
  }

  redirect(`/${org}/${cfg.path}`);
}

export async function deleteParty(
  kind: PartyKind,
  org: string,
  id: string,
): Promise<PartyState> {
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

  redirect(`/${org}/${cfg.path}`);
}
