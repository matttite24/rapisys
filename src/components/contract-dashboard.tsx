import Link from "next/link";
import {
  ArrowRight01Icon,
  Building03Icon,
  Calendar03Icon,
  DeliveryTruck01Icon,
  LeftToRightListBulletIcon,
  PackageProcessIcon,
  ShoppingCart01Icon,
  UserCheck01Icon,
  Wallet01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { buttonVariants } from "@/components/ui/button";
import { STATE, type SupplyState } from "@/components/supply-progress";
import { purchaseState } from "@/lib/purchase-state";
import { PurchasesChart, type PurchasePoint } from "@/components/purchases-chart";
import { PageFigures } from "@/components/page-shortcuts";
import { PageRefresh } from "@/components/page-refresh";
import { StatusChip } from "@/components/status-chip";
import { addDaysIso, formatIso, todayEcuador } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { supplierNames } from "@/lib/supplier-names";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

const STATE_ORDER: SupplyState[] = ["pending", "quoted", "purchased", "partial", "in_stock", "delivered"];

const DAY = 86_400_000;
const isoMs = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

type Contract = {
  name: string;
  code: string;
  client_id: string;
  manager_id: string;
  kind?: string;
  total_cents: number | string | null;
  start_date: string;
  term_days: number | string | null;
  status: string;
};

// Barra de avance del kit con altura propia y valor en texto.
function Meter({ value, label }: { value: number; label: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <Progress value={v} aria-label={label} className="gap-0 [&_[data-slot=progress-track]]:h-2 [&_[data-slot=progress-track]]:rounded-sm [&_[data-slot=progress-indicator]]:rounded-sm">
      <span className="sr-only">{label}</span>
    </Progress>
  );
}

// Ícono discreto al lado de un rótulo: ayuda a reconocer la sección (los mismos íconos que el menú del contrato).
function Ico({ icon, className }: { icon: IconSvgElement; className?: string }) {
  return <HugeiconsIcon icon={icon} aria-hidden className={cn("size-4 shrink-0 text-muted-foreground", className)} />;
}

function SeeAll({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-my-1 -mr-3")}>
      {children}
      <HugeiconsIcon icon={ArrowRight01Icon} aria-hidden className="size-3.5" />
    </Link>
  );
}

// Dashboard del contrato: plazo, monto, abastecimiento, compras, entregas y listas, con lo principal de cada parte.
export async function ContractDashboard({
  org,
  id,
  c,
}: {
  org: string;
  id: string;
  c: Contract;
}) {
  const supabase = await createClient();
  const base = `/${org}/contratos/${id}`;

  const [clientRes, managerRes, supplyRes, listsRes, purchasesRes, totalsRes, deliveriesRes] = await Promise.all([
    supabase.from("clients").select("name").eq("id", c.client_id).maybeSingle(),
    supabase.from("contract_managers").select("name, ruc").eq("id", c.manager_id).maybeSingle(),
    supabase.rpc("contract_state_counts", { p_contract_id: id }),
    supabase.from("contract_lists").select("id, name").eq("contract_id", id).order("created_at"),
    supabase
      .from("purchases")
      .select("id, number, supplier_id, purchased_on, status")
      .eq("contract_id", id)
      .order("purchased_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(500),
    supabase.from("purchase_totals").select("purchase_id, units, subtotal_cents, vat_cents, received").eq("contract_id", id).limit(500),
    supabase
      .from("deliveries")
      .select("id, list_id, number, delivered_on, received_by")
      .eq("contract_id", id)
      .order("number", { ascending: false })
      .limit(100),
  ]);

  // Plazo
  const credit = c.kind === "credit";
  const end = credit ? null : addDaysIso(c.start_date, Number(c.term_days));
  const today = todayEcuador();
  const termDays = Number(c.term_days);
  const elapsed = Math.round((isoMs(today) - isoMs(c.start_date)) / DAY);
  const remaining = end ? Math.round((isoMs(end) - isoMs(today)) / DAY) : null;
  const timePct = termDays > 0 ? (elapsed / termDays) * 100 : 0;

  // Abastecimiento: el recuento es por líneas del contrato.
  const rows = (supplyRes.data ?? []) as { list_id: string; state: SupplyState; n: number }[];
  const counts: Record<SupplyState, number> = { pending: 0, quoted: 0, purchased: 0, partial: 0, in_stock: 0, delivered: 0 };
  const byList = new Map<string, { total: number; delivered: number }>();
  let totalLines = 0;
  for (const r of rows) {
    const n = Number(r.n);
    counts[r.state] += n;
    totalLines += n;
    const l = byList.get(r.list_id) ?? { total: 0, delivered: 0 };
    l.total += n;
    if (r.state === "delivered") l.delivered += n;
    byList.set(r.list_id, l);
  }
  const pct = (n: number) => (totalLines > 0 ? (n / totalLines) * 100 : 0);

  // Compras
  const purchases = (purchasesRes.data ?? []) as { id: string; number: string | null; supplier_id: string | null; purchased_on: string; status: "draft" | "complete" }[];
  const totals = new Map(
    ((totalsRes.data ?? []) as { purchase_id: string; units: number; subtotal_cents: number; vat_cents: number; received: number }[]).map((t) => [t.purchase_id, t]),
  );
  const supplier = await supplierNames(supabase, purchases.map((p) => p.supplier_id));
  const purchaseTotal = (pid: string) => {
    const t = totals.get(pid);
    return t ? Number(t.subtotal_cents) + Number(t.vat_cents) : 0;
  };
  const spent = purchases.filter((p) => p.status === "complete").reduce((a, p) => a + purchaseTotal(p.id), 0);
  const drafts = purchases.filter((p) => p.status === "draft").length;
  const contractTotal = Number(c.total_cents);
  const chartPoints: PurchasePoint[] = purchases
    .filter((p) => p.status === "complete")
    .slice(0, 8)
    .reverse()
    .map((p) => ({
      id: p.id,
      number: p.number ?? "Sin número",
      supplier: (p.supplier_id && supplier.get(p.supplier_id)) || "—",
      date: formatIso(p.purchased_on),
      totalCents: purchaseTotal(p.id),
    }));

  // Entregas
  const deliveries = (deliveriesRes.data ?? []) as { id: string; list_id: string; number: number; delivered_on: string; received_by: string | null }[];
  const lists = (listsRes.data ?? []) as { id: string; name: string }[];
  const listName = new Map(lists.map((l) => [l.id, l.name]));

  const late = !credit && remaining !== null && remaining < 0 && c.status === "in_progress";

  const spentPct = contractTotal > 0 ? Math.round((spent / contractTotal) * 100) : 0;

  const plazoText =
    remaining === null ? "—" : remaining >= 0 ? `${remaining} ${remaining === 1 ? "día" : "días"}` : `${-remaining} ${remaining === -1 ? "día" : "días"} de atraso`;

  return (
    <div className="flex flex-col motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-300">
      {/* Barra inferior: las cifras que importan a primera vista y el atajo para actualizar. */}
      <PageFigures
        figures={[
          credit
            ? { label: "Comprado", value: formatCents(spent) }
            : { label: "Monto", value: formatCents(contractTotal), note: `comprado ${spentPct} %` },
          ...(credit ? [] : [{ label: "Plazo restante", value: plazoText, ...(late ? { tone: "warn" as const } : {}) }]),
          { label: "Entregadas", value: `${counts.delivered} de ${totalLines}` },
        ]}
      />
      <PageRefresh stamp={new Date().toISOString()} />
      {/* Hero a todo el ancho: identifica el contrato y reúne sus tres cifras. El montacargas se apoya en el borde inferior. */}
      <section className="overflow-hidden border-b bg-surface-strong">
        <div className="flex items-end justify-between gap-8 pl-6 pr-6 xl:pr-10">
          <div className="flex min-w-0 flex-1 flex-col gap-8 py-8">
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <StatusChip status={c.status} kind={c.kind} deliveries={deliveries.length} />
                <span className="num text-sm text-muted-foreground">{c.code}</span>
              </div>
              <h2 className="font-heading text-3xl leading-tight font-semibold text-balance xl:text-4xl">{c.name}</h2>
              <p className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Ico icon={Building03Icon} />
                  <span className="font-medium text-foreground">{clientRes.data?.name ?? "—"}</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <Ico icon={UserCheck01Icon} />
                  <span className="text-foreground">{managerRes.data?.name ?? "—"}</span>
                  {managerRes.data?.ruc && <span className="num">{managerRes.data.ruc}</span>}
                </span>
              </p>
            </div>

            <dl className="grid max-w-4xl gap-6 md:grid-cols-3 md:divide-x [&>div]:flex [&>div]:min-w-0 [&>div]:flex-col [&>div]:gap-2 md:[&>div]:px-4 xl:[&>div]:px-6 md:[&>div:first-child]:pl-0">
              {credit ? (
              <div>
                <dt className="flex items-center gap-1.5 text-xs text-muted-foreground"><Ico icon={Wallet01Icon} className="size-3.5" />Comprado (IVA incl.)</dt>
                <dd className="text-2xl leading-none font-semibold tracking-tight tabular-nums xl:text-3xl">{formatCents(spent)}</dd>
                <span className="text-xs text-muted-foreground">Proceso a crédito: sin monto ni plazo</span>
              </div>
              ) : (
                <>
              <div>
                <dt className="flex items-center gap-1.5 text-xs text-muted-foreground"><Ico icon={Wallet01Icon} className="size-3.5" />Monto del contrato (IVA incl.)</dt>
                <dd className="text-2xl leading-none font-semibold tracking-tight tabular-nums xl:text-3xl">{formatCents(contractTotal)}</dd>
                <Meter value={contractTotal > 0 ? (spent / contractTotal) * 100 : 0} label="Comprado sobre el monto" />
                <span className="text-xs text-muted-foreground">Comprado {formatCents(spent)} · {spentPct} %</span>
              </div>
              <div>
                <dt className="flex items-center gap-1.5 text-xs text-muted-foreground"><Ico icon={Calendar03Icon} className="size-3.5" />Plazo restante</dt>
                <dd className={cn("text-2xl leading-none font-semibold tracking-tight tabular-nums xl:text-3xl", late && "text-destructive")}>
                  {remaining === null ? "—" : remaining >= 0 ? `${remaining} ${remaining === 1 ? "día" : "días"}` : `${-remaining} ${remaining === -1 ? "día" : "días"} de atraso`}
                </dd>
                <Meter value={timePct} label="Plazo transcurrido" />
                <span className="text-xs text-muted-foreground">
                  de {termDays} {termDays === 1 ? "día" : "días"} · {formatIso(c.start_date)} → {end ? formatIso(end) : "—"}
                </span>
              </div>
                </>
              )}
              <div>
                <dt className="flex items-center gap-1.5 text-xs text-muted-foreground"><Ico icon={DeliveryTruck01Icon} className="size-3.5" />Líneas entregadas</dt>
                <dd className="text-2xl leading-none font-semibold tracking-tight tabular-nums xl:text-3xl">
                  {counts.delivered} <span className="text-lg font-normal text-muted-foreground">de {totalLines}</span>
                </dd>
                <Meter value={pct(counts.delivered)} label="Líneas entregadas" />
                <span className="text-xs text-muted-foreground">{counts.in_stock} en bodega listas para entregar</span>
              </div>
            </dl>
          </div>
          {/* Ilustración decorativa (public/Dummies). */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={credit ? "/Dummies/Excavator.avif" : "/Dummies/Forklift.avif"}
            alt=""
            aria-hidden
            className="pointer-events-none hidden size-64 shrink-0 translate-y-4 object-contain xl:block 2xl:size-80"
          />
        </div>
      </section>

      <div className="flex flex-col gap-4 p-4">
      <div className="grid gap-4 xl:grid-cols-3">
        {/* Abastecimiento */}
        <Card size="sm" className="xl:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Ico icon={PackageProcessIcon} />Abastecimiento</CardTitle>
            <CardDescription>{totalLines} {totalLines === 1 ? "línea" : "líneas"} en el contrato</CardDescription>
            <CardAction>
              <SeeAll href={`${base}/abastecimiento`}>Ver abastecimiento</SeeAll>
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex h-3 w-full overflow-hidden rounded-sm bg-muted" role="img" aria-label="Líneas por estado">
              {STATE_ORDER.map((s) => (
                <div key={s} className={STATE[s].dot} style={{ width: `${pct(counts[s])}%` }} />
              ))}
            </div>
            <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2 xl:grid-cols-3">
              {STATE_ORDER.map((s) => (
                <li key={s} className="flex items-center gap-2 text-sm">
                  <span aria-hidden className={cn("size-2.5 shrink-0 rounded-full", STATE[s].dot)} />
                  <span className="min-w-0 flex-1 truncate">{STATE[s].label}</span>
                  <span className="num">{counts[s]}</span>
                  <span className="num w-10 text-right text-xs text-muted-foreground">{Math.round(pct(counts[s]))} %</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardDescription className="flex items-center gap-2">
              <Ico icon={ShoppingCart01Icon} />
              Compras
            </CardDescription>
            <CardTitle className="num text-2xl">
              {purchases.length} <span className="font-sans text-sm font-normal text-muted-foreground">{purchases.length === 1 ? "factura" : "facturas"}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="mt-auto flex flex-col gap-2">
            {chartPoints.length > 0 ? (
              <PurchasesChart points={chartPoints} />
            ) : (
              <p className="text-xs text-muted-foreground">{purchases.length === 0 ? "Aún no hay facturas." : "Ninguna factura cargada todavía."}</p>
            )}
            {drafts > 0 && <p className="text-xs text-muted-foreground">{drafts} {drafts === 1 ? "borrador" : "borradores"} sin cargar</p>}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {/* Compras recientes */}
        <Card size="sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Ico icon={ShoppingCart01Icon} />Compras recientes</CardTitle>
            <CardAction>
              <SeeAll href={`${base}/compras`}>Ver compras</SeeAll>
            </CardAction>
          </CardHeader>
          <CardContent className="px-0">
            {purchases.length === 0 ? (
              <p className="px-(--card-spacing) text-sm text-muted-foreground">Aún no hay facturas de compra.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Factura</TableHead>
                    <TableHead>Proveedor</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {purchases.slice(0, 5).map((p) => {
                    const t = totals.get(p.id);
                    const ps = purchaseState(p.status, t);
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="num">
                          <Link href={`${base}/compras/${p.id}${p.status === "draft" ? "/editar" : ""}`} className="underline-offset-4 hover:underline">
                            {p.number ?? "—"}
                          </Link>
                          <span className="block text-xs text-muted-foreground">{formatIso(p.purchased_on)}</span>
                        </TableCell>
                        <TableCell className="max-w-40 truncate">{p.supplier_id ? supplier.get(p.supplier_id) : "—"}</TableCell>
                        <TableCell className="num text-right">{formatCents(purchaseTotal(p.id))}</TableCell>
                        <TableCell>
                          <Badge variant={ps.variant}>{ps.label}</Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Entregas recientes */}
        <Card size="sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Ico icon={DeliveryTruck01Icon} />Entregas recientes</CardTitle>
            <CardAction>
              <SeeAll href={`${base}/entregas`}>Ver entregas</SeeAll>
            </CardAction>
          </CardHeader>
          <CardContent className="px-0">
            {deliveries.length === 0 ? (
              <p className="px-(--card-spacing) text-sm text-muted-foreground">Aún no se han registrado entregas.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Entrega</TableHead>
                    <TableHead>Lista</TableHead>
                    <TableHead>Recibe</TableHead>
                    <TableHead className="text-right">Fecha</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deliveries.slice(0, 5).map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="num">
                        <Link href={`${base}/entregas/${d.id}`} className="underline-offset-4 hover:underline">
                          N.º {d.number}
                        </Link>
                      </TableCell>
                      <TableCell className="max-w-40 truncate">{listName.get(d.list_id) ?? "—"}</TableCell>
                      <TableCell className="max-w-32 truncate">{d.received_by ?? "—"}</TableCell>
                      <TableCell className="num text-right">{formatIso(d.delivered_on)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Avance por lista */}
      {lists.length > 0 && (
        <Card size="sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Ico icon={LeftToRightListBulletIcon} />Listas</CardTitle>
            <CardDescription>Líneas entregadas por lista de referencia</CardDescription>
            <CardAction>
              <SeeAll href={`${base}/items`}>Ver listas</SeeAll>
            </CardAction>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-x-8 gap-y-4 md:grid-cols-2">
              {lists.map((l) => {
                const s = byList.get(l.id) ?? { total: 0, delivered: 0 };
                return (
                  <li key={l.id} className="flex flex-col gap-1.5">
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate font-medium">{l.name}</span>
                      <span className="num shrink-0 text-xs text-muted-foreground">
                        {s.delivered} de {s.total}
                      </span>
                    </div>
                    <Meter value={s.total > 0 ? (s.delivered / s.total) * 100 : 0} label={`Entregadas en ${l.name}`} />
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}
      </div>
    </div>
  );
}
