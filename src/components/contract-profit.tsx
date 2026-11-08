import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { PageLoading } from "@/components/page-loading";
import { PageSection, TABLE_TD as TD, TABLE_TH as TH } from "@/components/page-section";
import { getContract } from "@/lib/contract-data";
import { SCHEMA_MESSAGE, isSchemaError, logDbError } from "@/lib/db-error";
import { formatCents } from "@/lib/money";
import { contractProfit, lineProfit } from "@/lib/profit";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

type IdParams = Promise<{ org: string; id: string }>;

type Row = {
  id: string;
  n: number;
  list_name: string;
  part_number: string | null;
  description: string;
  quantity: number;
  unit: string;
  reference_cents: number | null;
  cost_cents: number;
  unknown: number;
  sources: number;
};

const pct = (n: number | null) => (n === null ? "—" : `${n.toFixed(1).replace(".", ",")}%`);
const tone = (cents: number) => (cents < 0 ? "text-destructive" : "");

async function Profit({ params }: { params: IdParams }) {
  await connection();
  const [{ org, id }, supabase] = await Promise.all([params, createClient()]);
  const [contract, { data, error }] = await Promise.all([getContract(org, id), supabase.rpc("contract_profit_view", { p_contract_id: id })]);
  if (!contract) notFound();
  if (error || !data) {
    if (error) logDbError("revisión de rentabilidad", error);
    return (
      <div role="alert" className="p-6 text-sm text-destructive">
        {error && isSchemaError(error) ? SCHEMA_MESSAGE : "No se pudo calcular la rentabilidad. Actualiza la sección para reintentar."}
      </div>
    );
  }
  const view = data as { contract_cents: number; expenses_cents: number; lines: Row[] };
  const rows = view.lines.map((r) => ({
    ...r,
    referenceCents: r.reference_cents === null ? null : Number(r.reference_cents),
    costCents: Number(r.cost_cents),
    unknown: Number(r.unknown),
    sources: Number(r.sources),
  }));
  const sum = contractProfit(rows, Number(view.expenses_cents));

  const figures: { label: string; value: string; note?: string; strong?: boolean; negative?: boolean }[] = [
    { label: "Precio ref. (comprado)", value: formatCents(sum.reference), note: `Contrato: ${formatCents(Number(view.contract_cents))}` },
    { label: "Costo de compra", value: formatCents(sum.cost) },
    { label: "Utilidad de items", value: formatCents(sum.itemsProfit), negative: sum.itemsProfit < 0 },
    { label: "Gastos", value: formatCents(sum.expenses) },
    { label: "Utilidad del contrato", value: formatCents(sum.profit), note: `Margen ${pct(sum.marginPct)}`, strong: true, negative: sum.profit < 0 },
  ];

  return (
    <>
      <PageSection label="Revisión de rentabilidad" meta="Sin IVA" className="p-0">
        <dl className="grid divide-x divide-y border-b sm:grid-cols-2 lg:grid-cols-5 lg:divide-y-0 [&>div]:p-4">
          {figures.map((f) => (
            <div key={f.label} className={cn("flex min-w-0 flex-col gap-1", f.strong && "bg-surface-strong")}>
              <dt className="caps text-muted-foreground">{f.label}</dt>
              <dd className={cn("num font-mono text-xl", f.strong && "font-semibold", f.negative && "text-destructive")}>{f.value}</dd>
              {f.note && <p className="text-xs text-muted-foreground">{f.note}</p>}
            </div>
          ))}
        </dl>
        <p className="px-4 py-3 text-xs text-muted-foreground">
          Utilidad de un item = precio ref. − costo de compra. Utilidad del contrato = suma de las utilidades − gastos.
          {sum.pending > 0 && ` ${sum.pending} sin compra todavía no cuentan.`}
          {sum.noPrice > 0 && ` ${sum.noPrice} sin precio ref. no se pueden calcular.`}
          {sum.partial > 0 && ` ${sum.partial} tienen costo incompleto.`}
        </p>
      </PageSection>

      <PageSection label="Por item" meta={`${rows.length} ${rows.length === 1 ? "línea" : "líneas"}`} className="p-0">
        {rows.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">Este contrato aún no tiene items en sus listas.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-strong">
                <tr className="border-b">
                  <th scope="col" className={TH}>Item</th>
                  <th scope="col" className={`${TH} text-right`}>Cant.</th>
                  <th scope="col" className={`${TH} text-right`}>Precio ref.</th>
                  <th scope="col" className={`${TH} text-right`}>Costo</th>
                  <th scope="col" className={`${TH} text-right`}>Utilidad</th>
                  <th scope="col" className={`${TH} text-right`}>Margen</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const p = lineProfit(r);
                  const done = p.kind === "ok" || p.kind === "partial";
                  return (
                    <tr key={r.id} className="border-b last:border-b-0 hover:bg-accent/40">
                      <td className={cn(TD, "min-w-56")}>
                        <p>{r.description}</p>
                        <p className="font-mono text-xs text-muted-foreground">
                          {[r.list_name, r.part_number].filter(Boolean).join(" · ")}
                        </p>
                      </td>
                      <td className={`${TD} num whitespace-nowrap text-right`}>
                        {Number(r.quantity)} {r.unit}
                      </td>
                      <td className={`${TD} num whitespace-nowrap text-right`}>{r.referenceCents === null ? "—" : formatCents(r.referenceCents)}</td>
                      <td className={`${TD} num whitespace-nowrap text-right`}>{r.sources > 0 ? formatCents(r.costCents) : "—"}</td>
                      <td className={cn(TD, "num whitespace-nowrap text-right font-medium", done && tone(p.profitCents))}>
                        {done ? formatCents(p.profitCents) : p.kind === "none" ? <span className="text-xs font-normal text-muted-foreground">Sin precio ref.</span> : <span className="text-xs font-normal text-muted-foreground">Sin compra</span>}
                        {p.kind === "partial" && <span className="block text-xs font-normal text-muted-foreground">Costo incompleto</span>}
                      </td>
                      <td className={cn(TD, "num whitespace-nowrap text-right", done && p.marginPct !== null && p.marginPct < 0 && "text-destructive")}>
                        {done ? pct(p.marginPct) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </PageSection>
    </>
  );
}

export function ContractProfitPage({ params }: { params: IdParams }) {
  return (
    <Suspense fallback={<PageLoading />}>
      <Profit params={params} />
    </Suspense>
  );
}
