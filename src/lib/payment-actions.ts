"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { SCHEMA_MESSAGE, isSchemaError, logDbError, type DbError } from "@/lib/db-error";
import { parseCents } from "@/lib/money";
import { getOrgId } from "@/lib/orgs";
import { isMovementKind, isPayMethod } from "@/lib/payments";
import { createClient } from "@/lib/supabase/server";

export type PaymentResult = { error?: string; fields?: Record<string, string>; ok?: boolean };

const text = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function friendly(error: DbError) {
  const m = error.message;
  if (error.code === "42501" || m === "forbidden") return "No tienes permiso para registrar pagos.";
  if (m === "over_paid") return "Eso supera el saldo de la factura: lo registrado no puede pasar de su total.";
  if (m === "over_advance") return "El monto supera lo que le queda disponible a ese anticipo.";
  if (m === "bad_advance") return "Ese anticipo no es de este proveedor y contrato.";
  if (m === "purchase_draft") return "La factura sigue en borrador: complétala primero.";
  if (error.code === "23503") return "No se puede eliminar: el anticipo ya se aplicó a una factura. Quita primero esa aplicación.";
  logDbError("pagos", error);
  return isSchemaError(error) ? SCHEMA_MESSAGE : "No se pudo guardar. Inténtalo de nuevo.";
}

const refresh = (org: string, contractId: string) => {
  revalidatePath(`/${org}/contratos/${contractId}`, "layout");
};

// Registra un movimiento dentro de una factura: pago, registro a crédito (con vencimiento) o aplicación de un anticipo.
export async function addPurchaseMovement(org: string, contractId: string, purchaseId: string, form: FormData): Promise<PaymentResult> {
  await requireUser();
  const kind = text(form, "kind");
  const amount = parseCents(text(form, "amount"));
  const date = text(form, "moved_on");
  const due = text(form, "due_on");
  const method = text(form, "method");
  const bank = text(form, "bank_account_id");
  const advance = text(form, "advance_id");

  const fields: Record<string, string> = {};
  if (!isMovementKind(kind)) return { error: "Elige el tipo de movimiento." };
  if (!amount.ok) fields.amount = amount.error;
  else if (amount.cents <= 0) fields.amount = "El monto debe ser mayor a 0.";
  if (!DATE.test(date)) fields.moved_on = "Elige la fecha.";
  if (kind === "credit" && !DATE.test(due)) fields.due_on = "Elige la fecha de vencimiento.";
  if (kind === "credit" && DATE.test(due) && DATE.test(date) && due < date) fields.due_on = "El vencimiento no puede ser anterior a la fecha.";
  if (kind === "payment" && !isPayMethod(method)) fields.method = "Elige cómo se pagó.";
  if (bank && !UUID.test(bank)) fields.bank_account_id = "Elige una cuenta de la lista.";
  if (kind === "advance" && !UUID.test(advance)) fields.advance_id = "Elige el anticipo que se aplica.";
  if (Object.keys(fields).length || !amount.ok) return { fields };

  const orgId = await getOrgId(org);
  if (!orgId) return { error: "No encontramos la organización." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("purchase_movement_add", {
    p_purchase_id: purchaseId,
    p_kind: kind,
    p_amount_cents: amount.cents,
    p_moved_on: date,
    p_due_on: kind === "credit" ? due : null,
    p_method: kind === "payment" ? method : null,
    p_bank_account_id: kind === "payment" && bank ? bank : null,
    p_advance_id: kind === "advance" ? advance : null,
    p_reference: text(form, "reference").slice(0, 100),
    p_notes: text(form, "notes").slice(0, 500),
  });
  if (error) return { error: friendly(error) };
  refresh(org, contractId);
  return { ok: true };
}

export async function deletePurchaseMovement(org: string, contractId: string, movementId: string): Promise<PaymentResult> {
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase.from("purchase_payments").delete().eq("id", movementId).select("id");
  if (error) return { error: friendly(error) };
  if (!data?.length) return { error: "No tienes permiso o el movimiento ya no existe." };
  refresh(org, contractId);
  return { ok: true };
}

// Anticipo entregado a un proveedor (sin factura). Se aplica después, desde cada factura.
export async function addSupplierAdvance(org: string, contractId: string, form: FormData): Promise<PaymentResult> {
  await requireUser();
  const supplier = text(form, "supplier_id");
  const amount = parseCents(text(form, "amount"));
  const date = text(form, "paid_on");
  const method = text(form, "method");
  const bank = text(form, "bank_account_id");

  const fields: Record<string, string> = {};
  if (!UUID.test(supplier)) fields.supplier_id = "Elige el proveedor.";
  if (!amount.ok) fields.amount = amount.error;
  else if (amount.cents <= 0) fields.amount = "El monto debe ser mayor a 0.";
  if (!DATE.test(date)) fields.paid_on = "Elige la fecha.";
  if (!isPayMethod(method)) fields.method = "Elige cómo se pagó.";
  if (bank && !UUID.test(bank)) fields.bank_account_id = "Elige una cuenta de la lista.";
  if (Object.keys(fields).length || !amount.ok) return { fields };

  const orgId = await getOrgId(org);
  if (!orgId) return { error: "No encontramos la organización." };
  const supabase = await createClient();
  const { data: contract } = await supabase.from("contracts").select("id").eq("id", contractId).eq("organization_id", orgId).maybeSingle();
  if (!contract) return { error: "No encontramos el contrato." };
  const { error } = await supabase.from("supplier_advances").insert({
    organization_id: orgId,
    contract_id: contractId,
    supplier_id: supplier,
    paid_on: date,
    amount_cents: amount.cents,
    method,
    bank_account_id: bank || null,
    reference: text(form, "reference").slice(0, 100),
    notes: text(form, "notes").slice(0, 500),
  });
  if (error) return { error: friendly(error) };
  refresh(org, contractId);
  return { ok: true };
}

export async function deleteSupplierAdvance(org: string, contractId: string, advanceId: string): Promise<PaymentResult> {
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase.from("supplier_advances").delete().eq("id", advanceId).eq("contract_id", contractId).select("id");
  if (error) return { error: friendly(error) };
  if (!data?.length) return { error: "No tienes permiso o el anticipo ya no existe." };
  refresh(org, contractId);
  return { ok: true };
}
