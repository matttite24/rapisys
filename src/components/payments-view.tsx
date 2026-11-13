import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { AdvanceDialog, DeleteAdvance } from "@/components/advance-dialog";
import { EmptyState } from "@/components/empty-state";
import { PageLoading } from "@/components/page-loading";
import { PageSection } from "@/components/page-section";
import { Pager } from "@/components/pager";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getContract } from "@/lib/contract-data";
import { formatIso } from "@/lib/dates";
import { SCHEMA_MESSAGE, isSchemaError, logDbError } from "@/lib/db-error";
import { formatCents } from "@/lib/money";
import { PAGE_SIZE, readPage } from "@/lib/pagination";
import { PAY_METHODS, PAYMENT_KIND_LABEL, isPaymentKind, type PaymentKind, type PaymentRow } from "@/lib/payments";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

type Props = { params: Promise<{ org: string; id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
type ByKind = Partial<Record<PaymentKind, { count: number; total_cents: number }>>;

// Pestañas por tipo. «Gastos» lleva a su pantalla de siempre (donde se registran y editan); las demás filtran esta lista.
export function PaymentTabs({ base, active, byKind }: { base: string; active: PaymentKind | ""; byKind?: ByKind }) {
  const n = (k: PaymentKind) => byKind?.[k]?.count;
  const all = byKind ? (Object.values(byKind).reduce((s, x) => s + Number(x?.count ?? 0), 0)) : undefined;
  const items: { key: PaymentKind | ""; label: string; href: string; count?: number }[] = [
    { key: "", label: "Todo", href: `${base}/pagos`, count: all },
    { key: "expense", label: "Gastos", href: `${base}/gastos`, count: n("expense") },
    { key: "payment", label: "Pagos de facturas", href: `${base}/pagos?tipo=payment`, count: n("payment") },
    { key: "credit", label: "A crédito", href: `${base}/pagos?tipo=credit`, count: n("credit") },
    { key: "advance", label: "Anticipos", href: `${base}/pagos?tipo=advance`, count: n("advance") },
  ];
  return (
    <div role="group" aria-label="Tipo de movimiento" className="flex overflow-x-auto border-b bg-surface-strong/60 [scrollbar-width:none]">
      {items.map((i) => (
        <Link
          key={i.key || "todo"}
          href={i.href}
          aria-current={i.key === active ? "page" : undefined}
          className={cn(
            "-mb-px flex h-11 shrink-0 items-center gap-2 border-b-2 px-4 text-sm transition-colors",
            i.key === active ? "border-b-brand font-bold text-foreground" : "border-b-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {i.label}
          {i.count !== undefined && <span className="num bg-muted px-1.5 py-0.5 text-2xs leading-none text-muted-foreground">{i.count}</span>}
        </Link>
      ))}
    </div>
  );
}

const KIND_TONE: Record<PaymentKind, "pending" | "running" | "partial" | "stock"> = { expense: "pending", payment: "stock", credit: "partial", advance: "running" };

async function Payments({ params, searchParams }: Props) {
  await connection();
  const [{ org, id }, sp] = await Promise.all([params, searchParams]);
  const raw = first(sp.tipo) ?? "";
  const kind: PaymentKind | "" = isPaymentKind(raw) ? raw : "";
  const page = readPage(sp);
  const supabase = await createClient();
  const [found, { data, error }] = await Promise.all([
    getContract(org, id),
    supabase.rpc("contract_payments_view", { p_contract_id: id, p_kind: kind, p_offset: (page - 1) * PAGE_SIZE, p_limit: PAGE_SIZE }),
  ]);
  if (!found) notFound();
  if (error || !data) {
    if (error) logDbError("pagos del contrato", error);
    return <div role="alert" className="p-6 text-sm text-destructive">{error && isSchemaError(error) ? SCHEMA_MESSAGE : "No se pudieron cargar los pagos. Actualiza la sección para reintentar."}</div>;
  }
  const view = data as { count: number; total_cents: number; by_kind: ByKind; rows: PaymentRow[] };
  const rows = view.rows.map((r) => ({ ...r, amount_cents: Number(r.amount_cents) }));
  const count = Number(view.count);
  const base = `/${org}/contratos/${id}`;
  const canAct = found.c.status !== "new" && found.c.status !== "paid";

  // Proveedores y cuentas para el anticipo (solo si se puede registrar).
  const [sups, banks] = canAct
    ? await Promise.all([
        supabase.from("suppliers").select("id, name").eq("organization_id", found.orgId).order("name").limit(500),
        supabase.from("bank_accounts").select("id, bank, account_number").eq("organization_id", found.orgId).order("bank").limit(200),
      ])
    : [{ data: [] }, { data: [] }];

  return (
    <>
      {canAct && (
        <AdvanceDialog
          org={org}
          contractId={id}
          suppliers={(sups.data ?? []) as { id: string; name: string }[]}
          banks={((banks.data ?? []) as { id: string; bank: string; account_number: string }[]).map((b) => ({ id: b.id, label: `${b.bank} · ${b.account_number}` }))}
        />
      )}
      <PageSection label={`${count} ${count === 1 ? "movimiento" : "movimientos"}`} meta={formatCents(Number(view.total_cents))} className="p-0">
        <PaymentTabs base={base} active={kind} byKind={view.by_kind} />
        {rows.length === 0 ? (
          <EmptyState fill image="File Cabinet ">
            {kind === "" ? "Todavía no hay pagos, créditos, anticipos ni gastos." : `Todavía no hay movimientos de tipo ${PAYMENT_KIND_LABEL[kind].toLowerCase()}.`}
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-transparent">
                  <TableHead>Fecha</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Detalle</TableHead>
                  <TableHead>Proveedor / beneficiario</TableHead>
                  <TableHead>Forma de pago</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead className="w-px"><span className="sr-only">Acciones</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={`${r.kind}:${r.id}`} className="border-b last:border-b-0 hover:bg-accent/60">
                    <TableCell className="num whitespace-nowrap">{formatIso(r.on_date)}</TableCell>
                    <TableCell><Badge variant={KIND_TONE[r.kind]}>{PAYMENT_KIND_LABEL[r.kind]}</Badge></TableCell>
                    <TableCell className="min-w-48">
                      {r.purchase_id ? (
                        <Link href={`${base}/compras/${r.purchase_id}`} className="underline-offset-4 hover:underline">{r.concept}</Link>
                      ) : r.kind === "expense" ? (
                        <Link href={`${base}/gastos?${new URLSearchParams({ q: r.concept })}`} className="underline-offset-4 hover:underline">{r.concept}</Link>
                      ) : (
                        r.concept
                      )}
                      {r.kind === "credit" && r.due_on && <p className="text-xs text-muted-foreground">Vence {formatIso(r.due_on)}</p>}
                      {r.reference && <p className="font-mono text-xs text-muted-foreground">{r.reference}</p>}
                    </TableCell>
                    <TableCell>{r.who || "—"}</TableCell>
                    <TableCell>{r.method ? (PAY_METHODS[r.method as keyof typeof PAY_METHODS] ?? r.method) : "—"}</TableCell>
                    <TableCell className="num whitespace-nowrap text-right">{formatCents(r.amount_cents)}</TableCell>
                    <TableCell>{r.kind === "advance" && canAct ? <DeleteAdvance org={org} contractId={id} id={r.id} /> : null}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <Pager basePath={`${base}/pagos`} page={page} total={count} size={PAGE_SIZE} params={kind ? { tipo: kind } : {}} />
      </PageSection>
      <p className="px-6 py-3 text-xs text-muted-foreground">
        Los pagos, créditos y anticipos de facturas no cambian la utilidad: el costo ya cuenta en la compra. Solo los gastos la restan.
      </p>
    </>
  );
}

export function PaymentsPage(props: Props) {
  return (
    <>
      <h1 className="sr-only">Pagos</h1>
      <Suspense fallback={<PageLoading />}>
        <Payments {...props} />
      </Suspense>
    </>
  );
}
