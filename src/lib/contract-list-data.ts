"use server";

import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { contractFilter, CONTRACT_FILTERS, type ContractListView, type ContractRow } from "@/lib/contract-filters";
import { pageRange } from "@/lib/pagination";
import { cleanSearch } from "@/lib/search";
import { isSchemaError, logDbError, SCHEMA_MESSAGE } from "@/lib/db-error";

export async function loadContractList(org: string, search: string, selected: string, requestedPage = 1): Promise<{ view?: ContractListView; error?: string }> {
  await requireUser();
  const filter = contractFilter(selected);
  const q = cleanSearch(search).slice(0, 200);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 && requestedPage <= 100000 ? requestedPage : 1;
  const db = await createClient();
  let query = db.from("contracts").select(
    "id, code, name, kind, total_cents, term_days, start_date, status, clients(name), contract_managers(name), organizations!inner(slug)", { count: "exact" },
  ).eq("organizations.slug", org).order("created_at", { ascending: false }).order("id", { ascending: false }).range(...pageRange(page));
  const statuses: readonly string[] = CONTRACT_FILTERS[filter].statuses;
  if (statuses.length) query = query.in("status", statuses);
  if (filter === "credito") query = query.eq("kind", "credit");
  if (q) query = query.or(`code.ilike.%${q}%,name.ilike.%${q}%`);
  const { data, count, error } = await query;
  if (error) { logDbError("listado de procesos", error); return { error: isSchemaError(error) ? SCHEMA_MESSAGE : "No se pudieron cargar los procesos. Inténtalo de nuevo." }; }
  const rows = ((data ?? []) as unknown as ContractRow[]).map((row) => ({ ...row, total_cents: row.total_cents === null ? null : Number(row.total_cents), term_days: row.term_days === null ? null : Number(row.term_days) }));
  return { view: { rows, total: count ?? 0, filter, page, q } };
}
