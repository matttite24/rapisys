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
import { HEADER_CELL_PRESS } from "@/components/header-action";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { setContractStatus } from "@/lib/contract-actions";
import { STATUS_DOT, STATUS_LABEL, STATUS_ORDER } from "@/lib/contracts";

const SUMMARY_LABEL =
  "mb-1 font-mono text-[0.6875rem] font-medium uppercase tracking-[0.1em] text-muted-foreground";

// Estado del contrato: un paso adelante o atrás por vez.
export function StatusControl({
  org,
  contractId,
  status,
  summary,
  blocker,
  inHeader,
}: {
  org: string;
  contractId: string;
  status: string;
  // En el encabezado va en una sola línea y el error cuelga debajo de él.
  inHeader?: boolean;
  // Datos del contrato, para confirmar el paso a En ejecución.
  summary?: { code: string; total: string; delivery: string };
  // Motivo por el que el paso siguiente aún no se puede dar; con motivo, el botón queda inactivo.
  blocker?: string | null;
}) {
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const idx = STATUS_ORDER.indexOf(status as (typeof STATUS_ORDER)[number]);
  const prev = STATUS_ORDER[idx - 1];
  const next = STATUS_ORDER[idx + 1];

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
        <span className="inline-flex items-center gap-2 bg-muted px-2.5 py-1.5 font-mono text-[0.6875rem] font-medium uppercase tracking-[0.1em] text-foreground select-none">
          <span aria-hidden className={`size-2 ${STATUS_DOT[status] ?? "bg-muted-foreground"}`} />
          {STATUS_LABEL[status] ?? status}
        </span>
        )}
        {prev && !inHeader && (
          <Button variant="outline" disabled={pending} onClick={() => go(prev)}>
            ← {STATUS_LABEL[prev]}
          </Button>
        )}
        {next && (
          // Pasar a En ejecución fija los datos del contrato: pide confirmación.
          // Con motivo pendiente queda inactivo y el motivo se ve al pasar el cursor (el botón inactivo no recibe eventos).
          <span className={cn(inHeader && "flex")} title={blocker ?? undefined}>
            <Button
              disabled={pending || Boolean(blocker)}
              className={cn(inHeader && cn("-mr-4 h-auto! gap-2 border-0! bg-clip-border! px-5", HEADER_CELL_PRESS))}
              onClick={() => (next === "in_progress" ? setConfirmOpen(true) : go(next))}
            >
              {STATUS_LABEL[next]}
              <HugeiconsIcon icon={next === "finished" ? CheckmarkCircle02Icon : ArrowRight01Icon} className="size-4" />
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
            <AlertDialogTitle>¿Pasar el contrato a En ejecución?</AlertDialogTitle>
            <AlertDialogDescription>
              Se habilita la carga de items. Los datos del contrato se pueden seguir corrigiendo desde &ldquo;Editar&rdquo;.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {summary && (
            <dl className="grid grid-cols-2 gap-px border bg-border [&>div]:bg-popover [&>div]:p-3">
              <div className="col-span-2">
                <dt className={SUMMARY_LABEL}>Contrato</dt>
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
