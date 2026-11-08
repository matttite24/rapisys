import { Suspense } from "react";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { ExpenseBoard } from "@/components/expense-board";
import { PageLoading } from "@/components/page-loading";
import { getContract } from "@/lib/contract-data";
import { createClient } from "@/lib/supabase/server";
import { EXPENSE_CATEGORIES, EXPENSE_PAGE_SIZE, type Expense } from "@/lib/expenses";
import { cleanSearch } from "@/lib/search";
import { pageCount, readPage } from "@/lib/pagination";
import { SCHEMA_MESSAGE, isSchemaError, logDbError } from "@/lib/db-error";

type Props = PageProps<"/[org]/contratos/[id]/gastos">;
const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

async function Expenses({ params, searchParams }: Props) {
  await connection();
  const [{ org, id }, search] = await Promise.all([params, searchParams]);
  const q = cleanSearch(first(search.q) ?? "").slice(0, 200);
  const rawCategory = first(search.categoria) ?? "";
  const category = Object.hasOwn(EXPENSE_CATEGORIES, rawCategory) ? rawCategory : "";
  const page = readPage(search);
  const db = await createClient();
  const [contract, { data, error }] = await Promise.all([
    getContract(org, id),
    db.rpc("contract_expenses_view", { p_contract_id: id, p_q: q, p_category: category, p_offset: (page - 1) * EXPENSE_PAGE_SIZE, p_limit: EXPENSE_PAGE_SIZE }),
  ]);
  if (!contract) notFound();
  if (error) {
    logDbError("listado de gastos", error);
    return <div role="alert" className="p-6 text-sm text-destructive">{isSchemaError(error) ? SCHEMA_MESSAGE : "No se pudieron cargar los gastos. Actualiza la sección para reintentar."}</div>;
  }
  const view = data as { version?: number; rows: Expense[]; count: number; total_cents: number; all_count: number; all_total_cents: number } | null;
  if (!view) return <div role="alert" className="p-6 text-sm text-destructive">No se pudieron cargar los gastos.</div>;
  if (view.version !== 2) return <div role="alert" className="p-6 text-sm text-destructive">{SCHEMA_MESSAGE}</div>;
  const count = Number(view.count);
  if (page > pageCount(count, EXPENSE_PAGE_SIZE)) {
    const next = new URLSearchParams({ ...(q ? { q } : {}), ...(category ? { categoria: category } : {}), page: String(pageCount(count, EXPENSE_PAGE_SIZE)) });
    redirect(`/${org}/contratos/${id}/gastos?${next}`);
  }
  return <ExpenseBoard org={org} contractId={id} rows={view.rows.map((row) => ({ ...row, amount_cents: Number(row.amount_cents), lines: row.lines.map((line) => ({ ...line, amount_cents: Number(line.amount_cents) })) }))}
    count={count} totalCents={Number(view.total_cents)} allCount={Number(view.all_count)} allTotalCents={Number(view.all_total_cents)}
    q={q} category={category} page={page} />;
}
export default function Page(props: Props) {
  return <Suspense fallback={<PageLoading />}><Expenses {...props} /></Suspense>;
}
