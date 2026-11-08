import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { PageLoading } from "@/components/page-loading";
import { PageSection } from "@/components/page-section";
import { Pager } from "@/components/pager";
import { ProfitTabs, type ProfitTab } from "@/components/profit-tabs";
import type { PageFigure } from "@/components/page-shortcuts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getContract } from "@/lib/contract-data";
import { formatIso } from "@/lib/dates";
import { SCHEMA_MESSAGE, isSchemaError, logDbError } from "@/lib/db-error";
import { formatCents } from "@/lib/money";
import { readPage } from "@/lib/pagination";
import { lineProfit, summarizeProfit } from "@/lib/profit";
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
type Summary = { contract_cents: number; expenses_cents: number; lists: ListSummary[] };

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
const tone = (cents: number) => (cents < 0 ? "text-destructive" : "");
const totalsOf = (l: ListSummary) => ({
  reference: Number(l.reference_cents),
  cost: Number(l.cost_cents),
  pending: Number(l.pending),
  noPrice: Number(l.no_price),
  partial: Number(l.partial),
});

// Revisión de rentabilidad. Las cifras llegan sumadas por la base y solo se piden los datos de la pestaña abierta
// (una página de líneas de una lista, las facturas o los gastos), para que la pantalla no crezca con el contrato.
async function Profit({ params, searchParams }: { params: IdParams; searchParams: Search }) {
  await connection();
  const [{ org, id }, sp, supabase] = await Promise.all([params, searchParams, createClient()]);
  const [contract, summaryRes, navRes] = await Promise.all([
    getContract(org, id),
    supabase.rpc("contract_profit_summary", { p_contract_id: id }),
    supabase.rpc("contract_nav_counts", { p_contract_id: id }),
  ]);
  if (!contract) notFound();
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
  const sum = summarizeProfit(summary.lists.map(totalsOf), Number(summary.expenses_cents));

  const wanted = first(sp.pestana);
  const list = summary.lists.find((l) => l.id === wanted);
  const active = list ? list.id : wanted === "gastos" ? "gastos" : "facturas";
  const page = readPage(sp);

  const tabs: ProfitTab[] = [
    { key: "facturas", label: "Facturas", count: Number(nav.purchases ?? 0) },
    { key: "gastos", label: "Gastos", count: Number(nav.expenses ?? 0) },
    ...summary.lists.map((l) => ({ key: l.id, label: l.name, count: Number(l.lines), list: true })),
  ];

  const figures: { label: string; value: string; note?: string; strong?: boolean; negative?: boolean }[] = [
    { label: "Precio ref.", value: formatCents(sum.reference), note: `Contrato: ${formatCents(Number(summary.contract_cents))}` },
    { label: "Costo de compra", value: formatCents(sum.cost) },
    { label: "Utilidad de items", value: formatCents(sum.itemsProfit), negative: sum.itemsProfit < 0 },
    { label: "Gastos", value: formatCents(sum.expenses) },
    { label: "Utilidad del contrato", value: formatCents(sum.profit), note: `Margen ${pct(sum.marginPct)}`, strong: true, negative: sum.profit < 0 },
  ];

  let panel: React.ReactNode;
  let barFigures: PageFigure[];
  let note: React.ReactNode;
  if (list) {
    const g = summarizeProfit([totalsOf(list)], 0);
    const lines = await listLines(supabase, list.id, page);
    panel = <ListPanel rows={lines.rows} total={lines.total} page={page} base={base} listId={list.id} />;
    barFigures = [
      { label: Number(list.lines) === 1 ? "Línea" : "Líneas", value: String(list.lines) },
      { label: "Utilidad de la lista", value: formatCents(g.itemsProfit), ...(g.itemsProfit < 0 ? { tone: "warn" as const } : {}) },
    ];
    note = (
      <>
        Utilidad de un item = precio ref. − costo de compra.
        {g.pending > 0 && ` ${g.pending} sin compra todavía no cuentan.`}
        {g.noPrice > 0 && ` ${g.noPrice} sin precio ref. no se pueden calcular.`}
        {g.partial > 0 && ` ${g.partial} tienen costo incompleto.`}
      </>
    );
  } else if (active === "gastos") {
    const expenses = await listExpenses(supabase, id);
    panel = <ExpensesPanel rows={expenses} base={base} />;
    barFigures = [
      { label: "Gastos", value: String(nav.expenses ?? expenses.length) },
      { label: "Total", value: formatCents(sum.expenses) },
    ];
    note = "Utilidad del contrato = suma de las utilidades de los items − gastos.";
  } else {
    const purchases = await listPurchases(supabase, id);
    panel = <InvoicesPanel rows={purchases.rows} base={base} />;
    barFigures = [
      { label: "Facturas", value: String(nav.purchases ?? purchases.rows.length) },
      { label: "Total s/IVA", value: formatCents(purchases.subtotal) },
    ];
    note = "Facturas de compra del contrato, sin IVA. El costo de cada item sale de lo asignado en Abastecimiento.";
  }

  return (
    <ProfitTabs
      tabs={tabs}
      activeKey={active}
      figures={barFigures}
      note={note}
      top={
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
        </PageSection>
      }
    >
      {panel}
    </ProfitTabs>
  );
}

async function listLines(supabase: Supabase, listId: string, page: number) {
  const { data } = await supabase.rpc("contract_profit_lines", { p_list_id: listId, p_offset: (page - 1) * LINES_PAGE, p_limit: LINES_PAGE });
  const view = (data ?? { total: 0, lines: [] }) as { total: number; lines: Row[] };
  return {
    total: Number(view.total),
    rows: view.lines.map((r) => ({
      ...r,
      referenceCents: r.reference_cents === null ? null : Number(r.reference_cents),
      costCents: Number(r.cost_cents),
      unknown: Number(r.unknown),
      sources: Number(r.sources),
    })),
  };
}

async function listPurchases(supabase: Supabase, contractId: string) {
  const [p, t] = await Promise.all([
    supabase.from("purchases").select("id, number, supplier_id, purchased_on, status").eq("contract_id", contractId).order("purchased_on", { ascending: false }).limit(500),
    supabase.from("purchase_totals").select("purchase_id, subtotal_cents, vat_cents").eq("contract_id", contractId).limit(500),
  ]);
  const purchases = (p.data ?? []) as { id: string; number: string | null; supplier_id: string | null; purchased_on: string; status: string }[];
  const totals = new Map(((t.data ?? []) as { purchase_id: string; subtotal_cents: number; vat_cents: number }[]).map((x) => [x.purchase_id, x]));
  const supplier = await supplierNames(supabase, purchases.map((x) => x.supplier_id));
  const rows = purchases.map((x) => ({
    ...x,
    supplier: x.supplier_id ? (supplier.get(x.supplier_id) ?? "—") : "—",
    subtotal: totals.has(x.id) ? Number(totals.get(x.id)!.subtotal_cents) : null,
    vat: totals.has(x.id) ? Number(totals.get(x.id)!.vat_cents) : null,
  }));
  return { rows, subtotal: rows.reduce((a, x) => a + (x.subtotal ?? 0), 0) };
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

function ListPanel({
  rows,
  total,
  page,
  base,
  listId,
}: {
  rows: (Row & { referenceCents: number | null; costCents: number })[];
  total: number;
  page: number;
  base: string;
  listId: string;
}) {
  return (
    <PageSection className="p-0">
      {rows.length === 0 ? (
        <p className="p-6 text-sm text-muted-foreground">Esta lista aún no tiene líneas.</p>
      ) : (
        <Table>
          <TableHeader className="bg-surface-strong">
            <TableRow className="hover:bg-transparent">
              <TableHead>Item</TableHead>
              <TableHead className="text-right">Cant.</TableHead>
              <TableHead className="text-right">Precio ref.</TableHead>
              <TableHead className="text-right">Costo</TableHead>
              <TableHead className="text-right">Utilidad</TableHead>
              <TableHead className="text-right">Margen</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const p = lineProfit(r);
              const done = p.kind === "ok" || p.kind === "partial";
              const fix = `${base}/abastecimiento?${new URLSearchParams({ lista: listId, q: r.part_number || r.description })}`;
              return (
                <TableRow key={r.id} className="relative hover:bg-accent/40">
                  <TableCell className="min-w-56">
                    <Link href={fix} className="underline-offset-4 after:absolute after:inset-0 hover:underline" title="Ajustar en Abastecimiento">
                      {r.description}
                    </Link>
                    {r.part_number && <p className="font-mono text-xs text-muted-foreground">{r.part_number}</p>}
                  </TableCell>
                  <TableCell className="num whitespace-nowrap text-right">
                    {Number(r.quantity)} {r.unit}
                  </TableCell>
                  <TableCell className="num whitespace-nowrap text-right">{r.referenceCents === null ? "—" : formatCents(r.referenceCents)}</TableCell>
                  <TableCell className="num whitespace-nowrap text-right">{r.sources > 0 ? formatCents(r.costCents) : "—"}</TableCell>
                  <TableCell className={cn("num whitespace-nowrap text-right font-medium", done && tone(p.profitCents))}>
                    {done ? formatCents(p.profitCents) : <span className="text-xs font-normal text-muted-foreground">{p.kind === "none" ? "Sin precio ref." : "Sin compra"}</span>}
                    {p.kind === "partial" && <span className="block text-xs font-normal text-muted-foreground">Costo incompleto</span>}
                  </TableCell>
                  <TableCell className={cn("num whitespace-nowrap text-right", done && p.marginPct !== null && p.marginPct < 0 && "text-destructive")}>
                    {done ? pct(p.marginPct) : "—"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
      <Pager basePath={`${base}/revision`} page={page} total={total} size={LINES_PAGE} params={{ pestana: listId }} />
    </PageSection>
  );
}

function InvoicesPanel({
  rows,
  base,
}: {
  rows: { id: string; number: string | null; status: string; supplier: string; purchased_on: string; subtotal: number | null; vat: number | null }[];
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
