"use client";

import { PanelLoading } from "@/components/panel-loading";
import { startTransition, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DeliveryTruck01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { DatePicker, toIsoDate } from "@/components/date-picker";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { unitLabel } from "@/lib/units";
import { createDelivery, getDeliverable, type Deliverable } from "@/lib/delivery-actions";
import { cn } from "@/lib/utils";

// Columnas de la lista de entrega: casilla, N.º, ítem (o producto), n.º de parte, SKU, proveedor y cantidad.
const COLS = "2.25rem 2.5rem minmax(14rem, 2fr) minmax(8rem, 1fr) minmax(7rem, 1fr) minmax(8rem, 1fr) 6.5rem";
const ROW = "grid gap-x-3";

// Generar una entrega: botón discreto en la fila de pestañas de las listas, y el cajón donde se arma.
export function DeliveryActions({
  contractId,
  org,
  listId,
  listName,
  canAct,
  ready,
}: {
  org: string;
  contractId: string;
  listId: string;
  listName: string;
  canAct: boolean;
  // Líneas con su stock completo, listas para entregar.
  ready: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {canAct && (
        <span title={ready === 0 ? "Aún ninguna línea tiene todo asignado de la bodega" : undefined}>
          <Button variant="ghost" size="sm" className="gap-2" disabled={ready === 0} onClick={() => setOpen(true)}>
            <HugeiconsIcon icon={DeliveryTruck01Icon} className="size-4" />
            Generar entrega{ready > 0 && <span className="num opacity-70">{ready}</span>}
          </Button>
        </span>
      )}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="data-[side=bottom]:h-[92svh] gap-0">
          <SheetHeader>
            <SheetTitle>Nueva entrega · {listName}</SheetTitle>
            <SheetDescription className="sr-only">
              Elige las líneas completas, con todo su stock, que se entregan ahora y genera el reporte de entrega.
            </SheetDescription>
          </SheetHeader>
          {open && <DeliveryBody key={listId} org={org} contractId={contractId} listId={listId} onClose={() => setOpen(false)} />}
        </SheetContent>
      </Sheet>
    </>
  );
}

function today() {
  return toIsoDate(new Date());
}

function DeliveryBody({
  org,
  contractId,
  listId,
  onClose,
}: {
  org: string;
  contractId: string;
  listId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Deliverable[] | null>(null);
  // Qué líneas van (siempre completas).
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [date, setDate] = useState(today);
  const [receivedBy, setReceivedBy] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [loadError, setLoadError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let alive = true;
    void getDeliverable(contractId, listId).then((r) => {
      if (!alive) return;
      setRows(r);
      // Por defecto, todo lo que está listo.
      setPicked(new Set(r.map((x) => x.id)));
    }).catch(() => { if (alive) setLoadError("No se pudieron cargar las líneas y sus productos. Inténtalo de nuevo."); });
    return () => {
      alive = false;
    };
  }, [contractId, listId, retry]);

  const selected = useMemo(() => (rows ?? []).filter((r) => picked.has(r.id)), [rows, picked]);
  const units = selected.reduce((s, r) => s + r.quantity, 0);
  const allPicked = rows !== null && rows.length > 0 && selected.length === rows.length;

  function toggle(r: Deliverable) {
    setPicked((p) => {
      const next = new Set(p);
      if (!next.delete(r.id)) next.add(r.id);
      return next;
    });
  }

  function submit() {
    if (saving) return;
    setError(undefined);
    setSaving(true);
    startTransition(async () => {
      try {
        const res = await createDelivery(org, contractId, listId, {
          date, receivedBy: receivedBy.trim(), notes: notes.trim(), lineIds: selected.map((r) => r.id),
        });
        if (res?.id) {
          onClose();
          router.push(`/${org}/contratos/${contractId}/entregas/${res.id}`);
        } else setError(res?.error ?? "No se pudo generar la entrega.");
      } catch {
        setError("No se pudo generar la entrega. Inténtalo de nuevo.");
      } finally { setSaving(false); }
    });
  }

  return (
    <>
      <div className="relative min-h-0 flex-1 overflow-y-auto">
        <div className="grid gap-4 border-b bg-surface-strong px-6 py-4 md:grid-cols-[12rem_1fr_2fr] [&_input]:bg-background">
          <FormField name="delivery_date" label="Fecha de entrega">
            {(a11y) => <DatePicker {...a11y} name="delivery_date" value={date} onChange={setDate} />}
          </FormField>
          <FormField name="received_by" label="Recibe (opcional)">
            {(a11y) => (
              <Input {...a11y} autoComplete="off" maxLength={200} value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)} />
            )}
          </FormField>
          <FormField name="notes" label="Notas (opcional)">
            {(a11y) => <Input {...a11y} autoComplete="off" maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />}
          </FormField>
        </div>

        {loadError ? (
          <div role="alert" className="space-y-3 p-6">
            <p className="text-sm text-destructive">{loadError}</p>
            <Button variant="outline" onClick={() => { setLoadError(""); setRows(null); setRetry((n) => n + 1); }}>Reintentar</Button>
          </div>
        ) : rows === null ? (
          <PanelLoading label="Cargando líneas y productos para entregar" />
        ) : rows.length === 0 ? (
          <p className="max-w-xl p-6 text-muted-foreground">
            Ninguna línea de esta lista está lista para entregar. Una línea se entrega completa, cuando todas sus
            unidades están en stock: reserva existencias de la bodega en Abastecimiento y vuelve aquí.
          </p>
        ) : (
          <div className="overflow-x-auto">
            {/* Misma forma que la lista de Abastecimiento: cabecera gris y, por línea, un bloque redondeado. Los datos van en
                columnas que reparten el ancho de la pantalla (ítem, n.º de parte, SKU, proveedor y cantidad), no apilados. */}
            <div role="table" aria-label="Líneas listas para entregar" className="min-w-[58rem] text-sm">
              <div role="row" style={{ gridTemplateColumns: COLS }} className={cn(ROW, "sticky top-0 z-10 h-10 items-center bg-surface-strong px-6 text-xs font-medium text-muted-foreground")}>
                <div role="columnheader">
                  <input
                    disabled={saving}
                    type="checkbox"
                    aria-label="Elegir todas las líneas"
                    className="size-4 accent-brand"
                    checked={allPicked}
                    onChange={() => setPicked(allPicked ? new Set() : new Set(rows.map((r) => r.id)))}
                  />
                </div>
                <div role="columnheader" className="text-right">N.º</div>
                <div role="columnheader">Ítem solicitado y productos a entregar</div>
                <div role="columnheader">N.º de parte</div>
                <div role="columnheader">SKU</div>
                <div role="columnheader">Proveedor</div>
                <div role="columnheader" className="text-right">Cantidad</div>
              </div>
              <div role="rowgroup" className="flex flex-col gap-1.5 px-3 pt-1.5 pb-3">
                {rows.map((r) => {
                  const on = picked.has(r.id);
                  const unit = unitLabel(r.unit);
                  return (
                    <div key={r.id} role="rowgroup" className={cn("overflow-hidden rounded-xl bg-foreground/[0.035] transition-opacity", !on && "opacity-60")}>
                      <div role="row" style={{ gridTemplateColumns: COLS }} className={cn(ROW, "items-start px-3 py-3")}>
                        <div role="cell" className="pt-0.5">
                          <input
                            type="checkbox"
                            disabled={saving}
                            aria-label={`Entregar la línea ${r.n}`}
                            className="size-4 accent-brand"
                            checked={on}
                            onChange={() => toggle(r)}
                          />
                        </div>
                        <div role="cell" className="num pt-0.5 text-right text-muted-foreground">{r.n}</div>
                        <div role="cell" className="min-w-0 font-medium break-words">{r.description}</div>
                        <div role="cell" className="font-mono text-xs break-words text-muted-foreground">{r.partNumber || "—"}</div>
                        <div role="cell" />
                        <div role="cell" />
                        <div role="cell" className="num text-right font-medium whitespace-nowrap">
                          {r.quantity} <span className="font-sans text-xs font-normal text-muted-foreground">{unit}</span>
                        </div>
                      </div>
                      <div role="rowgroup" className="bg-background/50 py-1.5">
                        {r.products.length === 0 ? (
                          <div role="row" style={{ gridTemplateColumns: COLS }} className={cn(ROW, "px-3 py-2")}>
                            <div role="cell" className="col-start-3 col-span-5 text-xs text-destructive">No se encontraron productos asignados. Actualiza antes de entregar.</div>
                          </div>
                        ) : (
                          r.products.map((product) => (
                            <div key={product.id} role="row" style={{ gridTemplateColumns: COLS }} className={cn(ROW, "items-start border-t border-border/50 px-3 py-2.5 first-of-type:border-t-0")}>
                              <div role="cell" className="col-start-3 min-w-0">
                                <p className="break-words text-sm font-medium">{product.name}</p>
                                {product.description && <p className="whitespace-pre-wrap break-words text-xs text-muted-foreground">{product.description}</p>}
                                {product.line && <p className="text-xs text-muted-foreground">Línea: {product.line}</p>}
                              </div>
                              <div role="cell" className="font-mono text-xs break-words text-muted-foreground">
                                {product.partNumbers.length > 0 ? product.partNumbers.join(" · ") : "—"}
                              </div>
                              <div role="cell" className="font-mono text-xs break-words text-muted-foreground">{product.sku || "—"}</div>
                              <div role="cell" className={cn("text-xs break-words", product.supplier ? "text-muted-foreground" : "text-muted-foreground/60")}>
                                {product.supplier || "Sin proveedor"}
                              </div>
                              <div role="cell" className="num text-right text-sm whitespace-nowrap" aria-label={`Cantidad de ${product.name}: ${product.quantity}`}>
                                {product.quantity} <span className="font-sans text-xs text-muted-foreground">{unit}</span>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="relative z-10 shrink-0 border-t bg-popover [box-shadow:0_-8px_16px_-10px_color-mix(in_oklch,var(--foreground)_30%,transparent)]">
        {error && (
          <div className="border-b p-4">
            <FieldError>{error}</FieldError>
          </div>
        )}
        {/* El resumen a la izquierda y los botones a la derecha, con la acción principal al borde (como el pie del cajón de anticipos). */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <span className="num text-sm text-muted-foreground">
            {selected.length} {selected.length === 1 ? "línea" : "líneas"} · {units} unidades
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" className="h-9" disabled={saving} onClick={onClose}>
              Cancelar
            </Button>
            <Button variant="brand" className="h-9" disabled={saving || selected.length === 0 || selected.some((row) => row.products.length === 0)} onClick={submit}>
              {saving ? "Generando…" : "Generar entrega y reporte"}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
