"use client";

import { PageSection, TABLE_TD, TABLE_TH } from "@/components/page-section";
import { startTransition, useEffect, useOptimistic, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Add01Icon, Cancel01Icon, Delete02Icon, Edit02Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { findDuplicates } from "@/lib/duplicates";
import { BulkImport } from "@/components/bulk-import";
import { ListDetailsForm, ListInfo, ListTabs, NewListDialog, type ListView } from "@/components/contract-lists";
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
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { addLine, removeLine, setContractStatus, updateLine, type LineState } from "@/lib/contract-actions";
import { STATUS_DOT, STATUS_LABEL, STATUS_ORDER } from "@/lib/contracts";
import { parseDecimal } from "@/lib/money";
import { UNITS, isUnit, unitLabel } from "@/lib/units";

// Encabezado de esta lista: negrita y texto pleno, no gris.
const TH = cn(TABLE_TH, "font-bold text-foreground");

// Prefijo del id de una línea que aún no confirmó el servidor.
const TEMP_PREFIX = "tmp-";

const TD = cn(TABLE_TD, "py-1.5 align-middle");

export type LineView = {
  id: string;
  listId: string;
  partNumber: string;
  description: string;
  quantity: number;
  unit: string;
  cpc: string;
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

type OptimisticAction =
  | { type: "add"; line: LineView }
  | { type: "update"; line: LineView }
  | { type: "remove"; id: string };

// Las listas del contrato (una por activo) con sus líneas. La lista y su formulario
// comparten estado: la línea aparece al instante y el servidor la confirma por detrás.
export function ReferenceList({
  org,
  contractId,
  lists,
  lines,
  canAdd,
}: {
  org: string;
  contractId: string;
  lists: ListView[];
  lines: LineView[];
  canAdd: boolean;
}) {
  const [shown, apply] = useOptimistic(lines, (state, a: OptimisticAction) => {
    if (a.type === "add") return [...state, a.line];
    if (a.type === "update") return state.map((l) => (l.id === a.line.id ? a.line : l));
    return state.filter((l) => l.id !== a.id);
  });
  const [error, setError] = useState<string>();
  const [activeId, setActiveId] = useState<string | null>(null);
  // Qué muestra el panel gris de arriba: una línea (agregar o editar) o los datos de la lista.
  const [panel, setPanel] = useState<"line" | "list-edit">("line");
  // Crear una lista va en un modal aparte, no en el panel.
  const [newOpen, setNewOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Si la lista abierta ya no existe (se eliminó), se vuelve a la primera.
  const active = lists.find((l) => l.id === activeId) ?? lists[0] ?? null;
  const listLines = active ? shown.filter((l) => l.listId === active.id) : [];
  const counts: Record<string, number> = {};
  for (const l of shown) counts[l.listId] = (counts[l.listId] ?? 0) + 1;

  const editing = listLines.find((l) => l.id === editingId) ?? null;
  const editingN = editing ? listLines.indexOf(editing) + 1 : 0;
  const mode = panel;

  function resetPanel() {
    setPanel("line");
    setEditingId(null);
  }

  function select(id: string) {
    setActiveId(id);
    resetPanel();
  }

  function remove(id: string) {
    setError(undefined);
    if (id === editingId) setEditingId(null);
    startTransition(async () => {
      apply({ type: "remove", id });
      const res = await removeLine(org, contractId, id);
      if (res?.error) setError(res.error);
    });
  }

  const title = `Editar línea ${editingN}`;

  if (lists.length === 0 && !canAdd) {
    return (
      <PageSection label="0 líneas de referencia" className="p-0">
        <p className="p-6 text-muted-foreground">Este contrato no tiene items.</p>
      </PageSection>
    );
  }

  const newListDialog = canAdd && (
    <NewListDialog
      org={org}
      contractId={contractId}
      open={newOpen}
      onOpenChange={setNewOpen}
      onCreated={select}
    />
  );

  // Sin listas todavía: se crea la primera desde el modal.
  if (lists.length === 0) {
    return (
      <>
        <PageSection label="0 listas">
          <div className="flex flex-col items-start gap-4">
            <p className="max-w-xl text-muted-foreground">
              Cada lista reúne los items de un activo (o una lista general). Crea la primera para empezar a cargar items.
            </p>
            <Button className="h-10 gap-2" onClick={() => setNewOpen(true)}>
              <HugeiconsIcon icon={Add01Icon} className="size-5" />
              Crear lista
            </Button>
          </div>
        </PageSection>
        {newListDialog}
      </>
    );
  }

  return (
    <>
      {newListDialog}
      {lists.length > 0 && (
        <ListTabs
          lists={lists}
          counts={counts}
          activeId={active?.id ?? null}
          canAdd={canAdd}
          onSelect={select}
          onNew={() => setNewOpen(true)}
        />
      )}
      {active && (
        <ListInfo
          // Al cambiar de lista se reinicia el estado de confirmación.
          key={active.id}
          org={org}
          contractId={contractId}
          list={active}
          lineCount={counts[active.id] ?? 0}
          canEdit={canAdd}
          editing={mode === "list-edit"}
          onEdit={() => {
            setEditingId(null);
            setPanel("list-edit");
          }}
        />
      )}

      {/* La función principal de la pantalla: va primero y con fondo propio. */}
      {canAdd && (
        <section className="relative z-10 border-b bg-muted shadow-raised">
          {/* Agregar una línea es lo habitual: va sin barra de título para ocupar menos alto. */}
          {mode === "line" && editing && (
            <div className="flex h-10 items-center justify-between px-6 font-mono text-[0.6875rem] font-medium uppercase tracking-[0.12em]">
              <span>{title}</span>
              {(
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
                  onClick={resetPanel}
                >
                  <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
                  Cancelar
                </button>
              )}
            </div>
          )}
          <div className={cn("px-6 pb-4", editing ? "pt-0" : "pt-4")}>
            {mode === "line" && active ? (
              <LineForm
                // Al cambiar de línea o de lista el formulario se rearma con sus valores.
                key={`${active.id}:${editing?.id ?? "new"}`}
                org={org}
                contractId={contractId}
                listId={active.id}
                editing={editing}
                onAdd={(line) => apply({ type: "add", line })}
                onUpdate={(line) => apply({ type: "update", line })}
                onDone={() => setEditingId(null)}
              />
            ) : (
              active && (
                <ListDetailsForm
                  key={active.id}
                  org={org}
                  contractId={contractId}
                  list={active}
                  onCancel={resetPanel}
                  onDone={resetPanel}
                />
              )
            )}
          </div>
        </section>
      )}

      {active && (
        <PageSection
          label={`${listLines.length} ${listLines.length === 1 ? "línea" : "líneas"} de referencia`}
          meta={canAdd ? <BulkImport org={org} contractId={contractId} listId={active.id} listName={active.name} existing={listLines.map((l) => ({ part: l.partNumber, description: l.description }))} /> : undefined}
          className="p-0"
        >
          {listLines.length === 0 ? (
            <p className="p-6 text-muted-foreground">
              {canAdd ? "Esta lista aún no tiene items. Agrega el primero arriba." : "Esta lista no tiene items."}
            </p>
          ) : (
            <>
              {error && <p role="alert" className="border-b p-3 text-sm text-destructive">{error}</p>}
              <LinesTable
                lines={listLines}
                editingId={editingId}
                canEdit={canAdd}
                onEdit={(id) => {
                  setPanel("line");
                  setEditingId(id);
                }}
                onRemove={remove}
              />
            </>
          )}
        </PageSection>
      )}
    </>
  );
}

function LinesTable({
  lines,
  editingId,
  canEdit,
  onEdit,
  onRemove,
}: {
  lines: LineView[];
  editingId: string | null;
  canEdit: boolean;
  onEdit: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  // Repetidos dentro de la lista (mismo número de parte, o misma descripción si no lo tiene).
  const dups = findDuplicates(
    lines.map((l) => ({ part: l.partNumber, description: l.description })),
    [],
  );
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th scope="col" className={`${TH} w-px text-right`}>N.º</th>
            <th scope="col" className={TH}>Part. num.</th>
            <th scope="col" className={TH}>Descripción</th>
            <th scope="col" className={`${TH} text-right`}>Cantidad</th>
            <th scope="col" className={TH}>Unidad</th>
            <th scope="col" className={TH}>CPC</th>
            <th scope="col" className={`${TH} w-px`}><span className="sr-only">Acciones</span></th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <LineRow
              key={l.id}
              line={l}
              n={i + 1}
              duplicateOf={dups[i]?.ref}
              editing={l.id === editingId}
              canEdit={canEdit}
              onEdit={onEdit}
              onRemove={onRemove}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LineRow({
  line: l,
  n,
  duplicateOf,
  editing,
  canEdit,
  onEdit,
  onRemove,
}: {
  line: LineView;
  n: number;
  duplicateOf?: number;
  editing: boolean;
  canEdit: boolean;
  onEdit: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  // Línea enviada y aún sin confirmar por el servidor.
  const saving = l.id.startsWith(TEMP_PREFIX);

  return (
    <tr
      className={cn(
        "border-b last:border-b-0",
        saving && "opacity-60",
        editing && "bg-muted",
        // Pidiendo confirmar el borrado: los datos que se perderán, en rojo y negrita.
        confirming && "bg-destructive/5 font-bold text-destructive [&>td]:text-destructive",
      )}
    >
      <td className={`${TD} num text-right text-muted-foreground`}>{n}</td>
      <td className={`${TD} whitespace-nowrap font-mono text-xs`}>
        {l.partNumber || "—"}
        {duplicateOf && (
          <span className="block font-sans text-[0.6875rem] font-medium text-destructive">Repetido: igual a la línea {duplicateOf}</span>
        )}
      </td>
      <td className={`${TD} break-words`}>{l.description}</td>
      <td className={`${TD} num text-right`}>{l.quantity}</td>
      <td className={`${TD} whitespace-nowrap`}>{unitLabel(l.unit)}</td>
      <td className={`${TD} whitespace-nowrap font-mono text-xs`}>{l.cpc || "—"}</td>
      <td className={cn(TD, "p-1 whitespace-nowrap")}>
        {saving ? null : confirming ? (
          <span className="flex gap-2">
            <Button variant="destructive" onClick={() => onRemove(l.id)}>
              Quitar
            </Button>
            <Button variant="outline" onClick={() => setConfirming(false)}>No</Button>
          </span>
        ) : (
          <span className="flex gap-1">
            {canEdit && (
              <Button
                variant="ghost"
                size="icon"
                className="size-7 text-muted-foreground"
                aria-label={`Editar la línea ${n}`}
                aria-pressed={editing}
                onClick={() => onEdit(l.id)}
              >
                <HugeiconsIcon icon={Edit02Icon} className="size-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:text-destructive"
              aria-label={`Quitar la línea ${n} del contrato`}
              onClick={() => setConfirming(true)}
            >
              <HugeiconsIcon icon={Delete02Icon} className="size-4" />
            </Button>
          </span>
        )}
      </td>
    </tr>
  );
}

const MESSAGES = {
  description: "Escribe la descripción del item.",
  quantity: "Escribe una cantidad mayor a 0, con máximo 2 decimales.",
  unit: "Elige una unidad de medida.",
};

// Agrega o edita una línea de la lista: número de parte, descripción, cantidad, unidad y CPC.
function LineForm({
  org,
  contractId,
  listId,
  editing,
  onAdd,
  onUpdate,
  onDone,
}: {
  org: string;
  contractId: string;
  listId: string;
  editing: LineView | null;
  onAdd: (line: LineView) => void;
  onUpdate: (line: LineView) => void;
  onDone: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, setState] = useState<LineState>();
  const [saving, setSaving] = useState(false);

  // Al pasar a editar una línea, el formulario se ve y toma el foco.
  useEffect(() => {
    if (!editing) return;
    formRef.current?.scrollIntoView({ block: "nearest" });
    formRef.current?.querySelector<HTMLElement>('[name="description"]')?.focus();
  }, [editing]);
  const errors = state?.fields ?? {};

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (saving) return;
    const form = e.currentTarget;
    const data = new FormData(form);
    const partNumber = String(data.get("part_number") ?? "").trim();
    const description = String(data.get("description") ?? "").trim();
    const quantity = parseDecimal(String(data.get("quantity") ?? ""));
    const unit = String(data.get("unit") ?? "");
    const cpc = String(data.get("cpc") ?? "").trim();

    // Se valida aquí para responder al instante; el servidor vuelve a validar.
    const fields: Record<string, string> = {};
    if (!description) fields.description = MESSAGES.description;
    if (quantity === null || quantity <= 0) fields.quantity = MESSAGES.quantity;
    if (!isUnit(unit)) fields.unit = MESSAGES.unit;
    if (Object.keys(fields).length || quantity === null) {
      setState({ fields });
      return;
    }

    setState(undefined);
    const line = { listId, partNumber, description, quantity, unit, cpc };

    if (editing) {
      // La fila cambia ya; el formulario sale de edición cuando el servidor confirma.
      setSaving(true);
      startTransition(async () => {
        onUpdate({ ...line, id: editing.id });
        const res = await updateLine(org, contractId, editing.id, data);
        setSaving(false);
        if (res?.error || res?.fields) setState(res);
        else onDone();
      });
      return;
    }

    startTransition(async () => {
      // La fila aparece ya y el formulario queda listo para la siguiente.
      onAdd({ ...line, id: `${TEMP_PREFIX}${Date.now()}` });
      form.reset();
      form.querySelector<HTMLElement>('[name="part_number"]')?.focus();

      const res = await addLine(org, contractId, listId, data);
      if (res?.error || res?.fields) {
        // No se guardó: se devuelve lo escrito para no perderlo.
        for (const name of ["part_number", "description", "quantity", "unit", "cpc"]) {
          const el = form.elements.namedItem(name);
          if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) {
            el.value = String(data.get(name) ?? "");
          }
        }
        setState(res);
      }
    });
  }

  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={onSubmit}
      // Enter en cualquier campo agrega la línea.
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.target instanceof HTMLInputElement) {
          e.preventDefault();
          formRef.current?.requestSubmit();
        }
      }}
      className="grid gap-4 md:grid-cols-[9rem_1fr_6.5rem_9rem_9rem_3.5rem] md:items-start [&_input]:bg-background [&_select]:bg-background"
    >
      <FormField name="part_number" label="Part. num." error={errors.part_number}>
        {(a11y) => (
          <Input {...a11y} autoComplete="off" maxLength={60} className="font-mono" defaultValue={editing?.partNumber} />
        )}
      </FormField>
      <FormField name="description" label="Descripción" error={errors.description}>
        {(a11y) => <Input {...a11y} autoComplete="off" maxLength={500} defaultValue={editing?.description} />}
      </FormField>
      <FormField name="quantity" label="Cantidad" error={errors.quantity}>
        {(a11y) => (
          <NumericInput
            {...a11y}
            kind="decimal"
            className="font-mono"
            defaultValue={editing ? String(editing.quantity) : "1"}
          />
        )}
      </FormField>
      <FormField name="unit" label="Unidad" error={errors.unit}>
        {(a11y) => (
          <NativeSelect {...a11y} className="w-full" defaultValue={editing?.unit ?? "unit"}>
            {Object.entries(UNITS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </NativeSelect>
        )}
      </FormField>
      <FormField name="cpc" label="CPC" error={errors.cpc}>
        {(a11y) => (
          <Input {...a11y} autoComplete="off" maxLength={20} className="font-mono" defaultValue={editing?.cpc} />
        )}
      </FormField>
      {/* Etiqueta vacía del mismo alto que las demás: el botón queda a la altura de los campos. */}
      <Field>
        <FieldLabel aria-hidden className="max-md:hidden">&nbsp;</FieldLabel>
        <Button
          type="submit"
          size="icon"
          disabled={saving}
          className="h-10 w-full"
          aria-label={editing ? "Guardar cambios" : "Agregar línea"}
          title={editing ? "Guardar cambios" : "Agregar línea"}
        >
          <HugeiconsIcon icon={editing ? Tick02Icon : Add01Icon} className="size-6" strokeWidth={2} />
        </Button>
      </Field>
      {state?.error && (
        <div className="md:col-span-6">
          <FieldError>{state.error}</FieldError>
        </div>
      )}
    </form>
  );
}
