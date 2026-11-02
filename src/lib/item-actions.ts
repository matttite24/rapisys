"use server";

import { redirect } from "next/navigation";
import { parseCents, parseDecimal } from "@/lib/money";
import type { PriceRow, SpecRow } from "@/lib/items";
import { getOrgId } from "@/lib/orgs";
import { createClient } from "@/lib/supabase/server";

export type ItemState =
  | { error?: string; fields?: Record<string, string> }
  | undefined;

const NEW = "__new__";
const text = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();

function json<T>(fd: FormData, key: string, fallback: T): T {
  try {
    return JSON.parse(text(fd, key) || "null") ?? fallback;
  } catch {
    return fallback;
  }
}

export async function saveItem(
  org: string,
  id: string | null,
  _: ItemState,
  formData: FormData,
): Promise<ItemState> {
  const fields: Record<string, string> = {};

  const name = text(formData, "name");
  if (!name) fields.name = "Escribe el nombre del item.";

  const categoryChoice = text(formData, "category_id");
  const newCategory = text(formData, "new_category");
  if (categoryChoice === NEW && !newCategory) {
    fields.new_category = "Escribe el nombre de la categoría.";
  }

  const partNumbers = [1, 2, 3].map((n) => text(formData, `part_${n}`)).filter(Boolean);

  // Especificación técnica: filas clave-valor, sin claves repetidas.
  const specs: Record<string, string> = {};
  const specKeys = new Set<string>();
  for (const row of json<SpecRow[]>(formData, "specs", [])) {
    const key = String(row.key ?? "").trim();
    const value = String(row.value ?? "").trim();
    if (!key && !value) continue;
    if (!key) {
      fields.specs = "Cada especificación necesita un nombre.";
      break;
    }
    if (specKeys.has(key.toLowerCase())) {
      fields.specs = `La especificación "${key}" está repetida.`;
      break;
    }
    specKeys.add(key.toLowerCase());
    specs[key] = value;
  }

  // Costos por proveedor.
  const prices: { supplier_id: string; unit_cost_cents: number; vat_rate: number; supplier_sku: string }[] = [];
  const seen = new Set<string>();
  for (const row of json<PriceRow[]>(formData, "prices", [])) {
    if (!row.supplier_id && !row.unit_cost) continue;
    const cost = parseCents(String(row.unit_cost ?? ""));
    const vat = parseDecimal(String(row.vat_rate ?? ""));
    if (!row.supplier_id) {
      fields.prices = "Elige el proveedor en cada costo.";
      break;
    }
    if (!cost.ok) {
      fields.prices = cost.error;
      break;
    }
    if (vat === null) {
      fields.prices = "El IVA debe ser un porcentaje válido.";
      break;
    }
    if (seen.has(row.supplier_id)) {
      fields.prices = "Un proveedor aparece más de una vez.";
      break;
    }
    seen.add(row.supplier_id);
    prices.push({
      supplier_id: row.supplier_id,
      unit_cost_cents: cost.cents,
      vat_rate: vat,
      supplier_sku: String(row.supplier_sku ?? "").trim(),
    });
  }

  const marginChoice = text(formData, "margin");
  const margin = parseDecimal(marginChoice === "custom" ? text(formData, "margin_custom") : marginChoice);
  if (margin === null || margin > 1000) fields.margin = "Escribe un margen válido entre 0 y 1000, por ejemplo 40.";

  if (Object.keys(fields).length) return { fields };

  const orgId = await getOrgId(org);
  if (!orgId) return { error: "No encontramos la organización." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("save_item", {
    p_org: orgId,
    p_id: id,
    p_item: {
      name,
      sku: text(formData, "sku"),
      line: text(formData, "line"),
      description: text(formData, "description"),
      category_id: categoryChoice === NEW ? "" : categoryChoice,
      new_category: categoryChoice === NEW ? newCategory : "",
      part_numbers: partNumbers,
      specs,
      margin_percent: margin,
      is_active: text(formData, "is_active") !== "inactive",
    },
    p_prices: prices,
    p_asset_ids: json<string[]>(formData, "asset_ids", []),
  });

  if (error) {
    if (error.code === "23505") {
      return { fields: { sku: "Ya existe un item con ese SKU. Usa otro." } };
    }
    if (error.code === "42501") return { error: "No tienes permiso para guardar items." };
    console.error("saveItem:", error);
    return { error: "No se pudo guardar el item. Revisa los datos e inténtalo de nuevo." };
  }

  redirect(`/${org}/bodega`);
}

export async function deleteItem(org: string, id: string): Promise<ItemState> {
  const orgId = await getOrgId(org);
  if (!orgId) return { error: "No encontramos la organización." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("items")
    .delete()
    .eq("id", id)
    .eq("organization_id", orgId)
    .select("id");
  if (error) {
    return {
      error:
        error.code === "23503"
          ? "No se puede eliminar: el item se usa en otros registros. Márcalo como inactivo."
          : "No se pudo eliminar. Inténtalo de nuevo.",
    };
  }
  if (!data?.length) return { error: "Solo los administradores pueden eliminar items." };
  redirect(`/${org}/bodega`);
}
