"use client";

import { PanelLoading } from "@/components/panel-loading";
import { ConfirmTap } from "@/components/confirm-tap";
import { useState } from "react";
import { ClipboardCheckIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { Reconcile } from "@/components/use-reconcile";
import { STATE } from "@/components/supply-progress";
import { Button } from "@/components/ui/button";
import { formatCents } from "@/lib/money";
import { releaseSource, type SourceView } from "@/lib/supply-actions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// Liberar, con el gesto de confirmación de la app (un toque arma, otro confirma).
export function ReleaseButtons({ rc, org, contractId, sourceId }: { rc: Reconcile; org: string; contractId: string; sourceId: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <ConfirmTap
      size="xs"
      variant="ghost"
      className="shrink-0 text-muted-foreground hover:text-foreground"
      disabled={busy}
      hint="Toca otra vez para liberar"
      hintSide="top"
      onConfirm={async () => {
        setBusy(true);
        try {
          const res = await releaseSource(org, contractId, sourceId);
          if (res?.error) return void toast.error(res.error);
          toast.success("Liberado.");
          await rc.refresh();
        } finally {
          setBusy(false);
        }
      }}
    >
      Liberar
    </ConfirmTap>
  );
}

// Lo ya asignado a la línea abierta: lo primero que se ve al tocar una fila. Cada producto en una fila de dos líneas
// (nombre y detalle) con su cantidad, su valor unitario y Liberar a la derecha. Sin nada asignado, un aviso con los dos
// caminos para asignar: facturas o bodega.
export function AssignedView({
  rc,
  org,
  contractId,
  sources,
  canAct,
}: {
  rc: Reconcile;
  org: string;
  contractId: string;
  sources: SourceView[] | null;
  canAct: boolean;
}) {
  if (sources === null) return <PanelLoading label="Cargando productos asignados" />;
  if (sources.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-sm font-medium">Esta línea aún no tiene nada asignado</p>
        <p className="max-w-xs text-sm text-muted-foreground">
          {canAct ? "Búscalo en una factura del proceso o entre las existencias de la bodega." : "El proceso debe estar En ejecución para asignar productos."}
        </p>
        {canAct && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => rc.setSource("facturas")}>
              Ir a facturas
            </Button>
            <Button variant="outline" onClick={() => rc.setSource("bodega")}>
              Ir a bodega
            </Button>
          </div>
        )}
      </div>
    );
  }
  const units = sources.reduce((sum, x) => sum + x.quantity, 0);
  const total = sources.reduce((sum, x) => sum + (x.costCents === null ? 0 : Math.round(x.costCents * x.quantity)), 0);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Misma fila de resumen que Cotizaciones, Facturas y Bodega: título, una línea de detalle y el mismo fondo. */}
      <div className="flex h-14 shrink-0 items-center gap-3 border-b bg-surface-strong px-4">
        <HugeiconsIcon icon={ClipboardCheckIcon} aria-hidden className="size-6 shrink-0 text-muted-foreground" />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium">Asignado a la línea</span>
          <span className="truncate font-mono text-xs text-muted-foreground">
            <span className="num">{sources.length}</span> {sources.length === 1 ? "producto" : "productos"} ·{" "}
            <span className="num">{units}</span> {units === 1 ? "unidad" : "unidades"} · <span className="num">{formatCents(total)}</span>
          </span>
        </div>
      </div>
      <ul className="min-h-0 flex-1 divide-y overflow-y-auto">
        {sources.map((s) => (
          // Nombre primero y, debajo, el código; después el origen con Liberar.
          <li key={s.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-1 px-4 py-3.5">
            <span className="line-clamp-2 text-sm font-medium" title={s.itemName}>
              {s.itemName}
            </span>
            <span className="num text-right font-mono text-sm">{s.quantity}</span>
            <span className={cn("truncate font-mono text-xs text-muted-foreground", ![s.itemSku, ...s.partNumbers].some(Boolean) && "opacity-70")}>
              {[s.itemSku, ...s.partNumbers].filter(Boolean).join(" · ") || "Sin código"}
            </span>
            <span className="num text-right text-xs text-muted-foreground">
              {s.costCents === null ? "Sin costo" : `${formatCents(s.costCents)} c/u`}
            </span>
            <span className="flex min-h-7 items-center gap-1.5 text-xs text-muted-foreground">
              <span aria-hidden className={cn("size-2 shrink-0 rounded-full", s.kind === "compra" ? STATE.purchased.dot : STATE.in_stock.dot)} />
              <span className="truncate">
                {s.kind === "compra" ? `Por llegar · factura ${s.invoice}` : "De la bodega"}
                {s.supplier ? ` · ${s.supplier}` : ""}
              </span>
            </span>
            {canAct ? (
              <span className="justify-self-end">
                <ReleaseButtons rc={rc} org={org} contractId={contractId} sourceId={s.id} />
              </span>
            ) : (
              <span />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
