"use server";

import { cleanSearch } from "@/lib/search";
import { getOrgId } from "@/lib/orgs";
import { createClient } from "@/lib/supabase/server";

export type PartyOption = { id: string; name: string; ruc: string | null };

// Busca clientes o responsables por nombre o RUC (hasta 15). Reemplaza al selector que cargaba todos los registros.
export async function searchParties(org: string, kind: "client" | "manager", q: string): Promise<PartyOption[]> {
  const orgId = await getOrgId(org);
  if (!orgId) return [];
  const term = cleanSearch(q).slice(0, 100);
  const supabase = await createClient();
  let query = supabase
    .from(kind === "client" ? "clients" : "contract_managers")
    .select("id, name, ruc")
    .eq("organization_id", orgId)
    .order("name")
    .limit(15);
  if (term) query = query.or(`name.ilike.%${term}%,ruc.ilike.%${term}%`);
  const { data } = await query;
  return (data ?? []) as PartyOption[];
}
