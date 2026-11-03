import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

// Contrato de la URL (RLS: solo miembros). Una sola consulta: el slug de la
// organización se filtra con un join. cache() lo comparte entre el layout y la página.
export const getContract = cache(async (org: string, id: string) => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("contracts")
    .select("*, organizations!inner(slug)")
    .eq("id", id)
    .eq("organizations.slug", org)
    .maybeSingle();
  if (!data) return null;
  const { organizations: _org, ...c } = data;
  void _org;
  return { orgId: c.organization_id as string, c };
});
