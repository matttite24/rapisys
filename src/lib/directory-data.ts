"use server";

import { requireUser } from "@/lib/auth";
import { getOrgId } from "@/lib/orgs";
import { createClient } from "@/lib/supabase/server";
import { cleanSearch } from "@/lib/search";
import { pageRange } from "@/lib/pagination";
import { isSchemaError, logDbError, SCHEMA_MESSAGE } from "@/lib/db-error";
import { directoryScope, type DirectoryView } from "@/lib/directory";
import type { Party } from "@/lib/parties";

export async function loadDirectory(org: string, selected: string, search: string, requestedPage = 1): Promise<{ view?: DirectoryView; error?: string }> {
  await requireUser();
  const orgId = await getOrgId(org);
  if (!orgId) return { error: "Organización no disponible." };
  const scope = directoryScope(selected), q = cleanSearch(search).slice(0, 200);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 && requestedPage <= 100000 ? requestedPage : 1;
  const managers = scope === "managers";
  const db = await createClient();
  let query = db.from(managers ? "contract_managers" : "clients").select(managers ? "id, name, ruc, address" : "id, name, ruc, address, client_type", { count: "exact" })
    .eq("organization_id", orgId).order("name").order("id").range(...pageRange(page));
  if (!managers && scope) query = query.eq("client_type", scope);
  if (q) query = query.or(`name.ilike.%${q}%,ruc.ilike.%${q}%,address.ilike.%${q}%`);
  const { data, count, error } = await query;
  if (error) { logDbError("directorio", error); return { error: isSchemaError(error) ? SCHEMA_MESSAGE : "No se pudo cargar el directorio. Inténtalo de nuevo." }; }
  return { view: { scope, q, page, total: count ?? 0, rows: (data ?? []) as unknown as Party[] } };
}
