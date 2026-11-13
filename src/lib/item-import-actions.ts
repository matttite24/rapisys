"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { SCHEMA_MESSAGE, isSchemaError, logDbError } from "@/lib/db-error";
import { MAX_IMPORT_ROWS, type ImportRow } from "@/lib/item-csv";
import { getOrgId } from "@/lib/orgs";
import { createClient } from "@/lib/supabase/server";

export type ImportResult = { error?: string; count?: number; rowErrors?: Record<number, string> } | undefined;

// Importa items de bodega desde las filas ya leídas del CSV. Todo o nada: si una fila choca (SKU que ya
// existe, por ejemplo), no se guarda ninguna y se devuelve el motivo por fila (posición en el archivo).
export async function importItems(org: string, rows: ImportRow[]): Promise<ImportResult> {
  await requireUser();
  if (!Array.isArray(rows) || rows.length === 0) return { error: "No hay items para importar." };
  if (rows.length > MAX_IMPORT_ROWS) return { error: `Máximo ${MAX_IMPORT_ROWS} items por importación.` };
  const orgId = await getOrgId(org);
  if (!orgId) return { error: "No encontramos la organización." };

  const rowErrors: Record<number, string> = {};
  const clean = rows.map((r, i) => {
    const name = String(r.name ?? "").trim();
    if (!name) rowErrors[i] = "Falta el nombre.";
    const opt = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max) || null;
    // Número de parte 1 = código interno del CSV; 2 = referencia del fabricante (sin repetir).
    const parts = [...new Set([opt(r.internalCode, 60), opt(r.partRef, 60)].filter((p): p is string => Boolean(p)))];
    return {
      name,
      tdr_name: opt(r.tdrName, 300),
      sku: opt(r.sku, 60),
      barcode: opt(r.barcode, 60),
      unit: opt(r.unit, 30),
      description: opt(r.description, 2000),
      part_numbers: parts,
    };
  });
  if (Object.keys(rowErrors).length) return { rowErrors };

  const supabase = await createClient();

  // SKU que ya existen en la bodega.
  const skus = clean.map((c) => c.sku).filter((s): s is string => Boolean(s));
  if (skus.length) {
    const { data, error } = await supabase.from("items").select("sku").eq("organization_id", orgId).in("sku", skus);
    if (error) { logDbError("importItems: SKU", error); return { error: isSchemaError(error) ? SCHEMA_MESSAGE : "No se pudo revisar los SKU. Inténtalo de nuevo." }; }
    const taken = new Set((data ?? []).map((d) => String(d.sku).toLowerCase()));
    clean.forEach((c, i) => { if (c.sku && taken.has(c.sku.toLowerCase())) rowErrors[i] = "Ya existe un item con ese SKU."; });
    if (Object.keys(rowErrors).length) return { rowErrors };
  }

  const { error } = await supabase.from("items").insert(
    clean.map((c) => ({ ...c, organization_id: orgId })),
  );
  if (error) {
    if (error.code === "23505") return { error: "Hay un SKU repetido. Revisa el archivo." };
    if (error.code === "42501") return { error: "No tienes permiso para importar items." };
    logDbError("importItems", error);
    return { error: isSchemaError(error) ? SCHEMA_MESSAGE : "No se pudo importar. Revisa el archivo e inténtalo de nuevo." };
  }
  revalidatePath(`/${org}/bodega`);
  return { count: clean.length };
}
