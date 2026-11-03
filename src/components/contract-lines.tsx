"use client";

import { TABLE_TD, TABLE_TH as TH } from "@/components/page-section";
import { useRef, useState } from "react";
import { Delete02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormField } from "@/components/form-field";
import { NumericInput } from "@/components/numeric-input";
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
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { addLine, removeLine, setContractStatus, type LineState } from "@/lib/contract-actions";
import { STATUS_DOT, STATUS_LABEL, STATUS_ORDER } from "@/lib/contracts";
import { UNITS, unitLabel } from "@/lib/units";

const TD = `${TABLE_TD} align-top`;

export type LineView = {
  id: string;
  description: string;
  quantity: number;
  unit: string;
};

const SUMMARY_LABEL =
  "mb-1 font-mono text-[0.6875rem] font-medium uppercase tracking-[0.1em] text-muted-foreground";

// Estado del contrato: un paso adelante o atrás por vez.
export function StatusControl({
  org,
  contractId,
  status,
  summary,
  inHeader,
}: {
  org: string;
  contractId: string;
  status: string;
  // En el encabezado va en una sola línea y el error cuelga debajo de él.
  inHeader?: boolean;
  // Datos del contrato, para confirmar el paso a En ejecución.
  summary?: { code: string; total: string; delivery: string };
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
    const res = await setContractStatus(org, contractId, target);
    setPending(false);
    setError(res?.error);
  }

  return (
    <div className={inHeader ? "relative" : "flex flex-col gap-2"}>
      <div className={inHeader ? "flex items-center gap-2" : "flex flex-wrap items-center gap-2"}>
        <span className="inline-flex items-center gap-2 bg-muted px-2.5 py-1.5 font-mono text-[0.6875rem] font-medium uppercase tracking-[0.1em] text-foreground select-none">
          <span aria-hidden className={`size-2 ${STATUS_DOT[status] ?? "bg-muted-foreground"}`} />
          {STATUS_LABEL[status] ?? status}
        </span>
        {prev && (
          <Button variant="outline" disabled={pending} onClick={() => go(prev)}>
            ← {STATUS_LABEL[prev]}
          </Button>
        )}
        {next && (
          // Pasar a En ejecución fija los datos del contrato: pide confirmación.
          <Button disabled={pending} onClick={() => (next === "in_progress" ? setConfirmOpen(true) : go(next))}>
            {STATUS_LABEL[next]} →
          </Button>
        )}
      </div>
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
              Se habilita la carga de items. Los datos del contrato quedan fijos y ya no se podrán corregir.
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

export function LinesTable({
  org,
  contractId,
  lines,
}: {
  org: string;
  contractId: string;
  lines: LineView[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th scope="col" className={`${TH} w-px text-right`}>N.º</th>
            <th scope="col" className={TH}>Descripción</th>
            <th scope="col" className={`${TH} text-right`}>Cantidad</th>
            <th scope="col" className={TH}>Unidad</th>
            <th scope="col" className={`${TH} w-px`}><span className="sr-only">Quitar</span></th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <LineRow key={l.id} org={org} contractId={contractId} line={l} n={i + 1} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LineRow({
  org,
  contractId,
  line: l,
  n,
}: {
  org: string;
  contractId: string;
  line: LineView;
  n: number;
}) {
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function remove() {
    setPending(true);
    setError(undefined);
    const res = await removeLine(org, contractId, l.id);
    setPending(false);
    if (res?.error) {
      setError(res.error);
      setConfirming(false);
    }
  }

  return (
    <tr className="border-b last:border-b-0">
      <td className={`${TD} num text-right text-muted-foreground`}>{n}</td>
      <td className={`${TD} break-words`}>
        {l.description}
        {error && <p role="alert" className="mt-1 text-sm text-destructive">{error}</p>}
      </td>
      <td className={`${TD} num text-right`}>{l.quantity}</td>
      <td className={`${TD} whitespace-nowrap`}>{unitLabel(l.unit)}</td>
      <td className={`${TD} whitespace-nowrap`}>
        {confirming ? (
          <span className="flex gap-2">
            <Button variant="destructive" disabled={pending} onClick={() => void remove()}>
              Quitar
            </Button>
            <Button variant="outline" onClick={() => setConfirming(false)}>No</Button>
          </span>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            className="size-10 text-muted-foreground"
            aria-label={`Quitar la línea ${n} del contrato`}
            onClick={() => setConfirming(true)}
          >
            <HugeiconsIcon icon={Delete02Icon} className="size-4" />
          </Button>
        )}
      </td>
    </tr>
  );
}

// Agrega una línea de la lista de referencia: descripción, cantidad y unidad.
export function AddLineForm({ org, contractId }: { org: string; contractId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, setPending] = useState(false);
  const [state, setState] = useState<LineState>();
  const errors = state?.fields ?? {};

  return (
    <form
      ref={formRef}
      noValidate
      className="grid gap-4 md:grid-cols-[1fr_8rem_11rem_auto] md:items-start [&_input]:bg-background [&_select]:bg-background"
      onSubmit={async (e) => {
        e.preventDefault();
        if (pending) return;
        const data = new FormData(e.currentTarget);
        setPending(true);
        const res = await addLine(org, contractId, undefined, data);
        setPending(false);
        setState(res);
        if (!res?.error && !res?.fields) {
          formRef.current?.reset();
          formRef.current?.querySelector<HTMLElement>('[name="description"]')?.focus();
        }
      }}
    >
      <FormField name="description" label="Descripción" error={errors.description}>
        {(a11y) => <Input {...a11y} autoComplete="off" maxLength={500} />}
      </FormField>
      <FormField name="quantity" label="Cantidad" error={errors.quantity}>
        {(a11y) => <NumericInput {...a11y} kind="decimal" className="font-mono" defaultValue="1" />}
      </FormField>
      <FormField name="unit" label="Unidad de medida" error={errors.unit}>
        {(a11y) => (
          <NativeSelect {...a11y} className="w-full" defaultValue="unit">
            {Object.entries(UNITS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </NativeSelect>
        )}
      </FormField>
      <Button type="submit" disabled={pending} className="md:mt-[1.35rem]">
        {pending ? "Agregando…" : "Agregar línea"}
      </Button>
      {state?.error && (
        <div className="md:col-span-4">
          <FieldError>{state.error}</FieldError>
        </div>
      )}
    </form>
  );
}
