"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOrgId } from "@/lib/orgs";
import { isSchemaError, logDbError, SCHEMA_MESSAGE, type DbError } from "@/lib/db-error";
import { readQuotation } from "@/lib/quotation-input";

export type Quotation = {
  id: string;
  supplier: string;
  contact: string;
  note: string;
  unit_cost_cents: number | null;
  availability: string;
  lead_time: string;
  proforma_url: string;
  created_at: string;
};

function friendly(error: DbError) {
  if (isSchemaError(error)) return SCHEMA_MESSAGE;
  if (error.code === "42501") return "No tienes permiso para registrar esta gestión.";
  if (error.message === "not_in_progress") return "Solo puedes registrar gestiones en contratos En ejecución.";
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
    .select("id, supplier, contact, note, unit_cost_cents, availability, lead_time, proforma_url, created_at")
    .eq("organization_id", orgId).eq("contract_item_id", lineId)
    .order("created_at", { ascending: false }).order("id", { ascending: false }).range(start, start + 20);
  if (error) return { error: friendly(error) };
  return {
    rows: ((data ?? []).slice(0, 20) as Quotation[]).map((r) => ({
      ...r, unit_cost_cents: r.unit_cost_cents === null ? null : Number(r.unit_cost_cents),
    })),
    more: (data?.length ?? 0) > 20,
  };
}

export async function addQuotation(org: string, contractId: string, lineId: string, form: FormData): Promise<{ error?: string }> {
  const parsed = readQuotation(form);
  if (!parsed.values) return { error: parsed.error };
  const orgId = await getOrgId(org);
  if (!orgId) return { error: "Organización no disponible." };
  const v = parsed.values;
  const supabase = await createClient();
  const { error } = await supabase.rpc("line_quotation_add", {
    p_org_id: orgId, p_contract_id: contractId, p_line_id: lineId,
    p_supplier: v.supplier, p_contact: v.contact, p_note: v.note, p_unit_cost_cents: v.unitCostCents,
    p_availability: v.availability, p_lead_time: v.leadTime, p_proforma_url: v.proformaUrl,
  });
  if (error) return { error: friendly(error) };
  revalidatePath(`/${org}/contratos/${contractId}`, "layout");
  return {};
}
