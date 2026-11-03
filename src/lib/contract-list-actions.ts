"use server";

import { revalidatePath } from "next/cache";
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

const row = (v: ReturnType<typeof parseList>["v"]) => ({
  name: v.name,
  model: v.model || null,
  serial: v.serial || null,
  engine: v.engine || null,
  identifier: v.identifier || null,
  asset_id: v.asset_id || null,
});

export async function createList(org: string, contractId: string, formData: FormData): Promise<ListState> {
  const { v, fields } = parseList(formData);
  if (Object.keys(fields).length) return { fields };

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
    .insert({ organization_id: contract.organization_id, contract_id: contractId, ...row(v) })
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
    .update(row(v))
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

export type AssetResult = { id: string; name: string; model: string | null };

// Busca activos del catálogo por nombre, marca, modelo o placa.
export async function searchAssets(org: string, q: string): Promise<AssetResult[]> {
  const orgId = await getOrgId(org);
  if (!orgId) return [];
  const term = cleanSearch(q);

  const supabase = await createClient();
  let query = supabase
    .from("assets")
    .select("id, name, model")
    .eq("organization_id", orgId)
    .order("name")
    .limit(10);
  if (term) query = query.or(`name.ilike.%${term}%,brand.ilike.%${term}%,model.ilike.%${term}%,plate.ilike.%${term}%`);
  const { data } = await query;
  return (data ?? []) as AssetResult[];
}
