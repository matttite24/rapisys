import type { NextRequest } from "next/server";
import { parseBillingColumns } from "@/lib/billing-columns";
import { buildBillingWorkbook, type BillingExcelLine } from "@/lib/billing-excel";
import { getContract } from "@/lib/contract-data";
import { formatIso } from "@/lib/dates";
import { assetsForLines } from "@/lib/line-assets";
import { createClient } from "@/lib/supabase/server";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const PAGE = 200;

type Raw = {
  id: string; description: string; part_number: string | null; quantity: number; unit: string; reference_cents: number | null;
  cost_cents: number; sources: number; unknown: number; margin_override: number | null; excluded: boolean;
};

// Descarga el reporte de cobro de una entrega (ya revisada) en Excel: todas sus líneas, con los ajustes de margen.
export async function GET(req: NextRequest, ctx: RouteContext<"/[org]/contratos/[id]/revision/entrega/[deliveryId]/excel">) {
  const { org, id, deliveryId } = await ctx.params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) return new Response("No autorizado", { status: 401 });

  const found = await getContract(org, id);
  if (!found) return new Response("No encontramos el contrato", { status: 404 });
  const { c } = found;

  const { data: d } = await supabase
    .from("deliveries")
    .select("id, number, delivered_on, received_by, list_id, voided_at")
    .eq("id", deliveryId)
    .eq("contract_id", id)
    .maybeSingle();
  if (!d) return new Response("No encontramos la entrega", { status: 404 });

  const [list, client] = await Promise.all([
    supabase.from("contract_lists").select("name").eq("id", d.list_id).maybeSingle(),
    supabase.from("clients").select("name").eq("id", c.client_id).maybeSingle(),
  ]);

  // Todas las líneas, de a 200 (es el máximo que devuelve la función).
  const lines: BillingExcelLine[] = [];
  const lineIds: string[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase.rpc("contract_billing_lines", { p_delivery_id: deliveryId, p_offset: offset, p_limit: PAGE });
    if (error || !data) return new Response("No se pudo preparar el reporte", { status: 500 });
    const rows = (data as { lines: Raw[] }).lines;
    for (const r of rows) {
      lineIds.push(r.id);
      lines.push({
        description: r.description, part_number: r.part_number, quantity: Number(r.quantity), unit: r.unit,
        referenceCents: r.reference_cents === null ? null : Number(r.reference_cents),
        costCents: Number(r.cost_cents), sources: Number(r.sources), unknown: Number(r.unknown),
        marginOverride: r.margin_override === null ? null : Number(r.margin_override), excluded: r.excluded,
      });
    }
    if (rows.length < PAGE) break;
  }

  // Activos relacionados con cada línea: los del producto asignado (item → activos compatibles).
  const assetsByLine = await assetsForLines(supabase, lineIds);
  lines.forEach((line, i) => { line.assets = assetsByLine.get(lineIds[i]) ?? []; });

  const code = `ENT-${String(d.number).padStart(3, "0")}`;
  const file = await buildBillingWorkbook({
    contract: { code: c.code as string, name: c.name as string, client: client.data?.name ?? "—" },
    delivery: {
      code, date: formatIso(d.delivered_on), dateIso: d.delivered_on as string, list: ((list.data?.name as string | undefined) ?? "—").split(" · ")[0], receivedBy: d.received_by, voided: d.voided_at !== null,
    },
    lines,
    // Columnas elegidas en el modal de exportación (?cols=a,b,c); sin indicar, todas.
    columns: parseBillingColumns(req.nextUrl.searchParams.get("cols")),
  });
  const name = `reporte-de-cobro-${code}-${String(c.code).replace(/[^\w-]+/g, "_")}.xlsx`;
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": XLSX,
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
