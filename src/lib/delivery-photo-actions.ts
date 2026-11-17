"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { SCHEMA_MESSAGE, isSchemaError, logDbError } from "@/lib/db-error";
import { FILES_BUCKET, MAX_FILE_BYTES, resolveMime, safeFileName } from "@/lib/files";
import { getOrgId } from "@/lib/orgs";
import { createClient } from "@/lib/supabase/server";

type Meta = { name: string; size: number; type: string };
const IMAGES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic"]);

// Valida la foto y que la entrega sea de este proceso y de esta organización.
async function check(org: string, contractId: string, deliveryId: string, meta: Meta) {
  await requireUser();
  const name = String(meta.name ?? "").trim();
  if (!name || name.length > 255) return { error: "El nombre del archivo no es válido." } as const;
  if (!Number.isFinite(meta.size) || meta.size < 1) return { error: "La foto está vacía." } as const;
  if (meta.size > MAX_FILE_BYTES) return { error: "La foto supera los 15 MB." } as const;
  const mime = resolveMime(name, String(meta.type ?? ""));
  if (!mime || !IMAGES.has(mime)) return { error: "Solo se aceptan fotos (JPG, PNG, WebP o HEIC)." } as const;
  const orgId = await getOrgId(org);
  if (!orgId) return { error: "Organización no disponible." } as const;
  const supabase = await createClient();
  const { data: delivery } = await supabase.from("deliveries").select("id")
    .eq("id", deliveryId).eq("contract_id", contractId).eq("organization_id", orgId).maybeSingle();
  if (!delivery) return { error: "No encontramos la entrega." } as const;
  return { orgId, supabase, name, mime } as const;
}

// Paso 1: URLs firmadas para subir la foto y su miniatura directo a Storage.
export async function prepareDeliveryPhoto(org: string, contractId: string, deliveryId: string, meta: Meta): Promise<{
  error?: string; path?: string; token?: string; mime?: string; thumbPath?: string; thumbToken?: string;
}> {
  const c = await check(org, contractId, deliveryId, meta);
  if ("error" in c) return { error: c.error };
  const path = `${c.orgId}/${contractId}/${crypto.randomUUID()}-${safeFileName(c.name)}`;
  const bucket = c.supabase.storage.from(FILES_BUCKET);
  const { data, error } = await bucket.createSignedUploadUrl(path);
  if (error || !data) {
    console.error("[entregas] firmar foto", error?.message);
    return { error: "No se pudo preparar la subida. Inténtalo de nuevo." };
  }
  if (c.mime !== "image/heic") {
    const thumbPath = `${path}.thumb.webp`;
    const thumb = await bucket.createSignedUploadUrl(thumbPath);
    if (thumb.data) return { path, token: data.token, mime: c.mime, thumbPath, thumbToken: thumb.data.token };
  }
  return { path, token: data.token, mime: c.mime };
}

// Paso 2: con la foto ya subida, se registra en la entrega.
export async function finishDeliveryPhoto(
  org: string, contractId: string, deliveryId: string, meta: Meta & { path: string; thumbPath?: string },
): Promise<{ error?: string }> {
  const c = await check(org, contractId, deliveryId, meta);
  if ("error" in c) return { error: c.error };
  if (!String(meta.path).startsWith(`${c.orgId}/${contractId}/`)) return { error: "La ruta del archivo no es válida." };
  const bucket = c.supabase.storage.from(FILES_BUCKET);
  const { data: there } = await bucket.exists(meta.path);
  if (!there) return { error: "No se encontró la foto subida. Vuelve a intentarlo." };
  let thumbPath: string | null = null;
  if (meta.thumbPath && meta.thumbPath === `${meta.path}.thumb.webp`) {
    const { data: thumbThere } = await bucket.exists(meta.thumbPath);
    if (thumbThere) thumbPath = meta.thumbPath;
  }
  const { error } = await c.supabase.from("contract_files").insert({
    organization_id: c.orgId, contract_id: contractId, source: "delivery", source_id: deliveryId,
    name: c.name, path: meta.path, thumb_path: thumbPath, mime_type: c.mime, size_bytes: meta.size,
  });
  if (error) {
    await bucket.remove(thumbPath ? [meta.path, thumbPath] : [meta.path]);
    logDbError("fotos de entrega", error);
    return { error: isSchemaError(error) ? SCHEMA_MESSAGE : "No se pudo guardar la foto. Inténtalo de nuevo." };
  }
  revalidatePath(`/${org}/contratos/${contractId}/entregas/${deliveryId}`);
  revalidatePath(`/${org}/contratos/${contractId}/archivos`);
  return {};
}
