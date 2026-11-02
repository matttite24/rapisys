"use server";

import { revalidatePath } from "next/cache";
import {
  NEEDS_FULL_RECEIPT,
  PHASE_ORDER,
  STATUS_ORDER,
  parseMoney,
  type Phase,
} from "@/lib/contracts";
import { getOrgId } from "@/lib/orgs";
import { createClient } from "@/lib/supabase/server";

export type LineState = { error?: string; fields?: Record<string, string> } | undefined;

const text = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
const refresh = (org: string, contractId: string) =>
  revalidatePath(`/${org}/contratos/${contractId}`);

function friendly(error: { code?: string }) {
  if (error.code === "42501") return "No tienes permiso para hacer esto.";
  console.error("contrato:", error);
  return "No se pudo completar la acción. Inténtalo de nuevo.";
}

export async function addLine(
  org: string,
  contractId: string,
  vatRate: number,
  _: LineState,
  formData: FormData,
): Promise<LineState> {
  const itemId = text(formData, "item_id");
  const quantity = parseMoney(text(formData, "quantity"));
  const price = parseMoney(text(formData, "unit_price"), 4);

  const fields: Record<string, string> = {};
  if (!itemId) fields.item_id = "Elige un item del catálogo.";
  if (quantity === null || quantity <= 0) fields.quantity = "Escribe una cantidad mayor a 0.";
  if (price === null) fields.unit_price = "Escribe el precio unitario sin IVA.";
  if (Object.keys(fields).length) return { fields };

  const orgId = await getOrgId(org);
  if (!orgId) return { error: "No encontramos la organización." };

  const supabase = await createClient();
  const { error } = await supabase.from("contract_items").insert({
    organization_id: orgId,
    contract_id: contractId,
    item_id: itemId,
    quantity,
    unit_price: price,
    vat_rate: vatRate,
  });
  if (error) {
    if (error.code === "23505") {
      return { fields: { item_id: "Ese item ya está en el contrato. Edita su cantidad o quítalo." } };
    }
    return { error: friendly(error) };
  }
  refresh(org, contractId);
}

export async function removeLine(org: string, contractId: string, lineId: string): Promise<LineState> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contract_items")
    .delete()
    .eq("id", lineId)
    .select("id");
  if (error) return { error: friendly(error) };
  if (!data?.length) return { error: "No tienes permiso para quitar esta línea." };
  refresh(org, contractId);
}

export async function setPhase(
  org: string,
  contractId: string,
  lineId: string,
  phase: string,
): Promise<LineState> {
  if (!(PHASE_ORDER as readonly string[]).includes(phase)) return { error: "Fase no válida." };

  const supabase = await createClient();
  const { data: line } = await supabase
    .from("contract_items")
    .select("quantity, received_qty")
    .eq("id", lineId)
    .maybeSingle();
  if (!line) return { error: "No encontramos la línea." };

  if (
    NEEDS_FULL_RECEIPT.includes(phase as Phase) &&
    Number(line.received_qty) < Number(line.quantity)
  ) {
    return {
      error: `Faltan unidades por recibir (${Number(line.received_qty)} de ${Number(line.quantity)}). Regístralas antes de pasar a esta fase.`,
    };
  }

  const { data, error } = await supabase
    .from("contract_items")
    .update({ phase })
    .eq("id", lineId)
    .select("id");
  if (error) return { error: friendly(error) };
  if (!data?.length) return { error: "No tienes permiso para cambiar la fase." };
  refresh(org, contractId);
}

export async function setReceived(
  org: string,
  contractId: string,
  lineId: string,
  raw: string,
): Promise<LineState> {
  const qty = parseMoney(raw);
  if (qty === null) return { error: "Escribe una cantidad válida." };

  const supabase = await createClient();
  const { data: line } = await supabase
    .from("contract_items")
    .select("quantity, phase")
    .eq("id", lineId)
    .maybeSingle();
  if (!line) return { error: "No encontramos la línea." };
  if (qty > Number(line.quantity)) {
    return { error: `No puedes recibir más de ${Number(line.quantity)} unidades.` };
  }

  // Recibir unidades mueve la línea a "Recibido"; volver a 0 la regresa a "Comprado".
  const idx = PHASE_ORDER.indexOf(line.phase as Phase);
  const patch: { received_qty: number; phase?: Phase } = { received_qty: qty };
  if (qty > 0 && idx < PHASE_ORDER.indexOf("received")) patch.phase = "received";
  if (qty === 0 && line.phase === "received") patch.phase = "purchased";

  const { data, error } = await supabase
    .from("contract_items")
    .update(patch)
    .eq("id", lineId)
    .select("id");
  if (error) return { error: friendly(error) };
  if (!data?.length) return { error: "No tienes permiso para registrar recepciones." };
  refresh(org, contractId);
}

export async function setContractStatus(
  org: string,
  contractId: string,
  status: string,
): Promise<LineState> {
  if (!(STATUS_ORDER as readonly string[]).includes(status)) return { error: "Estado no válido." };

  const supabase = await createClient();
  const { data: current } = await supabase
    .from("contracts")
    .select("status")
    .eq("id", contractId)
    .maybeSingle();
  if (!current) return { error: "No encontramos el contrato." };

  // Solo se avanza o retrocede un paso a la vez.
  const delta = STATUS_ORDER.indexOf(status as (typeof STATUS_ORDER)[number]) -
    STATUS_ORDER.indexOf(current.status as (typeof STATUS_ORDER)[number]);
  if (Math.abs(delta) !== 1) return { error: "El estado solo cambia un paso a la vez." };

  const { data, error } = await supabase
    .from("contracts")
    .update({ status })
    .eq("id", contractId)
    .select("id");
  if (error) return { error: friendly(error) };
  if (!data?.length) return { error: "No tienes permiso para cambiar el estado." };
  revalidatePath(`/${org}/contratos`);
  refresh(org, contractId);
}
