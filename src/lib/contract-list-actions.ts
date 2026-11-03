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

const LIMITS = { name: 200 };

// Crear una lista pide solo el nombre. Si viene de un activo del catálogo, sus datos se leen del activo.
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

  const { data, error } = await supabase
    .from("contract_lists")
    .insert({
      organization_id: contract.organization_id,
      contract_id: contractId,
      name,
      asset_id: assetId || null,
    })
    .select("id")
    .single();
  if (error) return { error: friendly(error) };
  refresh(org, contractId);
  return { id: data.id as string };
}

// Corrige una lista ya creada. Si es de un activo del catálogo, los datos de la máquina
// (tipo, marca, modelo, serie, motor, identificador) son del activo y se corrigen ahí.
export async function updateList(
  org: string,
  contractId: string,
  listId: string,
  formData: FormData,
): Promise<ListState> {
  const name = text(formData, "name");
  const fields: Record<string, string> = {};
  if (!name) fields.name = "Escribe el nombre del activo o de la lista.";
  else if (name.length > LIMITS.name) fields.name = `Máximo ${LIMITS.name} caracteres.`;

  const asset = {
    brand: text(formData, "brand"),
    model: text(formData, "model"),
    serial: text(formData, "serial"),
    engine: text(formData, "engine"),
    identifier: text(formData, "identifier"),
  };
  const kind = text(formData, "kind");
  for (const [key, value] of Object.entries(asset)) {
    if (value.length > 100) fields[key] = "Máximo 100 caracteres.";
  }
  if (Object.keys(fields).length) return { fields };

  const supabase = await createClient();
  const { data: list } = await supabase
    .from("contract_lists")
    .select("asset_id")
    .eq("id", listId)
    .eq("contract_id", contractId)
    .maybeSingle();
  if (!list) return { error: "No encontramos la lista." };

  if (list.asset_id) {
    if (!(kind in ASSET_KIND_LABEL)) return { fields: { kind: "Elige el tipo de activo." } };
    const { data, error } = await supabase
      .from("assets")
      .update({
        kind: kind as AssetKind,
        name,
        brand: asset.brand || null,
        model: asset.model || null,
        serial: asset.serial || null,
        engine: asset.engine || null,
        identifier: asset.identifier || null,
      })
      .eq("id", list.asset_id)
      .select("id");
    if (error) return { error: friendly(error) };
    if (!data?.length) return { error: "No tienes permiso para editar este activo." };
  }

  const { data, error } = await supabase
    .from("contract_lists")
    .update({ name })
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

export type AssetResult = {
  id: string;
  name: string;
  brand: string | null;
  model: string | null;
  serial: string | null;
};

// Busca activos del catálogo por nombre, marca, modelo o placa.
export async function searchAssets(org: string, q: string): Promise<AssetResult[]> {
  const orgId = await getOrgId(org);
  if (!orgId) return [];
  const term = cleanSearch(q);

  const supabase = await createClient();
  let query = supabase
    .from("assets")
    .select("id, name, brand, model, serial")
    .eq("organization_id", orgId)
    .order("name")
    .limit(30); // el selector avisa cuando llega a este tope
  if (term) query = query.or(`name.ilike.%${term}%,brand.ilike.%${term}%,model.ilike.%${term}%,serial.ilike.%${term}%,identifier.ilike.%${term}%,plate.ilike.%${term}%`);
  const { data } = await query;
  return (data ?? []) as AssetResult[];
}

export type QuickAssetState = { error?: string; fields?: Record<string, string>; asset?: AssetResult } | undefined;

// Datos de un activo nuevo, desde el modal de crear lista.
export type NewAsset = {
  name: string;
  kind: string;
  brand: string;
  model: string;
  serial: string;
  engine: string;
  identifier: string;
};

// Alta de un activo en el catálogo. Si ya existe el mismo (mismo nombre y misma serie, sin
// distinguir mayúsculas) se reutiliza en vez de duplicarlo.
export async function quickCreateAsset(org: string, input: NewAsset): Promise<QuickAssetState> {
  const v = Object.fromEntries(Object.entries(input).map(([k, val]) => [k, String(val ?? "").trim()])) as NewAsset;
  const fields: Record<string, string> = {};
  if (!v.name) fields.name = "Escribe el nombre del activo.";
  else if (v.name.length > 200) fields.name = "Máximo 200 caracteres.";
  if (!(v.kind in ASSET_KIND_LABEL)) fields.kind = "Elige el tipo de activo.";
  for (const key of ["brand", "model", "serial", "engine", "identifier"] as const) {
    if (v[key].length > 100) fields[key] = "Máximo 100 caracteres.";
  }
  if (Object.keys(fields).length) return { fields };

  const orgId = await getOrgId(org);
  if (!orgId) return { error: "No encontramos la organización." };
  const supabase = await createClient();

  const { data: sameName } = await supabase
    .from("assets")
    .select("id, name, brand, model, serial")
    .eq("organization_id", orgId)
    .ilike("name", v.name.replace(/[\\%_]/g, "\\$&"))
    .limit(20);
  const same = (sameName ?? []).find(
    (a) => (a.serial ?? "").toLowerCase() === v.serial.toLowerCase(),
  );
  if (same) return { asset: same as AssetResult };

  const { data, error } = await supabase
    .from("assets")
    .insert({
      organization_id: orgId,
      kind: v.kind as AssetKind,
      name: v.name,
      brand: v.brand || null,
      model: v.model || null,
      serial: v.serial || null,
      engine: v.engine || null,
      identifier: v.identifier || null,
    })
    .select("id, name, brand, model, serial")
    .single();
  if (error) return { error: friendly(error) };
  return { asset: data as AssetResult };
}
