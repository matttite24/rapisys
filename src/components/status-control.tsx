"use client";

import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ArrowRight01Icon, CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { setContractStatus } from "@/lib/contract-actions";
import { StatusChip } from "@/components/status-chip";
import { orderFor, statusText } from "@/lib/contracts";

const SUMMARY_LABEL =
  "mb-1 caps font-medium text-muted-foreground";

// Estado del proceso: un paso adelante o atrás por vez.
export function StatusControl({
  org,
  contractId,
  status,
  kind,
  deliveries,
  summary,
  blocker,
  inHeader,
}: {
  // Tipo de proceso y entregas hechas: el crédito tiene su propio ciclo y nombres.
  kind?: string;
  deliveries?: number;
  org: string;
  contractId: string;
  status: string;
  // En el encabezado va en una sola línea y el error cuelga debajo de él.
  inHeader?: boolean;
  // Datos del proceso, para confirmar el paso a En ejecución.
  summary?: { code: string; total: string; delivery: string };
  // Motivo por el que el paso siguiente aún no se puede dar; con motivo, el botón queda inactivo.
  blocker?: string | null;
}) {
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const order = orderFor(kind);
  const idx = order.indexOf(status);
  const prev = order[idx - 1];
  const next = order[idx + 1];
  const label = (s: string) => statusText(s, kind, s === "in_progress" ? 0 : undefined);

  async function go(target: string) {
    setPending(true);
    setError(undefined);
    try {
      const res = await setContractStatus(org, contractId, target);
      setError(res?.error);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={inHeader ? "relative flex" : "flex flex-col gap-2"}>
      <div className={inHeader ? "flex items-stretch gap-2" : "flex flex-wrap items-center gap-2"}>
        {/* En el encabezado el estado ya está en la columna de opciones y no se retrocede: solo el paso siguiente. */}
        {!inHeader && (
        <StatusChip status={status} kind={kind} deliveries={deliveries} className="select-none" />
        )}
        {prev && !inHeader && (
          <Button variant="outline" disabled={pending} onClick={() => go(prev)}>
            ← {label(prev)}
          </Button>
        )}
        {next && (
          // Pasar a En ejecución fija los datos del proceso: pide confirmación.
          // Con motivo pendiente queda inactivo y el motivo se ve al pasar el cursor (el botón inactivo no recibe eventos).
          <span className={cn(inHeader && "flex")} title={blocker ?? undefined}>
            <Button
              variant="brand"
              disabled={pending || Boolean(blocker)}
              className={cn(inHeader && "-mr-4 h-auto! gap-2 rounded-none! border-0! bg-clip-border! px-5")}
              onClick={() => (next === "in_progress" ? setConfirmOpen(true) : go(next))}
            >
              {label(next)}
              <HugeiconsIcon icon={next === "finished" || (kind === "credit" && next === "invoiced") ? CheckmarkCircle02Icon : ArrowRight01Icon} className="size-4" />
            </Button>
          </span>
        )}
      </div>
      {!inHeader && blocker && <p className="text-xs text-muted-foreground">{blocker}</p>}
      {error && (
        <p
          role="alert"
          className={
            inHeader
              ? "absolute top-full right-0 z-20 mt-2 w-max max-w-80 border bg-background p-3 text-sm text-destructive"
              : "text-sm text-destructive"
          }
        >
          {error}
        </p>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="data-[size=default]:sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Pasar el proceso a En ejecución?</AlertDialogTitle>
            <AlertDialogDescription>
              Se habilita la carga de items. Los datos del proceso se pueden seguir corrigiendo desde &ldquo;Editar&rdquo;.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {summary && (
            <dl className="grid grid-cols-2 gap-px border bg-border [&>div]:bg-popover [&>div]:p-3">
              <div className="col-span-2">
                <dt className={SUMMARY_LABEL}>Proceso</dt>
                <dd className="num break-all">{summary.code}</dd>
              </div>
              <div>
                <dt className={SUMMARY_LABEL}>Monto (IVA incl.)</dt>
                <dd className="num whitespace-nowrap">{summary.total}</dd>
              </div>
              <div>
                <dt className={SUMMARY_LABEL}>Fecha de entrega</dt>
                <dd className="num whitespace-nowrap">{summary.delivery}</dd>
              </div>
            </dl>
          )}

          <p className="text-xs text-muted-foreground">
            Se usan los datos guardados. Si cambiaste algo en el formulario, guárdalo antes de continuar.
          </p>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmOpen(false);
                void go("in_progress");
              }}
            >
              Sí, pasar a En ejecución
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
