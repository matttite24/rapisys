"use server";

import { revalidatePath } from "next/cache";
import { ASSET_KIND_LABEL, type AssetKind } from "@/lib/items";
import { getOrgId } from "@/lib/orgs";
import { createClient } from "@/lib/supabase/server";
import { cleanSearch } from "@/lib/search";
import { SCHEMA_MESSAGE, isSchemaError, logDbError, type DbError } from "@/lib/db-error";

// `id` solo viene al crear: la lista nueva, para abrirla.
export type ListState = { error?: string; fields?: Record<string, string>; id?: string } | undefined;

const text = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
const refresh = (org: string, contractId: string) =>
  revalidatePath(`/${org}/contratos/${contractId}`, "layout");

function friendly(error: DbError) {
  if (error.code === "42501") return "No tienes permiso para hacer esto.";
  logDbError("lista", error);
  if (isSchemaError(error)) return SCHEMA_MESSAGE;
  return "No se pudo completar la acción. Inténtalo de nuevo.";
}

const LIMITS: Record<string, number> = { name: 200, model: 100, serial: 100, engine: 100, identifier: 100 };

function parseList(fd: FormData) {
  const v = {
    name: text(fd, "name"),
    model: text(fd, "model"),
    serial: text(fd, "serial"),
    engine: text(fd, "engine"),
    identifier: text(fd, "identifier"),
    asset_id: text(fd, "asset_id"),
  };
  const fields: Record<string, string> = {};
  if (!v.name) fields.name = "Escribe el nombre del activo.";
  for (const [key, max] of Object.entries(LIMITS)) {
    if (v[key as keyof typeof v].length > max) fields[key] = `Máximo ${max} caracteres.`;
  }
  return { v, fields };
}

// Datos de la lista que se corrigen después de crearla; el vínculo con el catálogo no cambia.
const details = (v: ReturnType<typeof parseList>["v"]) => ({
  name: v.name,
  model: v.model || null,
  serial: v.serial || null,
  engine: v.engine || null,
  identifier: v.identifier || null,
});

// Crear una lista pide solo el nombre. Si viene de un activo del catálogo, hereda su modelo.
export async function createList(org: string, contractId: string, formData: FormData): Promise<ListState> {
  const name = text(formData, "name");
  const assetId = text(formData, "asset_id");
  if (!name) return { fields: { name: "Escribe el nombre del activo o de la lista." } };
  if (name.length > LIMITS.name) return { fields: { name: `Máximo ${LIMITS.name} caracteres.` } };

  const supabase = await createClient();
  const { data: contract } = await supabase
    .from("contracts")
    .select("organization_id, status")
    .eq("id", contractId)
    .maybeSingle();
  if (!contract) return { error: "No encontramos el contrato." };
  if (contract.status !== "in_progress") {
    return { error: "Las listas se crean cuando el contrato está En ejecución." };
  }

  let model: string | null = null;
  if (assetId) {
    const { data: asset } = await supabase.from("assets").select("model").eq("id", assetId).maybeSingle();
    model = (asset?.model as string | null) ?? null;
  }

  const { data, error } = await supabase
    .from("contract_lists")
    .insert({
      organization_id: contract.organization_id,
      contract_id: contractId,
      name,
      model,
      asset_id: assetId || null,
    })
    .select("id")
    .single();
  if (error) return { error: friendly(error) };
  refresh(org, contractId);
  return { id: data.id as string };
}

export async function updateList(
  org: string,
  contractId: string,
  listId: string,
  formData: FormData,
): Promise<ListState> {
  const { v, fields } = parseList(formData);
  if (Object.keys(fields).length) return { fields };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contract_lists")
    .update(details(v))
    .eq("id", listId)
    .eq("contract_id", contractId)
    .select("id");
  if (error) return { error: friendly(error) };
  if (!data?.length) return { error: "No tienes permiso para editar esta lista." };
  refresh(org, contractId);
  return { id: listId };
}

// Borra la lista con todas sus líneas.
export async function deleteList(org: string, contractId: string, listId: string): Promise<ListState> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contract_lists")
    .delete()
    .eq("id", listId)
    .eq("contract_id", contractId)
    .select("id");
  if (error) return { error: friendly(error) };
  if (!data?.length) return { error: "No tienes permiso para eliminar esta lista." };
  refresh(org, contractId);
}

export type AssetResult = { id: string; name: string; brand: string | null; model: string | null; plate: string | null };

// Busca activos del catálogo por nombre, marca, modelo o placa.
export async function searchAssets(org: string, q: string): Promise<AssetResult[]> {
  const orgId = await getOrgId(org);
  if (!orgId) return [];
  const term = cleanSearch(q);

  const supabase = await createClient();
  let query = supabase
    .from("assets")
    .select("id, name, brand, model, plate")
    .eq("organization_id", orgId)
    .order("name")
    .limit(30); // el selector avisa cuando llega a este tope
  if (term) query = query.or(`name.ilike.%${term}%,brand.ilike.%${term}%,model.ilike.%${term}%,plate.ilike.%${term}%`);
  const { data } = await query;
  return (data ?? []) as AssetResult[];
}

export type QuickAssetState = { error?: string; fields?: Record<string, string>; asset?: AssetResult } | undefined;

// Alta rápida de un activo en el catálogo, desde el cajón de búsqueda. Si ya existe uno con
// ese nombre (sin distinguir mayúsculas) se reutiliza en vez de duplicarlo.
export async function quickCreateAsset(
  org: string,
  name: string,
  kind: string,
  model: string,
): Promise<QuickAssetState> {
  const n = name.trim();
  const m = model.trim();
  const fields: Record<string, string> = {};
  if (!n) fields.name = "Escribe el nombre del activo.";
  else if (n.length > 200) fields.name = "Máximo 200 caracteres.";
  if (!(kind in ASSET_KIND_LABEL)) fields.kind = "Elige el tipo de activo.";
  if (m.length > 100) fields.model = "Máximo 100 caracteres.";
  if (Object.keys(fields).length) return { fields };

  const orgId = await getOrgId(org);
  if (!orgId) return { error: "No encontramos la organización." };
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("assets")
    .select("id, name, brand, model, plate")
    .eq("organization_id", orgId)
    .ilike("name", n.replace(/[\\%_]/g, "\\$&"))
    .limit(1)
    .maybeSingle();
  if (existing) return { asset: existing as AssetResult };

  const { data, error } = await supabase
    .from("assets")
    .insert({ organization_id: orgId, kind: kind as AssetKind, name: n, model: m || null })
    .select("id, name, brand, model, plate")
    .single();
  if (error) return { error: friendly(error) };
  return { asset: data as AssetResult };
}
