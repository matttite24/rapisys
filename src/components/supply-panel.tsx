"use client";

import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { SupplyLine } from "@/components/supply-board";
import { Progress, STATE } from "@/components/supply-progress";
import { NumericInput } from "@/components/numeric-input";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatCents } from "@/lib/money";
import { releaseSource, reserveStock, getLineSupply, searchStock, type SourceView, type StockResult } from "@/lib/supply-actions";
import { assignPurchase, getPurchaseOptions, type PurchaseOption } from "@/lib/purchase-actions";
import { unitLabel } from "@/lib/units";
import { cn } from "@/lib/utils";

const norm = (v: string) => v.toUpperCase().replace(/[\s\-_.]+/g, "");

// Panel de una línea: lo ya reservado y la búsqueda en la bodega para reservar más.
export function SupplyPanel({
  org,
  contractId,
  line,
  canAct,
  onClose,
}: {
  org: string;
  contractId: string;
  line: SupplyLine | null;
  canAct: boolean;
  onClose: () => void;
}) {
  return (
    <Sheet open={line !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-3xl">
        <SheetHeader>
          <SheetTitle className="truncate">{line ? line.description : "Línea"}</SheetTitle>
          {line && (
            <p className="truncate font-mono text-xs text-muted-foreground">
              Línea {line.n} · {line.partNumber || "Sin número de parte"}
              {line.cpc && ` · CPC ${line.cpc}`}
            </p>
          )}
          <SheetDescription className="sr-only">Reservar existencias de la bodega para esta línea.</SheetDescription>
        </SheetHeader>
        {line && <PanelBody key={line.id} org={org} contractId={contractId} line={line} canAct={canAct} />}
      </SheetContent>
    </Sheet>
  );
}

function PanelBody({
  org,
  contractId,
  line,
  canAct,
}: {
  org: string;
  contractId: string;
  line: SupplyLine;
  canAct: boolean;
}) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [sources, setSources] = useState<SourceView[] | null>(null);
  const [results, setResults] = useState<StockResult[] | null>(null);
  const [invoices, setInvoices] = useState<PurchaseOption[] | null>(null);
  const [q, setQ] = useState(line.partNumber || line.description);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [releasing, setReleasing] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [tab, setTab] = useState<"bodega" | "facturas">("bodega");

  const reloadSources = useCallback(() => getLineSupply(line.id).then(setSources), [line.id]);

  // Al abrir: lo reservado y una primera búsqueda con el número de parte de la línea.
  useEffect(() => {
    let alive = true;
    void getLineSupply(line.id).then((r) => alive && setSources(r));
    void searchStock(org, line.partNumber || line.description).then((r) => alive && setResults(r));
    void getPurchaseOptions(contractId, line.partNumber || line.description).then((r) => alive && setInvoices(r));
    return () => {
      alive = false;
    };
  }, [line.id, line.partNumber, line.description, org, contractId]);

  function search(value: string) {
    setQ(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const [stock, inv] = await Promise.all([searchStock(org, value), getPurchaseOptions(contractId, value)]);
      setResults(stock);
      setInvoices(inv);
    }, 250);
  }

  // Lo reservado en bodega y lo comprado por recibir (si ya se cargaron los tramos, de ahí; si no, de la línea).
  const stockQty = sources ? sources.filter((x) => x.kind === "bodega").reduce((s, x) => s + x.quantity, 0) : line.reserved;
  const purchasedQty = sources ? sources.filter((x) => x.kind === "compra").reduce((s, x) => s + x.quantity, 0) : line.purchased;
  const covered = stockQty + purchasedQty;
  const pending = Math.max(0, line.quantity - covered);
  const state =
    line.delivered >= line.quantity
      ? "delivered"
      : covered === 0
        ? "pending"
        : covered < line.quantity
          ? "partial"
          : stockQty >= line.quantity
            ? "in_stock"
            : "purchased";

  function run(key: string, fn: () => Promise<{ error?: string; ok?: boolean } | undefined>) {
    if (busy) return;
    setBusy(key);
    setError(undefined);
    startTransition(async () => {
      const res = await fn();
      if (res?.error) setError(res.error);
      else {
        // Lo reservado y las existencias cambiaron: se vuelven a pedir.
        await reloadSources();
        const [stock, inv] = await Promise.all([searchStock(org, q), getPurchaseOptions(contractId, q)]);
        setResults(stock);
        setInvoices(inv);
      }
      setBusy(null);
      setReleasing(null);
    });
  }

  const inStock = results?.filter((r) => r.onHand > 0) ?? [];
  const noStock = results?.filter((r) => r.onHand === 0) ?? [];
  const TITLE = "flex h-10 items-center border-b px-6 font-mono text-[0.6875rem] font-medium uppercase tracking-[0.12em]";

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {/* Qué línea es y cuánto falta: lo primero que se necesita saber. */}
      <div className="flex flex-col gap-4 border-b p-6">
        <dl className="grid grid-cols-3 gap-px border bg-border [&>div]:bg-background [&>div]:px-3 [&>div]:py-2">
          <div>
            <dt className="font-mono text-[0.6875rem] uppercase tracking-[0.1em] text-muted-foreground">Piden</dt>
            <dd className="num text-xl">{line.quantity} <span className="font-sans text-xs text-muted-foreground">{unitLabel(line.unit)}</span></dd>
          </div>
          <div>
            <dt className="font-mono text-[0.6875rem] uppercase tracking-[0.1em] text-muted-foreground">Cubierto</dt>
            <dd className="num text-xl">{covered}</dd>
          </div>
          <div className={cn(pending > 0 && "bg-brand/10!")}>
            <dt className="font-mono text-[0.6875rem] uppercase tracking-[0.1em] text-muted-foreground">Faltan</dt>
            <dd className={cn("num text-xl", pending > 0 && "text-brand font-medium")}>{pending}</dd>
          </div>
        </dl>
        <div className="flex flex-wrap items-center gap-3">
          <span className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 font-mono text-xs uppercase tracking-[0.06em]", STATE[state].chip)}>
            <span aria-hidden className={cn("size-2", STATE[state].dot)} />
            {STATE[state].label}
          </span>
          <Progress stock={stockQty} purchased={purchasedQty} delivered={line.delivered} total={line.quantity} />
        </div>
      </div>

      {error && (
        <div className="border-b p-4">
          <FieldError>{error}</FieldError>
        </div>
      )}

      {/* Lo ya cubierto: solo si hay algo. */}
      {sources === null ? (
        <p className="border-b p-6 text-sm text-muted-foreground">Cargando…</p>
      ) : (
        sources.length > 0 && (
          <section className="border-b">
            <h3 className={TITLE}>Ya cubierto · {sources.length}</h3>
            <ul className="divide-y">
              {sources.map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-6 py-3">
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate">{s.itemName}</span>
                    <span className="truncate font-mono text-xs text-muted-foreground">
                      {[
                        s.kind === "compra" ? `Factura ${s.invoice} · por recibir` : "En bodega",
                        s.supplier || "Sin proveedor",
                        s.costCents === null ? "sin costo" : formatCents(s.costCents),
                      ].join(" · ")}
                    </span>
                  </div>
                  <span className="num">{s.quantity}</span>
                  {canAct &&
                    (releasing === s.id ? (
                      <span className="flex gap-1">
                        <Button size="sm" variant="destructive" disabled={busy !== null} onClick={() => run(s.id, () => releaseSource(org, contractId, s.id))}>
                          Liberar
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setReleasing(null)}>
                          No
                        </Button>
                      </span>
                    ) : (
                      <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => setReleasing(s.id)}>
                        Liberar
                      </Button>
                    ))}
                </li>
              ))}
            </ul>
          </section>
        )
      )}

      {canAct && (
        <section>
          {pending === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">La línea está cubierta por completo.</p>
          ) : (
            <>
              <div role="tablist" aria-label="De dónde cubrirlo" className="flex divide-x border-b">
                {(
                  [
                    ["bodega", "Desde la bodega", results === null ? null : inStock.length],
                    ["facturas", "Desde facturas", invoices === null ? null : invoices.length],
                  ] as const
                ).map(([key, label, n]) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={tab === key}
                    onClick={() => setTab(key)}
                    className={cn(
                      "flex h-11 flex-1 items-center justify-center gap-2 text-sm transition-colors hover:bg-accent",
                      tab === key ? "bg-background font-medium shadow-[inset_0_-2px_0_var(--brand)]" : "bg-surface-strong/50 text-muted-foreground",
                    )}
                  >
                    {label}
                    {n !== null && <span className="num text-xs text-muted-foreground">{n}</span>}
                  </button>
                ))}
              </div>
              <div className="relative border-b">
                <HugeiconsIcon icon={Search01Icon} aria-hidden className="pointer-events-none absolute top-1/2 left-6 size-5 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="search"
                  aria-label="Buscar producto"
                  placeholder="Número de parte, SKU o nombre"
                  autoComplete="off"
                  value={q}
                  onChange={(e) => search(e.target.value)}
                  className="h-12 w-full bg-transparent pr-4 pl-14 text-sm outline-none placeholder:text-muted-foreground focus-visible:bg-background"
                />
              </div>

              {tab === "bodega" &&
                (results === null ? (
                  <p className="p-6 text-sm text-muted-foreground">Buscando…</p>
                ) : results.length === 0 ? (
                  <div className="flex flex-col items-start gap-3 p-6 text-sm text-muted-foreground">
                    <p>Ningún producto de la bodega coincide con esta búsqueda.</p>
                    <Link
                      href={`/${org}/bodega/nuevo?parte=${encodeURIComponent(line.partNumber)}&nombre=${encodeURIComponent(line.description)}`}
                      target="_blank"
                      className="text-foreground underline underline-offset-4"
                    >
                      Crear el producto en la bodega
                    </Link>
                  </div>
                ) : (
                  <>
                    {inStock.length === 0 && (
                      <p className="border-b p-6 text-sm text-muted-foreground">
                        Hay productos que coinciden, pero ninguno tiene existencias. Cubre la línea con una factura o registra una entrada.
                      </p>
                    )}
                    <ul className="divide-y">
                      {inStock.map((r) => {
                        const matches = line.partNumber && r.partNumbers.some((p) => norm(p) === norm(line.partNumber));
                        return (
                          <li key={r.id} className="flex flex-col gap-3 px-6 py-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex min-w-0 flex-col">
                                <span className="font-medium">{r.name}</span>
                                <span className="font-mono text-xs text-muted-foreground">
                                  {[r.sku, ...r.partNumbers].filter(Boolean).join(" · ") || "Sin SKU ni número de parte"}
                                </span>
                              </div>
                              <div className="flex shrink-0 flex-col items-end gap-1">
                                <span className="num text-sm">{r.onHand} en bodega</span>
                                {matches && (
                                  <span className="bg-brand/10 px-1.5 py-0.5 font-mono text-[0.6875rem] uppercase tracking-[0.08em] text-brand">Mismo n.º de parte</span>
                                )}
                              </div>
                            </div>
                            <ul className="flex flex-col gap-px border bg-border [&>li]:bg-background">
                              {r.lots.map((lot, i) => {
                                const value = qty[lot.id] ?? String(Math.min(lot.remaining, pending));
                                return (
                                  <li key={lot.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2">
                                    <div className="flex min-w-0 flex-1 flex-col">
                                      <span className="truncate text-sm">{lot.supplier || "Sin proveedor"}</span>
                                      <span className="font-mono text-xs text-muted-foreground">
                                        {lot.costCents === null ? "sin costo" : formatCents(lot.costCents)} · quedan{" "}
                                        <span className="num">{lot.remaining}</span>
                                        {i === 0 && lot.costCents !== null && r.lots.length > 1 && " · más barato"}
                                      </span>
                                    </div>
                                    <NumericInput
                                      kind="decimal"
                                      aria-label={`Cantidad a reservar del lote de ${lot.supplier || "sin proveedor"}`}
                                      className="h-8 w-20 font-mono"
                                      value={value}
                                      onChange={(e) => setQty((m) => ({ ...m, [lot.id]: e.target.value }))}
                                    />
                                    <Button
                                      size="sm"
                                      className="h-8"
                                      disabled={busy !== null}
                                      onClick={() => run(lot.id, () => reserveStock(org, contractId, line.id, lot.id, value))}
                                    >
                                      {busy === lot.id ? "Reservando…" : "Reservar"}
                                    </Button>
                                  </li>
                                );
                              })}
                            </ul>
                          </li>
                        );
                      })}
                    </ul>
                    {noStock.length > 0 && (
                      <ul className="divide-y border-t bg-surface-strong/30">
                        {noStock.map((r) => (
                          <li key={r.id} className="flex items-center justify-between gap-3 px-6 py-3 text-sm text-muted-foreground">
                            <span className="min-w-0 truncate">
                              {r.name} <span className="font-mono text-xs">{[r.sku, ...r.partNumbers].filter(Boolean).join(" · ")}</span>
                            </span>
                            <span className="flex shrink-0 items-center gap-3">
                              <span>sin existencias</span>
                              <Link href={`/${org}/bodega/${r.id}`} target="_blank" className="text-foreground underline underline-offset-4">
                                Registrar entrada
                              </Link>
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                ))}

              {tab === "facturas" &&
                (invoices === null ? (
                  <p className="p-6 text-sm text-muted-foreground">Buscando…</p>
                ) : invoices.length === 0 ? (
                  <div className="flex flex-col items-start gap-3 p-6 text-sm text-muted-foreground">
                    <p>Ninguna factura de este contrato tiene este producto sin asignar.</p>
                    <Link href={`/${org}/contratos/${contractId}/compras/nueva`} target="_blank" className="text-foreground underline underline-offset-4">
                      Registrar una factura de compra
                    </Link>
                  </div>
                ) : (
                  <ul className="divide-y">
                    {invoices.map((o) => {
                      const value = qty[`inv:${o.id}`] ?? String(Math.min(o.available, pending));
                      return (
                        <li key={o.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-6 py-3">
                          <div className="flex min-w-0 flex-1 flex-col">
                            <span className="truncate">{o.itemName}</span>
                            <span className="font-mono text-xs text-muted-foreground">
                              Factura {o.invoice} · {o.supplier || "Sin proveedor"} · {formatCents(o.unitCostCents)} · sin asignar{" "}
                              <span className="num">{o.available}</span>
                            </span>
                          </div>
                          <NumericInput
                            kind="decimal"
                            aria-label={`Cantidad a asignar de la factura ${o.invoice}`}
                            className="h-8 w-20 font-mono"
                            value={value}
                            onChange={(e) => setQty((m) => ({ ...m, [`inv:${o.id}`]: e.target.value }))}
                          />
                          <Button
                            size="sm"
                            className="h-8"
                            disabled={busy !== null}
                            onClick={() => run(`inv:${o.id}`, () => assignPurchase(org, contractId, o.id, line.id, value))}
                          >
                            {busy === `inv:${o.id}` ? "Asignando…" : "Asignar"}
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                ))}
            </>
          )}
        </section>
      )}
    </div>
  );
}
