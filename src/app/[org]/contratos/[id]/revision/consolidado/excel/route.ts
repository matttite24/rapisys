import type { NextRequest } from "next/server";
import { parseBillingColumns } from "@/lib/billing-columns";
import { buildConsolidatedWorkbook, type BillingExcelLine, type ConsolidatedDelivery } from "@/lib/billing-excel";
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

// Descarga el reporte de cobro consolidado: todas las entregas vigentes (sin anuladas), hojas «Resumen» y «Detalle».
export async function GET(req: NextRequest, ctx: RouteContext<"/[org]/contratos/[id]/revision/consolidado/excel">) {
  const { org, id } = await ctx.params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) return new Response("No autorizado", { status: 401 });

  const found = await getContract(org, id);
  if (!found) return new Response("No encontramos el proceso", { status: 404 });
  const { c } = found;

  const [{ data: ds, error }, client, lists] = await Promise.all([
    supabase.from("deliveries").select("id, number, delivered_on, received_by, list_id").eq("contract_id", id).is("voided_at", null).order("number").limit(500),
    supabase.from("clients").select("name").eq("id", c.client_id).maybeSingle(),
    supabase.from("contract_lists").select("id, name").eq("contract_id", id),
  ]);
  if (error) return new Response("No se pudo preparar el reporte", { status: 500 });
  const listName = new Map(((lists.data ?? []) as { id: string; name: string }[]).map((l) => [l.id, l.name]));

  const deliveries: ConsolidatedDelivery[] = [];
  const allIds: string[] = [];
  const lineRefs: { lineId: string; line: BillingExcelLine }[] = [];
  for (const d of (ds ?? []) as { id: string; number: number; delivered_on: string; received_by: string | null; list_id: string }[]) {
    const lines: BillingExcelLine[] = [];
    for (let offset = 0; ; offset += PAGE) {
      const { data, error: e } = await supabase.rpc("contract_billing_lines", { p_delivery_id: d.id, p_offset: offset, p_limit: PAGE });
      if (e || !data) return new Response("No se pudo preparar el reporte", { status: 500 });
      const rows = (data as { lines: Raw[] }).lines;
      for (const r of rows) {
        const line: BillingExcelLine = {
          description: r.description, part_number: r.part_number, quantity: Number(r.quantity), unit: r.unit,
          referenceCents: r.reference_cents === null ? null : Number(r.reference_cents),
          costCents: Number(r.cost_cents), sources: Number(r.sources), unknown: Number(r.unknown),
          marginOverride: r.margin_override === null ? null : Number(r.margin_override), excluded: r.excluded,
        };
        lines.push(line);
        allIds.push(r.id);
        lineRefs.push({ lineId: r.id, line });
      }
      if (rows.length < PAGE) break;
    }
    deliveries.push({
      code: `ENT-${String(d.number).padStart(3, "0")}`, date: formatIso(d.delivered_on), dateIso: d.delivered_on,
      list: (listName.get(d.list_id) ?? "—").split(" · ")[0], receivedBy: d.received_by, lines,
    });
  }

  // Activo relacionado con el producto de cada línea.
  const assets = await assetsForLines(supabase, allIds);
  for (const { lineId, line } of lineRefs) line.assets = assets.get(lineId) ?? [];

  const file = await buildConsolidatedWorkbook({
    contract: { code: c.code as string, name: c.name as string, client: client.data?.name ?? "—" },
    deliveries,
    columns: parseBillingColumns(req.nextUrl.searchParams.get("cols"), true),
  });
  const name = `reporte-de-cobro-consolidado-${String(c.code).replace(/[^\w-]+/g, "_")}.xlsx`;
  return new Response(new Uint8Array(file), {
    headers: { "Content-Type": XLSX, "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" },
  });
}
