"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { SCHEMA_MESSAGE, isSchemaError, logDbError } from "@/lib/db-error";
import { FILES_BUCKET, MAX_FILE_BYTES, resolveMime, safeFileName, type FileSource } from "@/lib/files";
import { getOrgId } from "@/lib/orgs";
import { createClient } from "@/lib/supabase/server";

type Meta = { name: string; size: number; type: string; source: FileSource; sourceId: string | null };
export type PrepareResult = { error?: string; path?: string; token?: string; mime?: string; thumbPath?: string; thumbToken?: string };
export type FileResult = { error?: string; id?: string };

const SOURCES: FileSource[] = ["contract", "purchase", "expense"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Valida lo que se va a subir y comprueba que el contrato (y la compra o el gasto, si se eligió) sean de esta organización.
async function check(org: string, contractId: string, meta: Meta) {
  await requireUser();
  const name = String(meta.name ?? "").trim();
  if (!name || name.length > 255) return { error: "El nombre del archivo no es válido." } as const;
  if (!Number.isFinite(meta.size) || meta.size < 1) return { error: "El archivo está vacío." } as const;
  if (meta.size > MAX_FILE_BYTES) return { error: "El archivo supera los 15 MB." } as const;
  const mime = resolveMime(name, String(meta.type ?? ""));
  if (!mime) return { error: "Solo se aceptan PDF, imágenes, Office, CSV y XML." } as const;
  if (!SOURCES.includes(meta.source)) return { error: "Elige a qué pertenece el archivo." } as const;
  if ((meta.source === "contract") !== (meta.sourceId === null)) return { error: "Elige la compra o el gasto." } as const;
  if (meta.sourceId !== null && !UUID.test(meta.sourceId)) return { error: "Elige la compra o el gasto." } as const;

  const orgId = await getOrgId(org);
  if (!orgId) return { error: "No encontramos la organización." } as const;
  const supabase = await createClient();
  const { data: contract } = await supabase.from("contracts").select("id").eq("id", contractId).eq("organization_id", orgId).maybeSingle();
  if (!contract) return { error: "No encontramos el contrato." } as const;
  if (meta.source !== "contract") {
    const table = meta.source === "purchase" ? "purchases" : "contract_expenses";
    const { data: owner } = await supabase.from(table).select("id").eq("id", meta.sourceId as string).eq("contract_id", contractId).maybeSingle();
    if (!owner) return { error: meta.source === "purchase" ? "No encontramos esa compra." : "No encontramos ese gasto." } as const;
  }
  return { orgId, supabase, name, mime } as const;
}

// Paso 1: valida y devuelve una URL firmada para que el navegador suba el archivo directo a Storage (sin pasar por Next).
export async function prepareUpload(org: string, contractId: string, meta: Meta): Promise<PrepareResult> {
  const c = await check(org, contractId, meta);
  if ("error" in c) return { error: c.error };
  const path = `${c.orgId}/${contractId}/${crypto.randomUUID()}-${safeFileName(c.name)}`;
  const { data, error } = await c.supabase.storage.from(FILES_BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    console.error("[archivos] firmar subida", error?.message);
    return { error: "No se pudo preparar la subida. Inténtalo de nuevo." };
  }
  // Las imágenes llevan una miniatura aparte (la hace el navegador; si falla, el archivo se sube igual).
  if (c.mime.startsWith("image/") && c.mime !== "image/heic") {
    const thumbPath = `${path}.thumb.webp`;
    const thumb = await c.supabase.storage.from(FILES_BUCKET).createSignedUploadUrl(thumbPath);
    if (thumb.data) return { path, token: data.token, mime: c.mime, thumbPath, thumbToken: thumb.data.token };
  }
  return { path, token: data.token, mime: c.mime };
}

// Paso 2: con el archivo ya subido, se registra. Se comprueba que el objeto exista y que la ruta sea de este contrato.
export async function finishUpload(org: string, contractId: string, meta: Meta & { path: string; thumbPath?: string }): Promise<FileResult> {
  const c = await check(org, contractId, meta);
  if ("error" in c) return { error: c.error };
  if (!String(meta.path).startsWith(`${c.orgId}/${contractId}/`)) return { error: "La ruta del archivo no es válida." };

  const bucket = c.supabase.storage.from(FILES_BUCKET);
  const { data: there } = await bucket.exists(meta.path);
  if (!there) return { error: "No se encontró el archivo subido. Vuelve a intentarlo." };

  // La miniatura solo se acepta con la ruta que corresponde a este archivo y si de verdad se subió.
  let thumbPath: string | null = null;
  if (meta.thumbPath && meta.thumbPath === `${meta.path}.thumb.webp`) {
    const { data: thumbThere } = await bucket.exists(meta.thumbPath);
    if (thumbThere) thumbPath = meta.thumbPath;
  }

  const { data, error } = await c.supabase
    .from("contract_files")
    .insert({
      organization_id: c.orgId,
      contract_id: contractId,
      source: meta.source,
      source_id: meta.sourceId,
      name: c.name,
      path: meta.path,
      mime_type: c.mime,
      size_bytes: meta.size,
      thumb_path: thumbPath,
    })
    .select("id")
    .single();
  if (error) {
    // Sin registro, el objeto quedaría huérfano: se quita.
    await bucket.remove(thumbPath ? [meta.path, thumbPath] : [meta.path]);
    logDbError("archivos", error);
    return { error: isSchemaError(error) ? SCHEMA_MESSAGE : "No se pudo guardar el archivo. Inténtalo de nuevo." };
  }
  revalidatePath(`/${org}/contratos/${contractId}/archivos`);
  return { id: data.id };
}

// URL firmada de 60 s para ver o descargar un archivo.
export async function getFileUrl(org: string, contractId: string, fileId: string, mode: "view" | "download"): Promise<{ error?: string; url?: string }> {
  await requireUser();
  const supabase = await createClient();
  const { data: file } = await supabase.from("contract_files").select("path, name").eq("id", fileId).eq("contract_id", contractId).maybeSingle();
  if (!file) return { error: "No encontramos el archivo." };
  const { data, error } = await supabase.storage.from(FILES_BUCKET).createSignedUrl(file.path, 60, mode === "download" ? { download: file.name } : undefined);
  if (error || !data) return { error: "No se pudo abrir el archivo. Inténtalo de nuevo." };
  void org;
  return { url: data.signedUrl };
}

export async function deleteFile(org: string, contractId: string, fileId: string): Promise<FileResult> {
  await requireUser();
  const supabase = await createClient();
  const { data: file } = await supabase.from("contract_files").select("path, thumb_path").eq("id", fileId).eq("contract_id", contractId).maybeSingle();
  if (!file) return { error: "No encontramos el archivo." };
  const { error } = await supabase.from("contract_files").delete().eq("id", fileId);
  if (error) {
    logDbError("archivos", error);
    return { error: "No se pudo borrar. Inténtalo de nuevo." };
  }
  await supabase.storage.from(FILES_BUCKET).remove(file.thumb_path ? [file.path, file.thumb_path] : [file.path]);
  revalidatePath(`/${org}/contratos/${contractId}/archivos`);
  return {};
}
