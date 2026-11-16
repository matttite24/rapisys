"use client";

import { PanelLoading } from "@/components/panel-loading";
import { useEffect, useRef, useState } from "react";
import { AiMagicIcon, ArrowRight01Icon, Exchange01Icon, Invoice01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { Reconcile } from "@/components/use-reconcile";
import { STATE } from "@/components/supply-progress";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatCents } from "@/lib/money";
import type { InvoiceLine } from "@/lib/reconcile-actions";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { cn } from "@/lib/utils";
import { Target, covered, normCode } from "@/components/reconcile-shared";
import { PanelError, SearchRow } from "@/components/reconcile-parts";
import { useEnterToAssign } from "@/components/use-enter-to-assign";
import { GroupBar } from "@/components/reconcile-group-bar";
import { AssignTo } from "@/components/reconcile-assign";

export function InvoiceMode({ rc, target, partNumber }: { rc: Reconcile; target: Target; partNumber: string }) {
  useEnterToAssign(rc, target);
  const [filter, setFilter] = useState("");
  const [showCovered, setShowCovered] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  const invoice = rc.invoices?.find((i) => i.id === rc.invoiceId) ?? null;
  // El campo responde al instante; la lista (hasta cientos de líneas) se refiltra cuando se deja de escribir.
  const term = useDebouncedValue(filter).trim().toLowerCase();
  const matching = (rc.lines ?? []).filter(
    (l) => !term || [l.name, l.code, l.sku, ...l.partNumbers].some((v) => v && v.toLowerCase().includes(term)),
  );
  // Tres grupos: las que coinciden con el número de parte de la línea abierta, el resto por asignar, y las ya cubiertas
  // (plegadas). El teclado recorre las filas en el mismo orden en que se ven.
  const sameCode = (l: InvoiceLine) => !!partNumber && [l.code, l.sku, ...l.partNumbers].some((c) => c && normCode(c) === normCode(partNumber));
  const suggested = matching.filter((l) => !covered(l) && sameCode(l));
  const others = matching.filter((l) => !covered(l) && !sameCode(l));
  const coveredLines = matching.filter(covered);
  const visible = [...suggested, ...others, ...(showCovered ? coveredLines : [])];

  const pickedId = rc.picked?.id;
  useEffect(() => {
    if (pickedId) document.getElementById(`rc-line-${pickedId}`)?.scrollIntoView({ block: "nearest" });
  }, [pickedId]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.altKey || e.ctrlKey || e.metaKey || !rc.invoiceId || rc.review) {
      if (rc.review && e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        rc.cancelReview();
      }
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const at = visible.findIndex((l) => l.id === rc.picked?.id);
      const next = e.key === "ArrowDown" ? visible[at + 1] ?? (at < 0 ? visible[0] : undefined) : visible[at - 1];
      if (next) rc.pick(next);
    } else if (e.key === "Escape" && rc.picked) {
      e.preventDefault();
      e.stopPropagation();
      rc.pick(null);
    }
  }

  // Sin factura elegida: la lista completa, para elegir sin buscar.
  if (!rc.invoiceId) {
    return (
      rc.invoiceError ? <PanelError message={rc.invoiceError} onRetry={() => void rc.loadInvoices(true)} /> :
      rc.invoices === null ? <PanelLoading label="Cargando facturas" /> :
      <ul className="min-h-0 flex-1 divide-y overflow-y-auto">
        {rc.invoices.length === 0 ? (
          <li className="px-4 py-4 text-sm text-muted-foreground">Este proceso aún no tiene facturas completas.</li>
        ) : (
          rc.invoices.map((i) => (
            <li key={i.id}>
              <button
                type="button"
                className="flex w-full flex-col items-start px-4 py-3 text-left hover:bg-accent"
                onClick={() => void rc.chooseInvoice(i.id)}
              >
                <span className="font-mono text-sm">{i.number}</span>
                <span className="text-xs text-muted-foreground">{i.supplier || "Sin proveedor"}</span>
              </button>
            </li>
          ))
        )}
      </ul>
    );
  }

  return (
    <div ref={root} onKeyDown={onKeyDown} className="flex min-h-0 flex-1 flex-col">
      {/* Mismo alto que la fila de datos del activo de la izquierda (3,5 rem). */}
      <div className="flex h-14 shrink-0 items-center gap-3 border-b bg-surface-strong px-4">
        <HugeiconsIcon icon={Invoice01Icon} aria-hidden className="size-6 shrink-0 text-muted-foreground" />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium">{invoice?.supplier || "Sin proveedor"}</span>
          <span className="truncate font-mono text-xs text-muted-foreground">
            {invoice?.number} · {rc.lines === null ? "…" : rc.lines.length} {rc.lines?.length === 1 ? "ítem" : "ítems"}
          </span>
        </div>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="outline"
                size="icon"
                className="size-9 shrink-0"
                aria-label="Cambiar de factura"
                onClick={() => {
                  setFilter("");
                  void rc.chooseInvoice("");
                }}
              />
            }
          >
            <HugeiconsIcon icon={Exchange01Icon} className="size-4" />
          </TooltipTrigger>
          <TooltipContent>Cambiar de factura</TooltipContent>
        </Tooltip>
      </div>
      {rc.review ? (
        <ReviewList rc={rc} />
      ) : (
        <>
          <SearchRow label="Buscar en la factura" placeholder="Código o nombre" value={filter} onChange={setFilter} autoFocus>
            {rc.lines && rc.lines.some((l) => l.free > 0) && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-9 text-foreground hover:text-foreground"
                      aria-label="Cubrir coincidencias automáticamente"
                      disabled={rc.proposing}
                      onClick={() => void rc.propose()}
                    />
                  }
                >
                  <HugeiconsIcon icon={AiMagicIcon} className={cn("size-5", rc.proposing && "animate-pulse")} />
                </TooltipTrigger>
                <TooltipContent>Cubrir automáticamente: cruza esta factura con el proceso por número de parte y te deja revisar antes de asignar</TooltipContent>
              </Tooltip>
            )}
          </SearchRow>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {rc.invoiceLinesError ? (
              <PanelError message={rc.invoiceLinesError} onRetry={() => void rc.chooseInvoice(rc.invoiceId)} />
            ) : rc.lines === null ? (
              <PanelLoading label="Cargando productos de la factura" />
            ) : matching.length === 0 ? (
              <p className="px-4 py-4 text-sm text-muted-foreground">Ninguna línea coincide.</p>
            ) : (
              <>
                {suggested.length > 0 && (
                  <>
                    <GroupBar label="Coinciden con esta línea" count={suggested.length} accent />
                    <ul className="divide-y">
                      {suggested.map((l) => (
                        <LineRow key={l.id} rc={rc} line={l} target={target} />
                      ))}
                    </ul>
                  </>
                )}
                {others.length > 0 && (
                  <>
                    <GroupBar label="De la factura" count={others.length} />
                    <ul className="divide-y">
                      {others.map((l) => (
                        <LineRow key={l.id} rc={rc} line={l} target={target} />
                      ))}
                    </ul>
                  </>
                )}
                {coveredLines.length > 0 && (
                  <>
                    <button
                      type="button"
                      aria-expanded={showCovered}
                      onClick={() => setShowCovered((v) => !v)}
                      className="flex h-10 w-full items-center gap-2 border-y bg-surface-strong/60 px-4 text-left caps text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <HugeiconsIcon icon={ArrowRight01Icon} aria-hidden className={cn("size-3.5 transition-transform", showCovered && "rotate-90")} />
                      {coveredLines.length} {coveredLines.length === 1 ? "cubierta" : "cubiertas"}
                    </button>
                    {showCovered && (
                      <ul className="divide-y">
                        {coveredLines.map((l) => (
                          <LineRow key={l.id} rc={rc} line={l} target={target} />
                        ))}
                      </ul>
                    )}
                  </>
                )}
                {suggested.length + others.length === 0 && coveredLines.length > 0 && (
                  <p className="px-4 py-4 text-sm text-muted-foreground">Toda la factura está cubierta.</p>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// Revisión de lo que el sistema cruzó por número de parte: se desmarca lo que no sea y se cubre todo junto.
export function ReviewList({ rc }: { rc: Reconcile }) {
  const review = rc.review;
  if (!review) return null;
  const chosen = review.proposals.filter((p) => !review.skipped.has(p.key)).length;
  return (
    <>
      <div className="shrink-0 border-b px-4 py-3">
        <p className="text-sm">
          <span className="num font-medium">{review.proposals.length}</span> asignaciones propuestas por número de parte.
        </p>
        {review.unmatched > 0 && (
          <p className="mt-1 text-xs text-muted-foreground">
            {review.unmatched} {review.unmatched === 1 ? "línea sin coincidencia queda" : "líneas sin coincidencia quedan"} para resolver a mano.
          </p>
        )}
        <div className="mt-3 flex items-center gap-2">
          <Button size="sm" disabled={rc.busy || chosen === 0} onClick={() => void rc.applyReview()}>
            {rc.busy ? "Asignando…" : `Asignar ${chosen}`}
          </Button>
          <Button size="sm" variant="ghost" disabled={rc.busy} onClick={rc.cancelReview}>
            Cancelar
          </Button>
        </div>
      </div>
      <ul className="min-h-0 flex-1 divide-y overflow-y-auto">
        {review.proposals.map((p) => {
          const on = !review.skipped.has(p.key);
          return (
            <li key={p.key}>
              <label className={cn("flex cursor-pointer items-start gap-3 px-4 py-2.5 hover:bg-accent/60", !on && "opacity-50")}>
                <input type="checkbox" className="mt-1 size-4 shrink-0 accent-foreground" checked={on} onChange={() => rc.toggleProposal(p.key)} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm" title={p.name}>
                    {p.name}
                  </span>
                  <span className="truncate font-mono text-xs text-muted-foreground">
                    {p.code || "—"} → Línea {p.targetN} · {p.listName} · {p.lotId ? "asigna de la bodega" : "reserva por llegar"}
                  </span>
                </span>
                <span className="num shrink-0 text-sm">{p.qty}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </>
  );
}

// Existencias de una línea de factura, con un punto del color de su origen: verde en la bodega, azul por llegar.
export function StockBadge({ line: l }: { line: InvoiceLine }) {
  if (covered(l)) return <span className="font-mono text-xs text-foreground">✓</span>;
  return (
    <span className="num flex shrink-0 items-center gap-3 font-mono text-sm">
      {l.inStock > 0 && (
        <span className="flex items-center gap-1.5" title={`${l.inStock} en la bodega`}>
          <span aria-hidden className={cn("size-2 rounded-full", STATE.in_stock.dot)} />
          {l.inStock}
        </span>
      )}
      {l.available > 0 && (
        <span className="flex items-center gap-1.5" title={`${l.available} por llegar`}>
          <span aria-hidden className={cn("size-2 rounded-full", STATE.purchased.dot)} />
          {l.available}
        </span>
      )}
    </span>
  );
}

// Línea de factura: el código manda (es lo que cruza con la línea del proceso), con sus existencias a la derecha, y la
// descripción debajo, atenuada.
export function LineRow({ rc, line: l, target }: { rc: Reconcile; line: InvoiceLine; target: Target }) {
  const selected = rc.picked?.id === l.id;
  const done = covered(l);
  return (
    <li id={`rc-line-${l.id}`} className={cn(selected && "bg-accent/60", done && !selected && "opacity-60")}>
      <button
        type="button"
        aria-pressed={selected}
        onClick={() => rc.pick(selected ? null : l)}
        className={cn("flex w-full flex-col gap-1 px-4 py-3.5 text-left hover:bg-accent/60", selected && "shadow-[inset_4px_0_0_var(--primary)]")}
      >
        <span className="flex items-center justify-between gap-3">
          <span className={cn("truncate font-mono text-sm font-medium", !l.code && "font-normal text-muted-foreground")} title={l.code}>
            {l.code || "Sin código"}
          </span>
          <StockBadge line={l} />
        </span>
        <span className="flex items-baseline justify-between gap-3">
          <span className="truncate text-xs text-muted-foreground" title={l.name}>
            {l.name}
          </span>
          {/* Precio unitario de la factura (sin IVA), para compararlo con lo que paga el proceso. */}
          <span className="num shrink-0 text-xs text-muted-foreground">{formatCents(l.unitCostCents)}</span>
        </span>
      </button>
      {selected && <AssignTo rc={rc} target={target} />}
    </li>
  );
}
