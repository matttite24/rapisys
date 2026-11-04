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
      <SheetContent className="gap-0 sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{line ? `Línea ${line.n}` : "Línea"}</SheetTitle>
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
  const [q, setQ] = useState(line.partNumber || line.description);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [releasing, setReleasing] = useState<string | null>(null);
  const [error, setError] = useState<string>();

  const reloadSources = useCallback(() => getLineSupply(line.id).then(setSources), [line.id]);

  // Al abrir: lo reservado y una primera búsqueda con el número de parte de la línea.
  useEffect(() => {
    let alive = true;
    void getLineSupply(line.id).then((r) => alive && setSources(r));
    void searchStock(org, line.partNumber || line.description).then((r) => alive && setResults(r));
    return () => {
      alive = false;
    };
  }, [line.id, line.partNumber, line.description, org]);

  function search(value: string) {
    setQ(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => setResults(await searchStock(org, value)), 250);
  }

  const reserved = sources ? sources.reduce((s, x) => s + x.quantity, 0) : line.reserved;
  const pending = Math.max(0, line.quantity - reserved);
  const state = reserved === 0 ? "pending" : reserved < line.quantity ? "partial" : "in_stock";

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
        setResults(await searchStock(org, q));
      }
      setBusy(null);
      setReleasing(null);
    });
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="flex flex-col gap-3 border-b p-6">
        <div className="flex flex-col gap-1">
          <span className="font-mono text-xs text-muted-foreground">{line.partNumber || "Sin número de parte"}</span>
          <span className="text-base font-medium">{line.description}</span>
        </div>
        <p className="text-sm text-muted-foreground">
          Piden <span className="num text-foreground">{line.quantity}</span> {unitLabel(line.unit).toLowerCase()}
          {line.quantity === 1 ? "" : "s"}
        </p>
        <Progress done={reserved} total={line.quantity} />
        <span className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.06em]">
          <span aria-hidden className={cn("size-2", STATE[state].dot)} />
          {STATE[state].label}
        </span>
      </div>

      {error && (
        <div className="border-b p-4">
          <FieldError>{error}</FieldError>
        </div>
      )}

      <section className="border-b">
        <h3 className="flex h-10 items-center border-b px-6 font-mono text-[0.6875rem] font-medium uppercase tracking-[0.12em]">
          Reservado para esta línea
        </h3>
        {sources === null ? (
          <p className="p-6 text-sm text-muted-foreground">Cargando…</p>
        ) : sources.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">Aún no se reservó nada.</p>
        ) : (
          <ul className="divide-y">
            {sources.map((s) => (
              <li key={s.id} className="flex items-center gap-3 px-6 py-3">
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">{s.itemName}</span>
                  <span className="truncate font-mono text-xs text-muted-foreground">
                    {[s.itemSku, s.supplier || "Sin proveedor", s.costCents === null ? "sin costo" : formatCents(s.costCents)]
                      .filter(Boolean)
                      .join(" · ")}
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
        )}
      </section>

      {canAct && (
        <section>
          <h3 className="flex h-10 items-center border-b px-6 font-mono text-[0.6875rem] font-medium uppercase tracking-[0.12em]">
            Buscar en la bodega
          </h3>
          <div className="relative border-b">
            <HugeiconsIcon icon={Search01Icon} aria-hidden className="pointer-events-none absolute top-1/2 left-6 size-5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              aria-label="Buscar en la bodega"
              placeholder="Número de parte, SKU o nombre"
              autoComplete="off"
              value={q}
              onChange={(e) => search(e.target.value)}
              className="h-12 w-full bg-transparent pr-4 pl-14 text-sm outline-none placeholder:text-muted-foreground focus-visible:bg-background"
            />
          </div>

          {pending === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">La línea está cubierta por completo.</p>
          ) : results === null ? (
            <p className="p-6 text-sm text-muted-foreground">Buscando…</p>
          ) : results.length === 0 ? (
            <div className="flex flex-col items-start gap-3 p-6 text-sm text-muted-foreground">
              <p>Ningún producto de la bodega coincide.</p>
              <Link
                href={`/${org}/bodega/nuevo?parte=${encodeURIComponent(line.partNumber)}&nombre=${encodeURIComponent(line.description)}`}
                target="_blank"
                className="text-foreground underline underline-offset-4"
              >
                Crear el producto en la bodega
              </Link>
            </div>
          ) : (
            <ul className="divide-y">
              {results.map((r) => {
                const matches = line.partNumber && r.partNumbers.some((p) => norm(p) === norm(line.partNumber));
                return (
                  <li key={r.id} className="flex flex-col gap-2 px-6 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 flex-col">
                        <span className="font-medium">{r.name}</span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {[r.sku, ...r.partNumbers].filter(Boolean).join(" · ") || "Sin SKU ni número de parte"}
                        </span>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span className={cn("num text-sm", r.onHand === 0 && "text-muted-foreground")}>{r.onHand} en bodega</span>
                        {matches && (
                          <span className="font-mono text-[0.6875rem] uppercase tracking-[0.08em] text-brand">Mismo número de parte</span>
                        )}
                      </div>
                    </div>
                    {r.lots.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        Sin existencias.{" "}
                        <Link href={`/${org}/bodega/${r.id}`} target="_blank" className="underline underline-offset-4">
                          Registrar una entrada
                        </Link>
                      </p>
                    ) : (
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
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
