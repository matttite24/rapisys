"use client";

import { NumericInput } from "@/components/numeric-input";
import type { Reconcile } from "@/components/use-reconcile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Target } from "@/components/reconcile-shared";

// Lo elegido, para asignarlo a la línea abierta: cantidad (automática si se deja vacía) y un botón por forma de
// cubrir. «Asignar» usa unidades que ya están en la bodega; «Reservar» lo que aún viene en la factura.
export function AssignTo({ rc, target }: { rc: Reconcile; target: Target }) {
  const c = rc.current;
  if (!c) return null;
  const canStock = c.inStock > 0;
  const canArrive = c.available > 0;
  const adding = target.addToListId !== undefined;
  const showName = target.open > 0 && (canStock || canArrive) && (adding || target.description !== undefined);
  // Alta directa: crea la línea con el producto y se la asigna; o asigna a la línea abierta.
  const run = (how: "bodega" | "llegar") => void (target.addToListId ? rc.addToList(target.addToListId, how) : rc.assign(target, how));
  return (
    <div className="flex flex-col gap-2 px-4 pt-1 pb-3">
      {showName && (
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {adding ? "Nombre de la nueva línea" : "Nombre en la lista"}{c.tdrName ? " (Nombre TDR del producto)" : ""}
          <Input
            aria-label="Nombre en la lista"
            maxLength={500}
            className="h-8 text-sm text-foreground"
            value={rc.listNameFor(target)}
            onChange={(e) => rc.setListName(target, e.target.value)}
          />
        </label>
      )}
      <div className="flex items-center justify-between gap-3">
      {target.open <= 0 ? (
        <p className="text-xs text-muted-foreground">Esta línea del proceso ya está cubierta por completo.</p>
      ) : !canStock && !canArrive ? (
        <p className="text-xs text-muted-foreground">Ya no queda nada de esto por cubrir.</p>
      ) : (
        <>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Cantidad
            <NumericInput
              kind="decimal"
              aria-label="Cantidad a asignar"
              placeholder={String(Math.min(canStock ? c.inStock : c.available, target.open))}
              className="h-8 w-20 font-mono"
              value={rc.qty}
              onChange={(e) => rc.setQty(e.target.value)}
            />
          </label>
          <div className="flex items-center gap-2">
            {canStock && (
              <Button size="sm" className="h-8" disabled={rc.busy} title="Asigna unidades que ya están en la bodega" onClick={() => run("bodega")}>
                {adding ? "Agregar y asignar" : "Asignar"} <Kbd className="border-primary-foreground/30 bg-transparent text-primary-foreground">↵</Kbd>
              </Button>
            )}
            {canArrive && (
              <Button
                size="sm"
                variant={canStock ? "outline" : "default"}
                className="h-8"
                disabled={rc.busy}
                title="Reserva lo que aún viene en la factura"
                onClick={() => run("llegar")}
              >
                {adding ? "Agregar y reservar" : "Reservar"}
                {!canStock && <Kbd className="border-primary-foreground/30 bg-transparent text-primary-foreground">↵</Kbd>}
              </Button>
            )}
          </div>
        </>
      )}
      </div>
    </div>
  );
}
