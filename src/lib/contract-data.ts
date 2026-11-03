import { cache } from "react";
import { getOrgId } from "@/lib/orgs";
import { createClient } from "@/lib/supabase/server";

// Contrato de la URL (RLS: solo miembros). cache() lo comparte entre el layout y la página.
export const getContract = cache(async (org: string, id: string) => {
  const orgId = await getOrgId(org);
  if (!orgId) return null;
  const supabase = await createClient();
  const { data: c } = await supabase
    .from("contracts")
    .select("*")
    .eq("id", id)
    .eq("organization_id", orgId)
    .maybeSingle();
  return c ? { orgId, c } : null;
});
