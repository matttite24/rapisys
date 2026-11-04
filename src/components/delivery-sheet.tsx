"use client";

import { startTransition, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DeliveryTruck01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { DatePicker, toIsoDate } from "@/components/date-picker";
import { FormField } from "@/components/form-field";
import { Button, buttonVariants } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { unitLabel } from "@/lib/units";
import { createDelivery, getDeliverable, type Deliverable } from "@/lib/delivery-actions";
import { cn } from "@/lib/utils";

// Botones de entregas en la fila de la tabla: ver las hechas y generar una nueva.
export function DeliveryActions({
  org,
  contractId,
  listId,
  listName,
  canAct,
  deliveries,
}: {
  org: string;
  contractId: string;
  listId: string;
  listName: string;
  canAct: boolean;
  deliveries: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex shrink-0 items-center gap-1 border-l px-3">
      <Link
        href={`/${org}/contratos/${contractId}/entregas`}
        className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "h-7 gap-1.5 px-2.5")}
      >
        Entregas <span className="num text-muted-foreground">{deliveries}</span>
      </Link>
      {canAct && (
        <Button size="sm" className="h-8 gap-1.5 px-3" onClick={() => setOpen(true)}>
          <HugeiconsIcon icon={DeliveryTruck01Icon} className="size-4" />
          Generar entrega
        </Button>
      )}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="h-[92svh] gap-0">
          <SheetHeader>
            <SheetTitle>Nueva entrega · {listName}</SheetTitle>
            <SheetDescription className="sr-only">
              Elige las líneas completas, con todo su stock, que se entregan ahora y genera el reporte de entrega.
            </SheetDescription>
          </SheetHeader>
          {open && <DeliveryBody key={listId} org={org} contractId={contractId} listId={listId} onClose={() => setOpen(false)} />}
        </SheetContent>
      </Sheet>
    </div>
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

  useEffect(() => {
    let alive = true;
    void getDeliverable(contractId, listId).then((r) => {
      if (!alive) return;
      setRows(r);
      // Por defecto, todo lo que está listo.
      setPicked(new Set(r.map((x) => x.id)));
    });
    return () => {
      alive = false;
    };
  }, [contractId, listId]);

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
      const res = await createDelivery(org, contractId, listId, {
        date,
        receivedBy: receivedBy.trim(),
        notes: notes.trim(),
        lineIds: selected.map((r) => r.id),
      });
      if (res?.id) {
        onClose();
        router.push(`/${org}/contratos/${contractId}/entregas/${res.id}`);
      } else {
        setError(res?.error);
        setSaving(false);
      }
    });
  }

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto">
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

        {rows === null ? (
          <p className="p-6 text-muted-foreground">Cargando…</p>
        ) : rows.length === 0 ? (
          <p className="max-w-xl p-6 text-muted-foreground">
            Ninguna línea de esta lista está lista para entregar. Una línea se entrega completa, cuando todas sus
            unidades están en stock: reserva existencias de la bodega en Abastecimiento y vuelve aquí.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left font-mono text-[0.6875rem] font-bold uppercase tracking-[0.1em]">
                  <th className="w-px px-4 py-3">
                    <input
                      type="checkbox"
                      aria-label="Elegir todas las líneas"
                      className="size-4 accent-brand"
                      checked={allPicked}
                      onChange={() => setPicked(allPicked ? new Set() : new Set(rows.map((r) => r.id)))}
                    />
                  </th>
                  <th className="w-px px-2 py-3 text-right">N.º</th>
                  <th className="px-2 py-3">Part. num.</th>
                  <th className="px-2 py-3">Descripción</th>
                  <th className="px-2 py-3 text-right">Cantidad</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const on = picked.has(r.id);
                  return (
                    <tr key={r.id} className={cn("border-b last:border-b-0", !on && "text-muted-foreground")}>
                      <td className="px-4 py-2">
                        <input
                          type="checkbox"
                          aria-label={`Entregar la línea ${r.n}`}
                          className="size-4 accent-brand"
                          checked={on}
                          onChange={() => toggle(r)}
                        />
                      </td>
                      <td className="num px-2 py-2 text-right">{r.n}</td>
                      <td className="px-2 py-2 font-mono text-xs">{r.partNumber || "—"}</td>
                      <td className="px-2 py-2">{r.description}</td>
                      <td className="num whitespace-nowrap px-2 py-2 text-right">
                        {r.quantity} <span className="font-sans text-xs">{unitLabel(r.unit)}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="relative z-10 shrink-0 border-t bg-popover [box-shadow:0_-8px_16px_-10px_color-mix(in_oklch,var(--foreground)_30%,transparent)]">
        {error && (
          <div className="border-b p-4">
            <FieldError>{error}</FieldError>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3 p-4">
          <Button className="h-10" disabled={saving || selected.length === 0} onClick={submit}>
            {saving ? "Generando…" : "Generar entrega y reporte"}
          </Button>
          <Button variant="outline" className="h-10" disabled={saving} onClick={onClose}>
            Cancelar
          </Button>
          <span className="num text-sm text-muted-foreground">
            {selected.length} {selected.length === 1 ? "línea" : "líneas"} · {units} unidades
          </span>
        </div>
      </div>
    </>
  );
}
