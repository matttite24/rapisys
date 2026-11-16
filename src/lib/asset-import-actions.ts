"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { SCHEMA_MESSAGE, isSchemaError, logDbError } from "@/lib/db-error";
import { MAX_ASSET_IMPORT_ROWS, buildAssetRows, type AssetImportRow } from "@/lib/asset-csv";
import { ASSET_KIND_LABEL } from "@/lib/items";
import { getOrgId } from "@/lib/orgs";
import { createClient } from "@/lib/supabase/server";

export type AssetImportResult = { error?: string; count?: number; rowErrors?: Record<number, string> } | undefined;

// Importa activos desde las filas ya leídas del CSV. Todo o nada: si una fila no es válida o su placa ya existe,
// no se guarda ninguna y se devuelve el motivo por fila (posición en el archivo).
export async function importAssets(org: string, rows: AssetImportRow[]): Promise<AssetImportResult> {
  await requireUser();
  if (!Array.isArray(rows) || rows.length === 0) return { error: "No hay activos para importar." };
  if (rows.length > MAX_ASSET_IMPORT_ROWS) return { error: `Máximo ${MAX_ASSET_IMPORT_ROWS} activos por importación.` };
  const orgId = await getOrgId(org);
  if (!orgId) return { error: "No encontramos la organización." };

  // El servidor vuelve a validar con las mismas reglas del archivo (no confía en lo que manda el navegador).
  const str = (v: unknown) => String(v ?? "");
  const checked = buildAssetRows(
    rows.map((r) => ({ kind: str(r.kind), name: str(r.name), brand: str(r.brand), model: str(r.model), year: str(r.year), plate: str(r.plate), serial: str(r.serial), engine: str(r.engine), identifier: str(r.identifier), other: str(r.other) })),
    new Set(["kind", "name", "brand", "model", "year", "plate", "serial", "engine", "identifier", "other"]),
  );
  // El tipo llega ya normalizado (light_vehicle…): se acepta tal cual o por su nombre.
  const rowErrors: Record<number, string> = {};
  checked.forEach((r, i) => { if (r.error) rowErrors[i] = r.error; });
  if (Object.keys(rowErrors).length) return { rowErrors };

  const clean = checked.map((r) => ({
    organization_id: orgId,
    kind: r.kind as keyof typeof ASSET_KIND_LABEL,
    name: r.name,
    brand: r.brand.slice(0, 100) || null,
    model: r.model.slice(0, 100) || null,
    year: r.year ? Number(r.year) : null,
    plate: r.plate || null,
    serial: r.serial || null,
    engine: r.engine || null,
    identifier: r.identifier || null,
    other: r.other || null,
  }));

  const supabase = await createClient();
  const plates = clean.map((c) => c.plate).filter((p): p is string => Boolean(p));
  if (plates.length) {
    const { data, error } = await supabase.from("assets").select("plate").eq("organization_id", orgId).in("plate", plates);
    if (error) { logDbError("importAssets: placas", error); return { error: isSchemaError(error) ? SCHEMA_MESSAGE : "No se pudo revisar las placas. Inténtalo de nuevo." }; }
    const taken = new Set((data ?? []).map((d) => String(d.plate).toUpperCase()));
    clean.forEach((c, i) => { if (c.plate && taken.has(c.plate)) rowErrors[i] = "Ya existe un activo con esa placa."; });
    if (Object.keys(rowErrors).length) return { rowErrors };
  }

  const { error } = await supabase.from("assets").insert(clean);
  if (error) {
    if (error.code === "42501") return { error: "No tienes permiso para importar activos." };
    logDbError("importAssets", error);
    return { error: isSchemaError(error) ? SCHEMA_MESSAGE : "No se pudo importar. Revisa el archivo e inténtalo de nuevo." };
  }
  revalidatePath(`/${org}/bodega`);
  return { count: clean.length };
}
