import type { SupabaseClient } from "@supabase/supabase-js";

// Por qué un contrato en ejecución todavía no puede finalizar (null = puede). Una línea cuenta como
// completa cuando ya salió en una entrega: las entregas son siempre de la línea entera.
export async function finishBlocker(supabase: SupabaseClient, contractId: string): Promise<string | null> {
  const [items, delivered] = await Promise.all([
    supabase.from("contract_items").select("id", { count: "exact", head: true }).eq("contract_id", contractId),
    supabase
      .from("delivery_lines")
      .select("id, deliveries!inner(contract_id)", { count: "exact", head: true })
      .eq("deliveries.contract_id", contractId),
  ]);
  const total = items.count ?? 0;
  const done = delivered.count ?? 0;
  if (total === 0) return "El contrato todavía no tiene items.";
  if (done < total) {
    const left = total - done;
    return `Falta entregar ${left} ${left === 1 ? "línea" : "líneas"} de ${total}.`;
  }
  return null;
}
