"use client";

import { SelectableRow } from "@/components/selectable-row";
import { useState } from "react";
import { PanelLoading } from "@/components/panel-loading";
import { Archive02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { Reconcile } from "@/components/use-reconcile";
import { STATE } from "@/components/supply-progress";
import { formatCents } from "@/lib/money";
import { type StockResult } from "@/lib/supply-actions";
import { cn } from "@/lib/utils";
import { Target, codesOf, normCode } from "@/components/reconcile-shared";
import { PanelError, SearchRow } from "@/components/reconcile-parts";
import { useEnterToAssign } from "@/components/use-enter-to-assign";
import { GroupBar } from "@/components/reconcile-group-bar";
import { AssignTo } from "@/components/reconcile-assign";

export function StockMode({ rc, target, partNumber }: { rc: Reconcile; target: Target; partNumber: string }) {
  useEnterToAssign(rc, target);
  const rows = rc.stockRows;
  // Igual que en la lista de la factura: arriba lo que coincide con el número de parte de la línea abierta, y luego el resto.
  const sameCode = (r: StockResult) => !!partNumber && [r.sku, ...r.partNumbers].some((c) => c && normCode(c) === normCode(partNumber));
  const stocked = (rows ?? []).filter((r) => r.onHand > 0);
  const suggested = stocked.filter(sameCode);
  const others = stocked.filter((r) => !sameCode(r));
  const withStock = [...suggested, ...others];
  // Productos que coinciden pero no tienen existencias: se pueden ver u ocultar (no se pueden asignar).
  const [showEmpty, setShowEmpty] = useState(true);
  const empty = (rows ?? []).filter((r) => r.onHand <= 0);
  const emptySorted = [...empty.filter(sameCode), ...empty.filter((r) => !sameCode(r))];

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const at = withStock.findIndex((r) => r.id === rc.stockPicked?.id);
      const next = e.key === "ArrowDown" ? withStock[at + 1] ?? (at < 0 ? withStock[0] : undefined) : withStock[at - 1];
      if (next) rc.pickStock(next);
    } else if (e.key === "Escape" && rc.stockPicked) {
      e.preventDefault();
      e.stopPropagation();
      rc.pickStock(null);
    }
  }

  return (
    <div onKeyDown={onKeyDown} className="flex min-h-0 flex-1 flex-col">
      {/* Mismo alto y forma que la fila de la factura elegida: qué hay en la bodega, en cifras. */}
      <div className="flex h-14 shrink-0 items-center gap-3 border-b bg-surface-strong px-4">
        <HugeiconsIcon icon={Archive02Icon} aria-hidden className="size-6 shrink-0 text-muted-foreground" />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium">Bodega</span>
          <span className="truncate font-mono text-xs text-muted-foreground">
            {rc.stockSummaryError ? (
              "Resumen no disponible"
            ) : rc.stockSummary === null ? (
              "Cargando existencias…"
            ) : (
              <>
                <span className="num">{rc.stockSummary.products}</span> {rc.stockSummary.products === 1 ? "producto" : "productos"} ·{" "}
                <span className="num">{rc.stockSummary.units}</span> {rc.stockSummary.units === 1 ? "unidad" : "unidades"} en existencia
              </>
            )}
          </span>
        </div>
      </div>
      {rc.stockSummaryError && <PanelError message={rc.stockSummaryError} onRetry={() => void rc.loadStockSummary(true)} />}
      <SearchRow label="Buscar en la bodega" placeholder="Número de parte, SKU o nombre" value={rc.stockQ} onChange={rc.searchStockText} autoFocus />
      {empty.length > 0 && rc.stockQ.trim() && (
        <label className="flex shrink-0 cursor-pointer items-center justify-between gap-3 border-b px-4 py-2 text-xs text-muted-foreground">
          <span>
            Sin existencias <span className="num">({empty.length})</span>
          </span>
          <span className="flex items-center gap-2">
            {showEmpty ? "Mostrando" : "Ocultos"}
            <button
              type="button"
              role="switch"
              aria-checked={showEmpty}
              aria-label="Mostrar productos sin existencias"
              onClick={() => setShowEmpty((v) => !v)}
              className={cn("relative block h-5 w-9 shrink-0 rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none", showEmpty ? "bg-foreground" : "bg-foreground/25")}
            >
              <span aria-hidden className={cn("absolute top-0.5 left-0.5 size-4 rounded-full bg-background shadow transition-transform", showEmpty && "translate-x-4")} />
            </button>
          </span>
        </label>
      )}
      <div aria-busy={rc.stockLoading} className="min-h-0 flex-1 overflow-y-auto">
        {!rc.stockQ.trim() ? (
          <p className="px-4 py-4 text-sm text-muted-foreground">Escribe un número de parte, SKU o nombre.</p>
        ) : rc.stockError ? (
          <PanelError message={rc.stockError} onRetry={() => rc.searchStockText(rc.stockQ)} />
        ) : rc.stockLoading || rows === null ? (
          <PanelLoading label="Buscando productos en bodega" />
        ) : rows.length === 0 ? (
          <p className="px-4 py-4 text-sm text-muted-foreground">Ningún producto de la bodega coincide.</p>
        ) : withStock.length === 0 && !(showEmpty && empty.length > 0) ? (
          <p className="px-4 py-4 text-sm text-muted-foreground">
            {empty.length === 1 ? "Hay un producto que coincide" : `Hay ${empty.length} productos que coinciden`}, pero {empty.length === 1 ? "no tiene" : "ninguno tiene"} existencias. Activa «Sin existencias» para verlos.
          </p>
        ) : (
          <>
            {suggested.length > 0 && (
              <>
                <GroupBar label="Coinciden con esta línea" count={suggested.length} accent />
                <ul className="divide-y">
                  {suggested.map((r) => (
                    <StockRow key={r.id} rc={rc} row={r} target={target} />
                  ))}
                </ul>
              </>
            )}
            {others.length > 0 && (
              <>
                <GroupBar label="En la bodega" count={others.length} />
                <ul className="divide-y">
                  {others.map((r) => (
                    <StockRow key={r.id} rc={rc} row={r} target={target} />
                  ))}
                </ul>
              </>
            )}
            {showEmpty && emptySorted.length > 0 && (
              <>
                <GroupBar label="Sin existencias" count={emptySorted.length} />
                <ul className="divide-y">
                  {emptySorted.map((r) => (
                    <EmptyStockRow key={r.id} row={r} />
                  ))}
                </ul>
              </>
            )}
            {rc.stockMore && <p className="border-t px-4 py-3 text-xs text-muted-foreground">Hay más productos que coinciden. Escribe más para afinar.</p>}
          </>
        )}
      </div>
    </div>
  );
}

// Producto de la bodega con el mismo formato que una línea de factura: el código manda, con sus existencias a la derecha
// (punto verde), y el nombre debajo, atenuado.
export function StockRow({ rc, row: r, target }: { rc: Reconcile; row: StockResult; target: Target }) {
  const selected = rc.stockPicked?.id === r.id;
  return (
    <li className={cn(selected && "bg-accent/60")}>
      <SelectableRow
        selected={selected}
        onActivate={() => rc.pickStock(selected ? null : r)}
        className={cn("flex w-full flex-col gap-1 px-4 py-3.5 text-left hover:bg-accent/60", selected && "shadow-[inset_4px_0_0_var(--primary)]")}
      >
        <span className="flex items-center justify-between gap-3">
          <span className={cn("truncate font-mono text-sm font-medium", !codesOf(r) && "font-normal text-muted-foreground")} title={codesOf(r)}>
            {codesOf(r) || "Sin código"}
          </span>
          <span className="num flex shrink-0 items-center gap-1.5 font-mono text-sm" title={`${r.onHand} en la bodega`}>
            <span aria-hidden className={cn("size-2 rounded-full", STATE.in_stock.dot)} />
            {r.onHand}
          </span>
        </span>
        <span className="flex items-baseline justify-between gap-3">
          <span className="truncate text-xs text-muted-foreground" title={r.name}>
            {r.name}
          </span>
          {/* Costo unitario: el del lote más barato; con lotes de distinto costo se dice "desde". */}
          <span className="num shrink-0 text-xs text-muted-foreground">
            {(() => {
              const costs = r.lots.filter((l) => l.costCents !== null).map((l) => l.costCents as number);
              if (costs.length === 0) return "Sin costo";
              const min = Math.min(...costs);
              return `${new Set(costs).size > 1 ? "desde " : ""}${formatCents(min)}`;
            })()}
          </span>
        </span>
      </SelectableRow>
      {selected && <AssignTo rc={rc} target={target} />}
    </li>
  );
}

// Producto de la bodega sin existencias: se ve para saber que existe, pero no se puede asignar.
function EmptyStockRow({ row: r }: { row: StockResult }) {
  return (
    <li className="flex flex-col gap-1 px-4 py-3.5 text-muted-foreground">
      <span className="flex items-center justify-between gap-3">
        <span className={cn("truncate font-mono text-sm", !codesOf(r) && "font-normal")} title={codesOf(r)}>
          {codesOf(r) || "Sin código"}
        </span>
        <span className="flex shrink-0 items-center gap-1.5 font-mono text-sm" title="Sin existencias en la bodega">
          <span aria-hidden className={cn("size-2 rounded-full", STATE.pending.dot)} />
          <span className="num">0</span>
        </span>
      </span>
      <span className="truncate text-xs" title={r.name}>{r.name}</span>
    </li>
  );
}
