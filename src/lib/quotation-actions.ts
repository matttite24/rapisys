"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOrgId } from "@/lib/orgs";
import { isSchemaError, logDbError, SCHEMA_MESSAGE, type DbError } from "@/lib/db-error";
import { readQuotation } from "@/lib/quotation-input";
import { requireUser } from "@/lib/auth";
import { FILES_BUCKET, MAX_FILE_BYTES, resolveMime, safeFileName } from "@/lib/files";

export type Quotation = {
  id: string;
  supplier: string;
  contact: string;
  supplier_id: string | null;
  phone: string;
  email: string;
  note: string;
  unit_cost_cents: number | null;
  availability: string;
  lead_time: string;
  proforma_url: string;
  created_at: string;
  files: QuotationFile[];
};
export type QuotationFile = { id: string; name: string; mime_type: string; size_bytes: number };
export type QuoteSupplier = { id: string; name: string; ruc: string | null; phone: string | null; email: string | null };

function friendly(error: DbError) {
  if (isSchemaError(error)) return SCHEMA_MESSAGE;
  if (error.code === "42501") return "No tienes permiso para registrar esta gestión.";
  if (error.message === "not_in_progress") return "Solo puedes registrar gestiones en procesos En ejecución.";
  logDbError("cotizaciones", error);
  return "No se pudo completar la acción. Inténtalo de nuevo.";
}

export async function listQuotations(org: string, contractId: string, lineId: string, offset = 0): Promise<{
  rows?: Quotation[]; more?: boolean; error?: string;
}> {
  const orgId = await getOrgId(org);
  if (!orgId) return { error: "Organización no disponible." };
  const supabase = await createClient();
  const { data: line, error: lineError } = await supabase.from("contract_items").select("id")
    .eq("id", lineId).eq("contract_id", contractId).eq("organization_id", orgId).maybeSingle();
  if (lineError) return { error: friendly(lineError) };
  if (!line) return { error: "Línea no disponible." };
  const start = Number.isSafeInteger(offset) && offset >= 0 ? offset : 0;
  const { data, error } = await supabase.from("line_quotations")
    .select("id, supplier, contact, supplier_id, phone, email, note, unit_cost_cents, availability, lead_time, proforma_url, created_at, files:line_quotation_files(id, name, mime_type, size_bytes)")
    .eq("organization_id", orgId).eq("contract_item_id", lineId)
    .order("created_at", { ascending: false }).order("id", { ascending: false }).range(start, start + 20);
  if (error) return { error: friendly(error) };
  return {
    rows: ((data ?? []).slice(0, 20) as unknown as Quotation[]).map((r) => ({
      ...r,
      unit_cost_cents: r.unit_cost_cents === null ? null : Number(r.unit_cost_cents),
      files: (r.files ?? []).map((f) => ({ ...f, size_bytes: Number(f.size_bytes) })),
    })),
    more: (data?.length ?? 0) > 20,
  };
}

// Proveedores del catálogo por nombre o RUC, con su contacto para rellenar la gestión (máx. 8).
export async function searchQuoteSuppliers(org: string, q: string): Promise<QuoteSupplier[]> {
  const orgId = await getOrgId(org);
  const term = q.replace(/[%,()*\\]/g, " ").trim().slice(0, 100);
  if (!orgId || !term) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.from("suppliers").select("id, name, ruc, phone, email")
    .eq("organization_id", orgId).or(`name.ilike.%${term}%,ruc.ilike.%${term}%`).order("name").limit(8);
  if (error) {
    logDbError("proveedores de cotización", error);
    return [];
  }
  return (data ?? []) as QuoteSupplier[];
}

export async function addQuotation(org: string, contractId: string, lineId: string, form: FormData): Promise<{ error?: string; id?: string }> {
  const parsed = readQuotation(form);
  if (!parsed.values) return { error: parsed.error };
  const orgId = await getOrgId(org);
  if (!orgId) return { error: "Organización no disponible." };
  const v = parsed.values;
  const supabase = await createClient();

  // Con los campos llenos, el proveedor nuevo se guarda en el catálogo para la próxima vez.
  let supplierId = v.supplierId;
  if (!supplierId && v.saveSupplier && v.supplier) {
    const { data: created, error: supplierError } = await supabase.from("suppliers")
      .insert({ organization_id: orgId, name: v.supplier, phone: v.phone || null, email: v.email || null })
      .select("id").single();
    if (supplierError || !created) {
      if (supplierError) logDbError("proveedor desde cotización", supplierError);
      return { error: supplierError && isSchemaError(supplierError) ? SCHEMA_MESSAGE : "No se pudo guardar el proveedor. Inténtalo de nuevo." };
    }
    supplierId = created.id as string;
  }

  const { data, error } = await supabase.rpc("line_quotation_add", {
    p_org_id: orgId, p_contract_id: contractId, p_line_id: lineId,
    p_supplier: v.supplier, p_phone: v.phone, p_email: v.email, p_note: v.note, p_unit_cost_cents: v.unitCostCents,
    p_availability: v.availability, p_lead_time: v.leadTime, p_proforma_url: v.proformaUrl, p_supplier_id: supplierId,
  });
  if (error) return { error: friendly(error) };
  revalidatePath(`/${org}/contratos/${contractId}`, "layout");
  return { id: data as string };
}

type Meta = { name: string; size: number; type: string };

// Valida el archivo y que el registro de cotización sea de esta organización y de este proceso.
async function checkFile(org: string, contractId: string, quotationId: string, meta: Meta) {
  await requireUser();
  const name = String(meta.name ?? "").trim();
  if (!name || name.length > 255) return { error: "El nombre del archivo no es válido." } as const;
  if (!Number.isFinite(meta.size) || meta.size < 1) return { error: "El archivo está vacío." } as const;
  if (meta.size > MAX_FILE_BYTES) return { error: "El archivo supera los 15 MB." } as const;
  const mime = resolveMime(name, String(meta.type ?? ""));
  if (!mime) return { error: "Solo se aceptan PDF, imágenes, Office, CSV y XML." } as const;
  const orgId = await getOrgId(org);
  if (!orgId) return { error: "Organización no disponible." } as const;
  const supabase = await createClient();
  const { data: q } = await supabase.from("line_quotations")
    .select("id, line:contract_items!inner(contract_id)").eq("id", quotationId).eq("organization_id", orgId).maybeSingle();
  const line = q?.line as { contract_id: string } | { contract_id: string }[] | null | undefined;
  const owner = Array.isArray(line) ? line[0]?.contract_id : line?.contract_id;
  if (!q || owner !== contractId) return { error: "No encontramos la cotización." } as const;
  return { orgId, supabase, name, mime } as const;
}

// Paso 1: URL firmada para subir directo a Storage (misma carpeta {org}/{proceso}/ que los demás archivos).
export async function prepareQuotationUpload(org: string, contractId: string, quotationId: string, meta: Meta): Promise<{ error?: string; path?: string; token?: string; mime?: string }> {
  const c = await checkFile(org, contractId, quotationId, meta);
  if ("error" in c) return { error: c.error };
  const path = `${c.orgId}/${contractId}/${crypto.randomUUID()}-${safeFileName(c.name)}`;
  const { data, error } = await c.supabase.storage.from(FILES_BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    console.error("[cotizaciones] firmar subida", error?.message);
    return { error: "No se pudo preparar la subida. Inténtalo de nuevo." };
  }
  return { path, token: data.token, mime: c.mime };
}

// Paso 2: con el archivo ya subido, se registra en la cotización.
export async function finishQuotationUpload(org: string, contractId: string, quotationId: string, meta: Meta & { path: string }): Promise<{ error?: string }> {
  const c = await checkFile(org, contractId, quotationId, meta);
  if ("error" in c) return { error: c.error };
  if (!String(meta.path).startsWith(`${c.orgId}/${contractId}/`)) return { error: "La ruta del archivo no es válida." };
  const bucket = c.supabase.storage.from(FILES_BUCKET);
  const { data: there } = await bucket.exists(meta.path);
  if (!there) return { error: "No se encontró el archivo subido. Vuelve a intentarlo." };
  const { error } = await c.supabase.from("line_quotation_files").insert({
    organization_id: c.orgId, quotation_id: quotationId, name: c.name, path: meta.path, mime_type: c.mime, size_bytes: meta.size,
  });
  if (error) {
    await bucket.remove([meta.path]);
    logDbError("archivos de cotización", error);
    return { error: isSchemaError(error) ? SCHEMA_MESSAGE : "No se pudo guardar el archivo. Inténtalo de nuevo." };
  }
  return {};
}

// URL firmada de 60 s para ver un adjunto.
export async function getQuotationFileUrl(fileId: string): Promise<{ error?: string; url?: string }> {
  await requireUser();
  const supabase = await createClient();
  const { data: file } = await supabase.from("line_quotation_files").select("path").eq("id", fileId).maybeSingle();
  if (!file) return { error: "No encontramos el archivo." };
  const { data, error } = await supabase.storage.from(FILES_BUCKET).createSignedUrl(file.path as string, 60);
  if (error || !data) return { error: "No se pudo abrir el archivo. Inténtalo de nuevo." };
  return { url: data.signedUrl };
}
