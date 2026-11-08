import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { PageLoading } from "@/components/page-loading";
import { ProfitTabs } from "@/components/profit-tabs";
import { PageSection, TABLE_TD as TD, TABLE_TH as TH } from "@/components/page-section";
import { getContract } from "@/lib/contract-data";
import { SCHEMA_MESSAGE, isSchemaError, logDbError } from "@/lib/db-error";
import { formatIso } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { contractProfit, lineProfit } from "@/lib/profit";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

type IdParams = Promise<{ org: string; id: string }>;

type Row = {
  id: string;
  n: number;
  list_id: string;
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
  const [contract, { data, error }, pRes, tRes, sRes, eRes] = await Promise.all([
    getContract(org, id),
    supabase.rpc("contract_profit_view", { p_contract_id: id }),
    supabase.from("purchases").select("id, number, supplier_id, purchased_on, status").eq("contract_id", id).order("purchased_on", { ascending: false }).limit(500),
    supabase.from("purchase_totals").select("purchase_id, subtotal_cents, vat_cents").eq("contract_id", id).limit(500),
    supabase.from("suppliers").select("id, name"),
    supabase.from("contract_expenses").select("id, spent_on, concept, payee, amount_cents").eq("contract_id", id).order("spent_on", { ascending: false }).limit(500),
  ]);
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
  const supplier = new Map(((sRes.data ?? []) as { id: string; name: string }[]).map((x) => [x.id, x.name]));
  const totals = new Map(((tRes.data ?? []) as { purchase_id: string; subtotal_cents: number; vat_cents: number }[]).map((t) => [t.purchase_id, t]));
  const purchases = (pRes.data ?? []) as { id: string; number: string | null; supplier_id: string | null; purchased_on: string; status: string }[];
  const expenses = (eRes.data ?? []) as { id: string; spent_on: string; concept: string; payee: string; amount_cents: number }[];
  const invoiced = purchases.reduce((a, p) => a + Number(totals.get(p.id)?.subtotal_cents ?? 0), 0);
  const base = `/${org}/contratos/${id}`;
  // Items agrupados por lista, con la utilidad de cada una.
  const groups = new Map<string, { name: string; rows: typeof rows }>();
  for (const r of rows) {
    const g = groups.get(r.list_id) ?? { name: r.list_name, rows: [] };
    g.rows.push(r);
    groups.set(r.list_id, g);
  }
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

      <ProfitTabs
        summary={(
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
        )}
        tabs={[
          { key: "facturas", label: "Facturas", count: purchases.length, figures: [{ label: "Facturas", value: String(purchases.length) }, { label: "Total s/IVA", value: formatCents(invoiced) }], panel: (
      <PageSection className="p-0">
        {purchases.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">Aún no hay facturas de compra.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-strong">
                <tr className="border-b">
                  <th scope="col" className={TH}>Factura</th>
                  <th scope="col" className={TH}>Proveedor</th>
                  <th scope="col" className={TH}>Fecha</th>
                  <th scope="col" className={`${TH} text-right`}>Subtotal</th>
                  <th scope="col" className={`${TH} text-right`}>IVA</th>
                </tr>
              </thead>
              <tbody>
                {purchases.map((p) => {
                  const t = totals.get(p.id);
                  const href = `${base}/compras/${p.id}${p.status === "draft" ? "/editar" : ""}`;
                  return (
                    <tr key={p.id} className="relative border-b last:border-b-0 hover:bg-accent/40">
                      <td className={TD}>
                        <Link href={href} className="font-mono underline-offset-4 after:absolute after:inset-0 hover:underline" title="Ajustar en Compras">{p.number ?? "Sin número"}</Link>
                        {p.status === "draft" && <span className="ml-2 text-xs text-muted-foreground">Borrador</span>}
                      </td>
                      <td className={TD}>{p.supplier_id ? (supplier.get(p.supplier_id) ?? "—") : "—"}</td>
                      <td className={`${TD} whitespace-nowrap`}>{formatIso(p.purchased_on)}</td>
                      <td className={`${TD} num text-right`}>{t ? formatCents(Number(t.subtotal_cents)) : "—"}</td>
                      <td className={`${TD} num text-right`}>{t ? formatCents(Number(t.vat_cents)) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </PageSection>
          ) },
          { key: "gastos", label: "Gastos", count: expenses.length, figures: [{ label: "Gastos", value: String(expenses.length) }, { label: "Total", value: formatCents(sum.expenses) }], panel: (
      <PageSection className="p-0">
        {expenses.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">Aún no hay gastos registrados.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-strong">
                <tr className="border-b">
                  <th scope="col" className={TH}>Concepto</th>
                  <th scope="col" className={TH}>Pagado a</th>
                  <th scope="col" className={TH}>Fecha</th>
                  <th scope="col" className={`${TH} text-right`}>Monto</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((e) => (
                  <tr key={e.id} className="relative border-b last:border-b-0 hover:bg-accent/40">
                    <td className={TD}>
                      <Link href={`${base}/gastos?${new URLSearchParams({ q: e.concept })}`} className="underline-offset-4 after:absolute after:inset-0 hover:underline" title="Ajustar en Gastos">{e.concept}</Link>
                    </td>
                    <td className={TD}>{e.payee || "—"}</td>
                    <td className={`${TD} whitespace-nowrap`}>{formatIso(e.spent_on)}</td>
                    <td className={`${TD} num text-right`}>{formatCents(Number(e.amount_cents))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PageSection>
          ) },
          ...[...groups.entries()].map(([listId, g]) => {
          const gs = contractProfit(g.rows, 0);
          return {
            key: listId,
            list: true,
            label: g.name,
            count: g.rows.length,
            figures: [
              { label: g.rows.length === 1 ? "Línea" : "Líneas", value: String(g.rows.length) },
              { label: "Utilidad de la lista", value: formatCents(gs.itemsProfit), ...(gs.itemsProfit < 0 ? { tone: "warn" as const } : {}) },
            ],
            panel: (
            <PageSection className="p-0">
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
                    {g.rows.map((r) => {
                      const p = lineProfit(r);
                      const done = p.kind === "ok" || p.kind === "partial";
                      const fix = `${base}/abastecimiento?${new URLSearchParams({ lista: r.list_id, q: r.part_number || r.description })}`;
                      return (
                        <tr key={r.id} className="relative border-b last:border-b-0 hover:bg-accent/40">
                          <td className={cn(TD, "min-w-56")}>
                            <Link href={fix} className="underline-offset-4 after:absolute after:inset-0 hover:underline" title="Ajustar en Abastecimiento">{r.description}</Link>
                            {r.part_number && <p className="font-mono text-xs text-muted-foreground">{r.part_number}</p>}
                          </td>
                          <td className={`${TD} num whitespace-nowrap text-right`}>{Number(r.quantity)} {r.unit}</td>
                          <td className={`${TD} num whitespace-nowrap text-right`}>{r.referenceCents === null ? "—" : formatCents(r.referenceCents)}</td>
                          <td className={`${TD} num whitespace-nowrap text-right`}>{r.sources > 0 ? formatCents(r.costCents) : "—"}</td>
                          <td className={cn(TD, "num whitespace-nowrap text-right font-medium", done && tone(p.profitCents))}>
                            {done ? formatCents(p.profitCents) : <span className="text-xs font-normal text-muted-foreground">{p.kind === "none" ? "Sin precio ref." : "Sin compra"}</span>}
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
            </PageSection>
            ),
          };
        }),
        ]}
      />
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
