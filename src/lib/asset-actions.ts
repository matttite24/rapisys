"use server";

import { redirect } from "next/navigation";
import { ASSET_KIND_LABEL, type AssetKind } from "@/lib/items";
import { getOrgId } from "@/lib/orgs";
import { createClient } from "@/lib/supabase/server";
import { SCHEMA_MESSAGE, isSchemaError, logDbError } from "@/lib/db-error";

export type AssetState =
  | { error?: string; fields?: Record<string, string> }
  | undefined;

const text = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();

export async function saveAsset(
  org: string,
  id: string | null,
  _: AssetState,
  formData: FormData,
): Promise<AssetState> {
  const kind = text(formData, "kind");
  const name = text(formData, "name");
  const yearRaw = text(formData, "year");
  const year = yearRaw ? Number(yearRaw) : null;

  const fields: Record<string, string> = {};
  if (!(kind in ASSET_KIND_LABEL)) fields.kind = "Elige el tipo de activo.";
  if (!name) fields.name = "Escribe el nombre del activo.";
  if (year !== null && (!Number.isInteger(year) || year < 1950 || year > 2100)) {
    fields.year = "Escribe un año entre 1950 y 2100.";
  }
  for (const key of ["serial", "engine", "identifier"]) {
    if (text(formData, key).length > 100) fields[key] = "Máximo 100 caracteres.";
  }
  if (Object.keys(fields).length) return { fields };

  const orgId = await getOrgId(org);
  if (!orgId) return { error: "No encontramos la organización." };

  const values = {
    kind: kind as AssetKind,
    name,
    brand: text(formData, "brand") || null,
    model: text(formData, "model") || null,
    year,
    plate: text(formData, "plate").toUpperCase() || null,
    serial: text(formData, "serial") || null,
    engine: text(formData, "engine") || null,
    identifier: text(formData, "identifier") || null,
  };

  const supabase = await createClient();
  if (id) {
    const { data, error } = await supabase
      .from("assets")
      .update(values)
      .eq("id", id)
      .eq("organization_id", orgId)
      .select("id");
    if (error) {
      logDbError("saveAsset update", error);
      return { error: isSchemaError(error) ? SCHEMA_MESSAGE : "No se pudo guardar. Inténtalo de nuevo." };
    }
    if (!data?.length) return { error: "No tienes permiso para editar este activo." };
  } else {
    const { error } = await supabase.from("assets").insert({ organization_id: orgId, ...values });
    if (error) {
      logDbError("saveAsset insert", error);
      return {
        error:
          isSchemaError(error)
            ? SCHEMA_MESSAGE
            : error.code === "42501"
            ? "No tienes permiso para crear activos."
            : "No se pudo guardar. Inténtalo de nuevo.",
      };
    }
  }
  redirect(`/${org}/bodega/activos`);
}

export async function deleteAsset(org: string, id: string): Promise<AssetState> {
  const orgId = await getOrgId(org);
  if (!orgId) return { error: "No encontramos la organización." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("assets")
    .delete()
    .eq("id", id)
    .eq("organization_id", orgId)
    .select("id");
  if (error) return { error: "No se pudo eliminar. Inténtalo de nuevo." };
  if (!data?.length) return { error: "Solo los administradores pueden eliminar activos." };
  redirect(`/${org}/bodega/activos`);
}
