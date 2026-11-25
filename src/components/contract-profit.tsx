import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { PageLoading } from "@/components/page-loading";
import { ConsolidatedExport } from "@/components/consolidated-export";
import { BillingTable, type BillingLine, type BillingServerTotals } from "@/components/billing-table";
import { PageSection } from "@/components/page-section";
import { ProfitTabs, type ProfitTab } from "@/components/profit-tabs";
import type { PageFigure } from "@/components/page-shortcuts";
import { Badge } from "@/components/ui/badge";
import { paymentState, type MovementKind, type PaymentState } from "@/lib/payments";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getContract } from "@/lib/contract-data";
import { formatIso, todayEcuador } from "@/lib/dates";
import { SCHEMA_MESSAGE, isSchemaError, logDbError } from "@/lib/db-error";
import { formatCents } from "@/lib/money";
import { readPage } from "@/lib/pagination";
import { summarizeProfit } from "@/lib/profit";
import { createClient } from "@/lib/supabase/server";
import { supplierNames } from "@/lib/supplier-names";
import { cn } from "@/lib/utils";

type IdParams = Promise<{ org: string; id: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;
type Supabase = Awaited<ReturnType<typeof createClient>>;

// Líneas por página de una lista.
const LINES_PAGE = 50;

type ListSummary = {
  id: string;
  name: string;
  lines: number;
  reference_cents: number;
  cost_cents: number;
  no_price: number;
  pending: number;
  partial: number;
};
type DeliverySummary = ListSummary & { number: number; delivered_on: string; list_id: string; list_name: string };
type Summary = { contract_cents: number | null; expenses_cents: number; lists: ListSummary[] };

type Row = {
  id: string;
  part_number: string | null;
  description: string;
  quantity: number;
  unit: string;
  reference_cents: number | null;
  cost_cents: number;
  unknown: number;
  sources: number;
};

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const pct = (n: number | null) => (n === null ? "—" : `${n.toFixed(1).replace(".", ",")}%`);
const totalsOf = (l: ListSummary) => ({
  reference: Number(l.reference_cents),
  cost: Number(l.cost_cents),
  pending: Number(l.pending),
  noPrice: Number(l.no_price),
  partial: Number(l.partial),
});

// Revisión de rentabilidad. Las cifras llegan sumadas por la base y solo se piden los datos de la pestaña abierta
// (una página de líneas de una lista, las facturas o los gastos), para que la pantalla no crezca con el proceso.
async function Profit({ params, searchParams }: { params: IdParams; searchParams: Search }) {
  await connection();
  const [{ org, id }, sp, supabase] = await Promise.all([params, searchParams, createClient()]);
  const [contract, summaryRes, navRes, deliveriesRes] = await Promise.all([
    getContract(org, id),
    supabase.rpc("contract_profit_summary", { p_contract_id: id }),
    supabase.rpc("contract_nav_counts", { p_contract_id: id }),
    supabase.rpc("contract_profit_deliveries", { p_contract_id: id }),
  ]);
  if (!contract) notFound();
  const credit = contract.c.kind === "credit";
  // Proceso a crédito: el valor final del proceso es la suma del valor final de cada entrega revisada.
  const billingRes = credit ? await supabase.rpc("contract_billing_totals", { p_contract_id: id }) : null;
  if (summaryRes.error || !summaryRes.data) {
    if (summaryRes.error) logDbError("revisión de rentabilidad", summaryRes.error);
    return (
      <div role="alert" className="p-6 text-sm text-destructive">
        {summaryRes.error && isSchemaError(summaryRes.error) ? SCHEMA_MESSAGE : "No se pudo calcular la rentabilidad. Actualiza la sección para reintentar."}
      </div>
    );
  }
  const summary = summaryRes.data as Summary;
  const nav = (navRes.data ?? {}) as { purchases?: number; expenses?: number };
  const base = `/${org}/contratos/${id}`;
  const billing = billingRes?.data as { cost_cents: number; final_cents: number; included: number; excluded: number; uncalculated: number } | null | undefined;
  const sum = credit && billing
    ? summarizeProfit([{ reference: Number(billing.final_cents), cost: Number(billing.cost_cents), pending: 0, noPrice: Number(billing.uncalculated), partial: 0 }], Number(summary.expenses_cents))
    : summarizeProfit(summary.lists.map(totalsOf), Number(summary.expenses_cents));

  // Una pestaña por entrega (en lugar de una por lista).
  const deliveries = ((deliveriesRes.data ?? []) as DeliverySummary[]).map((d) => ({ ...d, id: d.id, name: `Entrega ${d.number}` }));
  const wanted = first(sp.pestana);
  const delivery = deliveries.find((d) => d.id === wanted);
  const active = delivery ? delivery.id : wanted === "gastos" ? "gastos" : wanted === "consolidado" ? "consolidado" : "facturas";
  const page = readPage(sp);

  const tabs: ProfitTab[] = [
    { key: "facturas", label: "Facturas", count: Number(nav.purchases ?? 0) },
    { key: "gastos", label: "Gastos", count: Number(nav.expenses ?? 0) },
    // Consolidado de todas las entregas, antes de cada una.
    { key: "consolidado", label: "Consolidado", count: deliveries.length },
    ...deliveries.map((d) => ({ key: d.id, label: d.name, count: Number(d.lines), list: true })),
  ];

  const figures: { label: string; value: string; note?: string; strong?: boolean; negative?: boolean }[] = [
    credit
      ? { label: "Valor final sin IVA", value: formatCents(sum.reference), note: billing && billing.uncalculated > 0 ? `${billing.uncalculated} líneas por revisar` : "Suma de las entregas revisadas" }
      : { label: "Precio ref. sin IVA", value: formatCents(sum.reference), note: summary.contract_cents === null ? "Proceso a crédito" : `Contrato: ${formatCents(Number(summary.contract_cents))}` },
    { label: "Costo c/IVA", value: formatCents(sum.cost), note: "Lo realmente pagado" },
    { label: "Utilidad de items", value: formatCents(sum.itemsProfit), negative: sum.itemsProfit < 0 },
    { label: "Gastos", value: formatCents(sum.expenses) },
    { label: "Utilidad del proceso", value: formatCents(sum.profit), note: `Margen ${pct(sum.marginPct)}`, strong: true, negative: sum.profit < 0 },
  ];

  let panel: React.ReactNode;
  let barFigures: PageFigure[];
  let note: React.ReactNode | undefined;
  if (delivery) {
    const g = summarizeProfit([totalsOf(delivery)], 0);
    const lines = await deliveryLines(supabase, delivery.id, page);
    panel = (
      <BillingTable
        org={org}
        contractId={id}
        deliveryId={delivery.id}
        listId={delivery.list_id}
        base={base}
        lines={lines.rows}
        total={lines.total}
        totals={lines.totals}
        page={page}
        tab={delivery.id}
        canEdit={contract.c.status !== "paid"}
        title={`Entrega ${delivery.number}`}
        // Las listas creadas desde una factura se llaman «Factura N · Proveedor»: aquí va solo el número de factura.
        subtitle={`Fecha de entrega ${formatIso(delivery.delivered_on)} · ${delivery.list_name.startsWith("Factura ") ? delivery.list_name.split(" · ")[0] : delivery.list_name}`}
        warnings={[
          g.pending > 0 ? `${g.pending} sin compra todavía no cuentan` : "",
          g.noPrice > 0 ? `${g.noPrice} sin valor final no se pueden calcular` : "",
          g.partial > 0 ? `${g.partial} con costo incompleto` : "",
        ].filter(Boolean)}
      />
    );
    barFigures = [
      { label: Number(delivery.lines) === 1 ? "Línea" : "Líneas", value: String(delivery.lines) },
      { label: "Utilidad de la entrega", value: formatCents(lines.totals.final_cents - lines.totals.cost_cents), ...(lines.totals.final_cents - lines.totals.cost_cents < 0 ? { tone: "warn" as const } : {}) },
    ];
    // Sin nota bajo las pestañas: la entrega y sus explicaciones van dentro de su panel, junto a las cifras.
    note = undefined;
  } else if (active === "consolidado") {
    const rows = await consolidatedRows(supabase, id);
    panel = <ConsolidatedPanel rows={rows} base={base} />;
    const counted = rows.reduce((a, r) => a + r.counted, 0);
    const final = rows.reduce((a, r) => a + r.final_cents, 0);
    const cost = rows.reduce((a, r) => a + r.cost_cents, 0);
    barFigures = [
      { label: rows.length === 1 ? "Entrega" : "Entregas", value: String(rows.length) },
      { label: "Líneas incluidas", value: String(counted) },
      { label: "Utilidad generada", value: formatCents(final - cost), ...(final - cost < 0 ? { tone: "warn" as const } : {}) },
    ];
    note = undefined;
  } else if (active === "gastos") {
    const expenses = await listExpenses(supabase, id);
    panel = <ExpensesPanel rows={expenses} base={base} />;
    barFigures = [
      { label: "Gastos", value: String(nav.expenses ?? expenses.length) },
      { label: "Total", value: formatCents(sum.expenses) },
    ];
    note = "Utilidad del proceso = suma de las utilidades de los items − gastos.";
  } else {
    const purchases = await listPurchases(supabase, id);
    panel = <InvoicesPanel rows={purchases.rows} base={base} />;
    barFigures = [
      { label: "Facturas", value: String(nav.purchases ?? purchases.rows.length) },
      { label: "Total s/IVA", value: formatCents(purchases.subtotal) },
      { label: "Total c/IVA", value: formatCents(purchases.total) },
      { label: "Por pagar", value: formatCents(purchases.owed), ...(purchases.owed > 0 ? { tone: "warn" as const } : {}) },
    ];
    note = "Facturas de compra del proceso. El costo de cada item sale de lo asignado en Abastecimiento; los pagos no cambian la utilidad.";
  }

  return (
    <ProfitTabs
      tabs={tabs}
      activeKey={active}
      figures={barFigures}
      note={note}
      // Con una entrega abierta se oculta el resumen del proceso: solo quedan las cifras de esa entrega, para no confundirlas.
      top={
        delivery || active === "consolidado" ? undefined : (
        <PageSection className="p-0">
          <dl className="grid divide-x divide-y border-b sm:grid-cols-2 lg:grid-cols-5 lg:divide-y-0 [&>div]:p-4">
            {figures.map((f) => (
              <div key={f.label} className={cn("flex min-w-0 flex-col gap-1", f.strong && "bg-surface-strong")}>
                <dt className="caps text-muted-foreground">{f.label}</dt>
                <dd className={cn("num font-mono text-lg", f.strong && "font-semibold", f.negative && "text-destructive")}>{f.value}</dd>
                {f.note && <p className="text-xs text-muted-foreground">{f.note}</p>}
              </div>
            ))}
          </dl>
        </PageSection>
        )
      }
    >
      {panel}
    </ProfitTabs>
  );
}

async function deliveryLines(supabase: Supabase, deliveryId: string, page: number) {
  const { data } = await supabase.rpc("contract_billing_lines", { p_delivery_id: deliveryId, p_offset: (page - 1) * LINES_PAGE, p_limit: LINES_PAGE });
  const view = (data ?? { total: 0, totals: { cost_cents: 0, final_cents: 0, included: 0, excluded: 0, uncalculated: 0 }, lines: [] }) as {
    total: number;
    totals: Record<keyof BillingServerTotals, number>;
    lines: (Row & { margin_override: number | null; excluded: boolean })[];
  };
  return {
    total: Number(view.total),
    totals: {
      cost_cents: Number(view.totals.cost_cents), final_cents: Number(view.totals.final_cents),
      included: Number(view.totals.included), excluded: Number(view.totals.excluded), uncalculated: Number(view.totals.uncalculated),
    } satisfies BillingServerTotals,
    rows: view.lines.map((r): BillingLine => ({
      id: r.id, description: r.description, part_number: r.part_number, quantity: Number(r.quantity), unit: r.unit,
      referenceCents: r.reference_cents === null ? null : Number(r.reference_cents),
      costCents: Number(r.cost_cents), unknown: Number(r.unknown), sources: Number(r.sources),
      marginOverride: r.margin_override === null ? null : Number(r.margin_override), excluded: r.excluded,
    })),
  };
}

type ConsolidatedRow = {
  id: string; number: number; delivered_on: string; list_name: string; lines: number; counted: number; excluded: number;
  uncalculated: number; cost_cents: number; final_cents: number;
};

// Una fila por entrega vigente con sus totales ya revisados (valor final con los márgenes ajustados, sin líneas omitidas).
async function consolidatedRows(supabase: Supabase, contractId: string): Promise<ConsolidatedRow[]> {
  const { data } = await supabase.rpc("contract_billing_deliveries", { p_contract_id: contractId });
  return ((data ?? []) as ConsolidatedRow[]).map((r) => ({
    ...r, number: Number(r.number), lines: Number(r.lines), counted: Number(r.counted), excluded: Number(r.excluded),
    uncalculated: Number(r.uncalculated), cost_cents: Number(r.cost_cents), final_cents: Number(r.final_cents),
  }));
}

function ConsolidatedPanel({ rows, base }: { rows: ConsolidatedRow[]; base: string }) {
  const cost = rows.reduce((a, r) => a + r.cost_cents, 0);
  const final = rows.reduce((a, r) => a + r.final_cents, 0);
  const profit = final - cost;
  const pending = rows.reduce((a, r) => a + r.uncalculated, 0);
  const strip = "flex min-w-0 flex-col gap-1";
  return (
    <PageSection label="Consolidado de entregas" meta="Entregas vigentes, sin anuladas" className="p-0">
      <ConsolidatedExport href={`${base}/revision/consolidado/excel`} />
      <dl className="grid grid-cols-2 gap-px border-b bg-border sm:grid-cols-4 [&>div]:bg-background [&>div]:p-4">
        <div className={strip}><dt className="caps text-muted-foreground" title="Lo realmente pagado, con IVA">Costo total</dt><dd className="num font-mono text-lg">{formatCents(cost)}</dd></div>
        <div className={strip}><dt className="caps text-muted-foreground" title="Suma del valor final de cada entrega revisada">Valor final</dt><dd className="num font-mono text-lg">{formatCents(final)}</dd></div>
        <div className={strip}><dt className="caps text-muted-foreground" title="Valor final − costo total">Utilidad generada</dt><dd className={cn("num font-mono text-lg font-semibold", profit < 0 && "text-destructive")}>{formatCents(profit)}</dd></div>
        <div className={strip}><dt className="caps text-muted-foreground" title="Utilidad generada ÷ costo total">Margen aplicado</dt><dd className="num font-mono text-lg">{pct(cost > 0 ? (profit / cost) * 100 : null)}</dd></div>
      </dl>
      {pending > 0 && <p className="border-b px-4 py-2 text-xs text-muted-foreground">{pending} {pending === 1 ? "línea por revisar" : "líneas por revisar"}: sin compra o sin valor final todavía.</p>}
      {rows.length === 0 ? (
        <p className="p-6 text-sm text-muted-foreground">Todavía no hay entregas.</p>
      ) : (
        <Table>
          <TableHeader className="bg-surface-strong">
            <TableRow className="hover:bg-transparent">
              <TableHead>Entrega</TableHead>
              <TableHead>Fecha de entrega</TableHead>
              <TableHead>Lista</TableHead>
              <TableHead className="text-right">Líneas</TableHead>
              <TableHead className="text-right">Costo total</TableHead>
              <TableHead className="text-right">Margen aplicado</TableHead>
              <TableHead className="text-right">Valor final</TableHead>
              <TableHead className="text-right">Utilidad generada</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const p = r.final_cents - r.cost_cents;
              return (
                <TableRow key={r.id} className="relative hover:bg-accent/40">
                  <TableCell>
                    <Link href={`${base}/revision?pestana=${r.id}`} className="font-mono underline-offset-4 after:absolute after:inset-0 hover:underline" title="Revisar y ajustar esta entrega">
                      ENT-{String(r.number).padStart(3, "0")}
                    </Link>
                  </TableCell>
                  <TableCell className="num whitespace-nowrap">{formatIso(r.delivered_on)}</TableCell>
                  <TableCell>{r.list_name.startsWith("Factura ") ? r.list_name.split(" · ")[0] : r.list_name}</TableCell>
                  <TableCell className="num text-right">{r.counted} de {r.lines}</TableCell>
                  <TableCell className="num whitespace-nowrap text-right">{formatCents(r.cost_cents)}</TableCell>
                  <TableCell className="num whitespace-nowrap text-right">{pct(r.cost_cents > 0 ? (p / r.cost_cents) * 100 : null)}</TableCell>
                  <TableCell className="num whitespace-nowrap text-right">{formatCents(r.final_cents)}</TableCell>
                  <TableCell className={cn("num whitespace-nowrap text-right font-medium", p < 0 && "text-destructive")}>{formatCents(p)}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {r.uncalculated > 0 ? `${r.uncalculated} por revisar` : r.excluded > 0 ? `${r.excluded} omitidas` : "Revisada"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </PageSection>
  );
}

async function listPurchases(supabase: Supabase, contractId: string) {
  const [p, t] = await Promise.all([
    supabase.from("purchases").select("id, number, supplier_id, purchased_on, status").eq("contract_id", contractId).order("purchased_on", { ascending: false }).limit(500),
    supabase.from("purchase_totals").select("purchase_id, subtotal_cents, vat_cents").eq("contract_id", contractId).limit(500),
  ]);
  const purchases = (p.data ?? []) as { id: string; number: string | null; supplier_id: string | null; purchased_on: string; status: string }[];
  const totals = new Map(((t.data ?? []) as { purchase_id: string; subtotal_cents: number; vat_cents: number }[]).map((x) => [x.purchase_id, x]));
  const supplier = await supplierNames(supabase, purchases.map((x) => x.supplier_id));
  // Pagos, créditos y anticipos de cada factura, para su estado de pago.
  const { data: payRows } = purchases.length
    ? await supabase.from("purchase_payments").select("purchase_id, kind, amount_cents, due_on").in("purchase_id", purchases.map((x) => x.id)).limit(5000)
    : { data: [] };
  const moves = new Map<string, { kind: MovementKind; amount_cents: number; due_on: string | null }[]>();
  for (const r of (payRows ?? []) as { purchase_id: string; kind: MovementKind; amount_cents: number; due_on: string | null }[]) {
    moves.set(r.purchase_id, [...(moves.get(r.purchase_id) ?? []), { kind: r.kind, amount_cents: Number(r.amount_cents), due_on: r.due_on }]);
  }
  const today = todayEcuador();
  const rows = purchases.map((x) => {
    const subtotal = totals.has(x.id) ? Number(totals.get(x.id)!.subtotal_cents) : null;
    const vat = totals.has(x.id) ? Number(totals.get(x.id)!.vat_cents) : null;
    const total = subtotal === null || vat === null ? null : subtotal + vat;
    const pay: PaymentState | null = x.status === "draft" || total === null ? null : paymentState(total, moves.get(x.id) ?? [], today);
    return { ...x, supplier: x.supplier_id ? (supplier.get(x.supplier_id) ?? "—") : "—", subtotal, vat, total, pay };
  });
  return {
    rows,
    subtotal: rows.reduce((a, x) => a + (x.subtotal ?? 0), 0),
    total: rows.reduce((a, x) => a + (x.total ?? 0), 0),
    owed: rows.reduce((a, x) => a + (x.pay?.owedCents ?? 0), 0),
  };
}

async function listExpenses(supabase: Supabase, contractId: string) {
  const { data } = await supabase
    .from("contract_expenses")
    .select("id, spent_on, concept, payee, amount_cents")
    .eq("contract_id", contractId)
    .order("spent_on", { ascending: false })
    .limit(500);
  return (data ?? []) as { id: string; spent_on: string; concept: string; payee: string; amount_cents: number }[];
}

function InvoicesPanel({
  rows,
  base,
}: {
  rows: { id: string; number: string | null; status: string; supplier: string; purchased_on: string; subtotal: number | null; vat: number | null; total: number | null; pay: PaymentState | null }[];
  base: string;
}) {
  return (
    <PageSection className="p-0">
      {rows.length === 0 ? (
        <p className="p-6 text-sm text-muted-foreground">Aún no hay facturas de compra.</p>
      ) : (
        <Table>
          <TableHeader className="bg-surface-strong">
            <TableRow className="hover:bg-transparent">
              <TableHead>Factura</TableHead>
              <TableHead>Proveedor</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead className="text-right">Subtotal</TableHead>
              <TableHead className="text-right">IVA</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Pago</TableHead>
              <TableHead className="text-right">Por pagar</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((p) => (
              <TableRow key={p.id} className="relative hover:bg-accent/40">
                <TableCell>
                  <Link
                    href={`${base}/compras/${p.id}${p.status === "draft" ? "/editar" : ""}`}
                    className="font-mono underline-offset-4 after:absolute after:inset-0 hover:underline"
                    title="Ajustar en Compras"
                  >
                    {p.number ?? "Sin número"}
                  </Link>
                  {p.status === "draft" && <span className="ml-2 text-xs text-muted-foreground">Borrador</span>}
                </TableCell>
                <TableCell>{p.supplier}</TableCell>
                <TableCell className="whitespace-nowrap">{formatIso(p.purchased_on)}</TableCell>
                <TableCell className="num text-right">{p.subtotal === null ? "—" : formatCents(p.subtotal)}</TableCell>
                <TableCell className="num text-right">{p.vat === null ? "—" : formatCents(p.vat)}</TableCell>
                <TableCell className="num text-right font-medium">{p.total === null ? "—" : formatCents(p.total)}</TableCell>
                <TableCell className="whitespace-nowrap">
                  {p.pay ? (
                    <>
                      <Badge variant={p.pay.variant}>{p.pay.label}</Badge>
                      {p.pay.dueOn && <span className="block text-xs text-muted-foreground">vence {formatIso(p.pay.dueOn)}</span>}
                    </>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell className={cn("num text-right", p.pay && p.pay.owedCents > 0 && "font-medium")}>{p.pay ? formatCents(p.pay.owedCents) : "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </PageSection>
  );
}

function ExpensesPanel({ rows, base }: { rows: { id: string; spent_on: string; concept: string; payee: string; amount_cents: number }[]; base: string }) {
  return (
    <PageSection className="p-0">
      {rows.length === 0 ? (
        <p className="p-6 text-sm text-muted-foreground">Aún no hay gastos registrados.</p>
      ) : (
        <Table>
          <TableHeader className="bg-surface-strong">
            <TableRow className="hover:bg-transparent">
              <TableHead>Concepto</TableHead>
              <TableHead>Pagado a</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead className="text-right">Monto</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((e) => (
              <TableRow key={e.id} className="relative hover:bg-accent/40">
                <TableCell>
                  <Link href={`${base}/gastos?${new URLSearchParams({ q: e.concept })}`} className="underline-offset-4 after:absolute after:inset-0 hover:underline" title="Ajustar en Gastos">
                    {e.concept}
                  </Link>
                </TableCell>
                <TableCell>{e.payee || "—"}</TableCell>
                <TableCell className="whitespace-nowrap">{formatIso(e.spent_on)}</TableCell>
                <TableCell className="num text-right">{formatCents(Number(e.amount_cents))}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </PageSection>
  );
}

export function ContractProfitPage({ params, searchParams }: { params: IdParams; searchParams: Search }) {
  return (
    <Suspense fallback={<PageLoading />}>
      <Profit params={params} searchParams={searchParams} />
    </Suspense>
  );
}
