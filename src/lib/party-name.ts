import { createClient } from "@/lib/supabase/server";

// Nombre de un cliente o responsable ya guardado (para mostrarlo al editar sin cargar la lista).
export async function partyName(orgId: string, kind: "client" | "manager", id: string): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase
    .from(kind === "client" ? "clients" : "contract_managers")
    .select("name")
    .eq("id", id)
    .eq("organization_id", orgId)
    .maybeSingle();
  return (data?.name as string | undefined) ?? "";
}
