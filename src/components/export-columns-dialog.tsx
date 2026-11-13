"use client";

import { useState } from "react";
import { Download01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { columnsFor, type BillingColumnKey } from "@/lib/billing-columns";


// Última elección de columnas en este navegador (o todas si no hay o no se puede leer).
function savedColumns(storage: string, all: BillingColumnKey[]): Set<BillingColumnKey> {
  try {
    const saved = JSON.parse(localStorage.getItem(storage) ?? "null") as string[] | null;
    const valid = saved?.filter((k): k is BillingColumnKey => (all as string[]).includes(k));
    if (valid && valid.length) return new Set(valid);
  } catch {
    /* sin almacenamiento: todas */
  }
  return new Set(all);
}

// Modal para elegir qué columnas lleva el reporte de cobro en Excel. Recuerda la última elección en este navegador.
export function ExportColumnsDialog({
  open, onOpenChange, href, consolidated = false,
}: {
  open: boolean; onOpenChange: (open: boolean) => void; href: string;
  // Reporte consolidado de todas las entregas: suma la columna «Entrega» y recuerda su propia elección.
  consolidated?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">{open && <ColumnsForm href={href} consolidated={consolidated} onClose={() => onOpenChange(false)} />}</DialogContent>
    </Dialog>
  );
}

// El formulario se monta al abrir el modal, así la elección guardada se lee en ese momento.
function ColumnsForm({ href, consolidated, onClose }: { href: string; consolidated: boolean; onClose: () => void }) {
  const columns = columnsFor(consolidated);
  const all = columns.map((c) => c.key);
  const storage = `rapisys:export-columns:${consolidated ? "billing-all" : "billing"}`;
  const [picked, setPicked] = useState<Set<BillingColumnKey>>(() => savedColumns(storage, all));

  const toggle = (k: BillingColumnKey) =>
    setPicked((cur) => {
      const next = new Set(cur);
      if (!next.delete(k)) next.add(k);
      return next;
    });

  function download() {
    const cols = all.filter((k) => picked.has(k));
    if (cols.length === 0) return;
    try {
      localStorage.setItem(storage, JSON.stringify(cols));
    } catch {
      /* no se pudo recordar: no pasa nada */
    }
    // Descarga directa: el servidor responde con el archivo y la pantalla no cambia.
    const a = Object.assign(document.createElement("a"), { href: `${href}?cols=${cols.join(",")}`, download: "" });
    document.body.appendChild(a);
    a.click();
    a.remove();
    onClose();
  }

  const none = picked.size === 0;
  return (
    <>
      <DialogHeader>
        <DialogTitle>{consolidated ? "Exportar consolidado a Excel" : "Exportar a Excel"}</DialogTitle>
        <DialogDescription>
          {consolidated
            ? "Elige las columnas de la hoja «Detalle». La hoja «Resumen» (una fila por entrega) va siempre completa."
            : "Elige las columnas del reporte de cobro. Se exportan todas las líneas incluidas de la entrega."}
        </DialogDescription>
      </DialogHeader>
      <div className="flex items-center justify-between text-sm">
        <span className="num text-muted-foreground">{picked.size} de {columns.length} columnas</span>
        <span className="flex gap-1">
          <Button type="button" variant="ghost" size="sm" onClick={() => setPicked(new Set(all))}>Todas</Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setPicked(new Set())}>Ninguna</Button>
        </span>
      </div>
      <fieldset className="grid gap-1 sm:grid-cols-2">
        <legend className="sr-only">Columnas a exportar</legend>
        {columns.map((c) => (
          <label key={c.key} className="flex min-h-10 items-center gap-2 rounded-md px-2 text-sm hover:bg-accent/60">
            <input type="checkbox" className="size-4" checked={picked.has(c.key)} onChange={() => toggle(c.key)} />
            {c.title}
          </label>
        ))}
      </fieldset>
      {none && <p role="alert" className="text-xs text-destructive">Elige al menos una columna.</p>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
        <Button type="button" variant="brand" disabled={none} onClick={download} className="gap-2">
          <HugeiconsIcon icon={Download01Icon} className="size-4" />
          Exportar
        </Button>
      </DialogFooter>
    </>
  );
}
