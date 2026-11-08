"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { getOrgId } from "@/lib/orgs";
import { createClient } from "@/lib/supabase/server";
import { parseExpense, EXPENSE_CATEGORIES, EXPENSE_PAGE_SIZE, type Expense, type ExpensePage } from "@/lib/expenses";
import { getContract } from "@/lib/contract-data";
import { cleanSearch } from "@/lib/search";
import { SCHEMA_MESSAGE, isSchemaError, logDbError, type DbError } from "@/lib/db-error";

export type ExpenseResult = { error?: string; fields?: Record<string, string>; ok?: boolean };
function friendly(error: DbError) {
  if (error.message === "expense_not_found") return "No encontramos este documento. Actualiza la sección.";
  if (error.code === "42501") return "No tienes permiso para modificar gastos.";
  if (isSchemaError(error)) return SCHEMA_MESSAGE;
  logDbError("gastos", error);
  return "No se pudo guardar el cambio. Inténtalo de nuevo.";
}
export async function saveExpense(org: string, contractId: string, id: string | null, form: FormData): Promise<ExpenseResult> {
  await requireUser();
  const parsed = parseExpense(form);
  if (!parsed.values) return { fields: parsed.fields };
  const orgId = await getOrgId(org);
  if (!orgId) return { error: "Organización no disponible." };
  const db = await createClient();
  const { lines, ...header } = parsed.values;
  const result = await db.rpc("contract_expense_save", {
    p_org_id: orgId, p_contract_id: contractId, p_id: id, p_header: header, p_lines: lines,
  });
  if (result.error) return { error: friendly(result.error) };
  if (!result.data) return { error: "No encontramos este gasto. Actualiza la sección." };
  revalidatePath(`/${org}/contratos/${contractId}`, "layout");
  return { ok: true };
}
export async function deleteExpense(org: string, contractId: string, id: string): Promise<ExpenseResult> {
  await requireUser();
  const orgId = await getOrgId(org);
  if (!orgId) return { error: "Organización no disponible." };
  const db = await createClient();
  const { data, error } = await db.from("contract_expenses").delete().eq("id", id).eq("contract_id", contractId).eq("organization_id", orgId).select("id").maybeSingle();
  if (error) return { error: friendly(error) };
  if (!data) return { error: "No encontramos este gasto. Actualiza la sección." };
  revalidatePath(`/${org}/contratos/${contractId}`, "layout");
  return { ok: true };
}

// Lee una categoría sin dejar la interfaz esperando a una transición del router.
export async function loadExpenses(org: string, contractId: string, q: string, category: string, page = 1): Promise<{ view?: ExpensePage; error?: string }> {
  await requireUser();
  const selected = Object.hasOwn(EXPENSE_CATEGORIES, category) ? category : "";
  const currentPage = Number.isSafeInteger(page) && page > 0 && page <= 100000 ? page : 1;
  const db = await createClient();
  const [contract, { data, error }] = await Promise.all([
    getContract(org, contractId),
    db.rpc("contract_expenses_view", { p_contract_id: contractId, p_q: cleanSearch(q).slice(0, 200), p_category: selected,
      p_offset: (currentPage - 1) * EXPENSE_PAGE_SIZE, p_limit: EXPENSE_PAGE_SIZE }),
  ]);
  if (!contract) return { error: "No encontramos el contrato." };
  if (error) return { error: friendly(error) };
  const result = data as { version?: number; rows: Expense[]; count: number; total_cents: number; all_count: number; all_total_cents: number } | null;
  if (!result || result.version !== 2) return { error: SCHEMA_MESSAGE };
  return { view: {
    rows: result.rows.map((row) => ({ ...row, amount_cents: Number(row.amount_cents), lines: row.lines.map((line) => ({ ...line, amount_cents: Number(line.amount_cents) })) })),
    count: Number(result.count), totalCents: Number(result.total_cents), allCount: Number(result.all_count), allTotalCents: Number(result.all_total_cents),
    category: selected, page: currentPage,
  } };
}
