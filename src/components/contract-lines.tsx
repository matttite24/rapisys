"use client";

import { ConfirmTap } from "@/components/confirm-tap";
import { PageFigures, PageShortcuts } from "@/components/page-shortcuts";
import { EmptyState, NO_RESULTS_IMAGE } from "@/components/empty-state";
import { HeaderAction } from "@/components/header-action";
import { PageSection, TABLE_TD, TABLE_TH } from "@/components/page-section";
import { useRouter } from "next/navigation";
import { startTransition, useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { Add01Icon, Cancel01Icon, Delete02Icon, Edit02Icon, FileAddIcon, Search01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { LineSearch } from "@/components/line-search";
import { Pager } from "@/components/pager";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { pageCount } from "@/lib/pagination";
import { BulkImport } from "@/components/bulk-import";
import { ListDetailsForm, ListInfo, ListTabs, NewListDialog, type ListView } from "@/components/contract-lists";
import { FormField } from "@/components/form-field";
import { NumericInput } from "@/components/numeric-input";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { addLine, removeLine, updateLine, type LineState } from "@/lib/contract-actions";
import { LINES_PAGE_SIZE, MAX_LINES_PER_LIST } from "@/lib/contracts";
import { centsToInput, formatCents, parseCents, parseDecimal } from "@/lib/money";
import { UNITS, isUnit, unitLabel } from "@/lib/units";

// Encabezado de esta lista: negrita y texto pleno, no gris.
const TH = TABLE_TH;

// Prefijo del id de una línea que aún no confirmó el servidor.
const TEMP_PREFIX = "tmp-";

const TD = cn(TABLE_TD, "py-1.5");

export type LineView = {
  id: string;
  listId: string;
  // Posición en la lista (1.º, 2.º…) y, si está repetida, a qué línea se parece.
  n: number;
  dupOf?: number;
  partNumber: string;
  description: string;
  quantity: number;
  unit: string;
  // Precio referencial TOTAL de la línea (sin IVA), en centavos. El valor unitario es este total ÷ la cantidad.
  referencePriceCents: number | null;
};

type OptimisticAction =
  | { type: "add"; line: LineView }
  | { type: "update"; line: LineView }
  | { type: "remove"; id: string };

// Las listas del contrato (una por activo). Solo llega la página abierta de la lista abierta:
// el resto se pide al servidor al cambiar de lista, de página o al buscar. La lista y su
// formulario comparten estado: la línea aparece al instante y el servidor la confirma por detrás.
export function ReferenceList({
  org,
  contractId,
  lists,
  lines,
  canAdd,
  basePath,
  activeId,
  page,
  total,
  q,
}: {
  org: string;
  contractId: string;
  lists: ListView[];
  lines: LineView[];
  canAdd: boolean;
  basePath: string;
  activeId: string | null;
  page: number;
  // Líneas que cumplen la búsqueda (todas las de la lista si no hay búsqueda).
  total: number;
  q: string;
}) {
  const router = useRouter();
  const [navigating, startNav] = useTransition();
  const [shown, apply] = useOptimistic(lines, (state, a: OptimisticAction) => {
    if (a.type === "add") return [...state, a.line];
    if (a.type === "update") return state.map((l) => (l.id === a.line.id ? a.line : l));
    return state.filter((l) => l.id !== a.id);
  });
  const [error, setError] = useState<string>();
  // Qué muestra el panel gris de arriba: una línea (agregar o editar) o los datos de la lista.
  const [panel, setPanel] = useState<"line" | "list-edit">("line");
  // Crear una lista va en un modal aparte, no en el panel.
  const [newOpen, setNewOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // La lista elegida se marca al instante; las líneas llegan cuando responde el servidor.
  const [shownActiveId, setShownActiveId] = useOptimistic(activeId);
  const active = lists.find((l) => l.id === shownActiveId) ?? lists[0] ?? null;
  // Lo que muestra la tabla es de la lista que ya llegó del servidor.
  const loaded = lists.find((l) => l.id === activeId) ?? lists[0] ?? null;
  const switching = active?.id !== loaded?.id;
  // Altas y bajas aún sin confirmar: ajustan los contadores al instante.
  const delta = shown.length - lines.length;
  const counts: Record<string, number> = {};
  for (const l of lists) counts[l.id] = l.count + (l.id === loaded?.id ? delta : 0);
  const listCount = loaded ? counts[loaded.id] : 0;

  const editing = shown.find((l) => l.id === editingId) ?? null;
  const mode = panel;
  const pages = pageCount(total, LINES_PAGE_SIZE);

  function go(next: { lista?: string; page?: number; q?: string }) {
    const sp = new URLSearchParams();
    sp.set("lista", next.lista ?? active?.id ?? "");
    if (next.q) sp.set("q", next.q);
    if (next.page && next.page > 1) sp.set("page", String(next.page));
    startNav(() => {
      if (next.lista) setShownActiveId(next.lista);
      router.push(`${basePath}?${sp}`, { scroll: false });
    });
  }

  function resetPanel() {
    setPanel("line");
    setEditingId(null);
  }

  function select(id: string) {
    resetPanel();
    go({ lista: id });
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

  // La línea nueva va al final: se ve al instante solo si esa página es la última y tiene lugar.
  const addVisible = !q && page === pages && shown.length < LINES_PAGE_SIZE;
  function onAdd(line: LineView) {
    if (addVisible) apply({ type: "add", line: { ...line, n: listCount + 1 } });
  }
  // Si no estaba a la vista, se lleva al usuario a la última página, donde quedó.
  function onAdded() {
    if (!addVisible) go({ page: pageCount(total + 1, LINES_PAGE_SIZE) });
  }

  if (lists.length === 0 && !canAdd) {
    return (
      <PageSection label="0 líneas de referencia" className="p-0">
        <p className="p-6 text-muted-foreground">Este contrato no tiene items.</p>
      </PageSection>
    );
  }

  const newListDialog = canAdd && (
    <>
      <HeaderAction icon={FileAddIcon} label="Nueva lista" onClick={() => setNewOpen(true)} />
      <NewListDialog
        org={org}
        contractId={contractId}
        open={newOpen}
        onOpenChange={setNewOpen}
        onCreated={select}
      />
    </>
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

  const full = listCount >= MAX_LINES_PER_LIST;
  // Cifra de la barra inferior: cuántas líneas tiene la lista (y cuántas coinciden con la búsqueda).
  const figures = [
    {
      label: listCount === 1 ? "Línea" : "Líneas",
      value: String(listCount),
      ...(q ? { note: `${total} coinciden` } : {}),
      ...(full ? { tone: "warn" as const } : {}),
    },
  ];

  return (
    <>
      <PageFigures figures={figures} />
      {/* Enter en cualquier campo de la banda agrega la línea (o guarda los cambios al editar). */}
      {canAdd && !full && <PageShortcuts shortcuts={[{ keys: ["Enter"], label: editingId ? "Guardar" : "Añadir" }]} />}
      {newListDialog}
      <ListTabs
        lists={lists}
        counts={counts}
        activeId={active?.id ?? null}
        onSelect={select}
      />
      {active && (
        <ListInfo
          // Al cambiar de lista se reinicia el estado de confirmación.
          key={active.id}
          org={org}
          contractId={contractId}
          list={active}
          lineCount={listCount}
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
        <section className="border-b bg-surface-strong">
          {/* Agregar una línea es lo habitual: va sin barra de título para ocupar menos alto. */}
          {mode === "line" && editing && (
            <div className="flex h-10 items-center justify-between px-6 caps font-medium">
              <span>Editar línea {editing.n}</span>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
                onClick={resetPanel}
              >
                <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
                Cancelar
              </button>
            </div>
          )}
          <div className={cn("px-6 pb-4", editing ? "pt-0" : "pt-4")}>
            {mode === "line" && active ? (
              full && !editing ? (
                <p className="py-2 text-sm">
                  La lista llegó al máximo de {MAX_LINES_PER_LIST.toLocaleString("es-EC")} líneas. Crea otra lista para
                  seguir cargando.
                </p>
              ) : (
                <LineForm
                  // Al cambiar de línea o de lista el formulario se rearma con sus valores.
                  key={`${active.id}:${editing?.id ?? "new"}`}
                  org={org}
                  contractId={contractId}
                  listId={active.id}
                  editing={editing}
                  onAdd={onAdd}
                  onAdded={onAdded}
                  onUpdate={(line) => apply({ type: "update", line })}
                  onDone={() => setEditingId(null)}
                />
              )
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
        <section className="border-b">
          {/* Fila de búsqueda desde el inicio; la carga masiva queda a la derecha. */}
          <div className="sticky top-12 z-10 flex h-12 items-stretch border-b bg-popover">
            <LineSearch key={active.id} q={q} onSearch={(next) => go({ q: next })} />
            {canAdd && (
              <div className="flex shrink-0 items-center border-l px-3">
                <BulkImport
                  org={org}
                  contractId={contractId}
                  listId={active.id}
                  listName={active.name}
                  listCount={listCount}
                />
              </div>
            )}
          </div>
          {navigating || switching ? (
            // Cambió la lista, la página o la búsqueda: las filas viejas ya no valen; llegan las nuevas.
            <LinesTableSkeleton rows={Math.min(8, Math.max(3, active?.count ?? 5))} />
          ) : (
            <div>
            {shown.length === 0 ? (
              q ? (
                <EmptyState image={NO_RESULTS_IMAGE}>{`Ninguna línea coincide con «${q}».`}</EmptyState>
              ) : (
                <p className="p-6 text-muted-foreground">
                  {canAdd ? "Esta lista aún no tiene items. Agrega el primero arriba." : "Esta lista no tiene items."}
                </p>
              )
            ) : (
              <>
                {error && <p role="alert" className="border-b p-3 text-sm text-destructive">{error}</p>}
                <LinesTable
                  lines={shown}
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
            <Pager
              basePath={basePath}
              page={page}
              total={total}
              size={LINES_PAGE_SIZE}
              params={{ lista: active.id, ...(q ? { q } : {}) }}
            />
          </div>
          )}
        </section>
      )}
    </>
  );
}

// Anchos de las barras de relleno, variados para que no parezca una rejilla repetida.
const SKELETON_WIDTHS = ["w-4/5", "w-3/5", "w-11/12", "w-2/3", "w-3/4", "w-1/2"];

// La tabla vacía con sus títulos reales y filas de relleno: aparece al instante y los datos
// llegan después. Sirve también al cambiar de lista, de página o al buscar.
export function LinesTableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Cargando líneas">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className={`${TH} w-px text-right`}>N.º</TableHead>
            <TableHead className={TH}>Part. num.</TableHead>
            <TableHead className={TH}>Descripción</TableHead>
            <TableHead className={`${TH} text-right`}>Cantidad</TableHead>
            <TableHead className={TH}>Unidad</TableHead>
            <TableHead className={`${TH} text-right`}>Valor unit. ref.</TableHead>
            <TableHead className={`${TH} w-px`}><span className="sr-only">Acciones</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: rows }, (_, i) => (
            <TableRow key={i} className="hover:bg-transparent">
              <TableCell className={`${TD} w-px`}><Skeleton className="ml-auto h-4 w-5" /></TableCell>
              <TableCell className={TD}><Skeleton className={cn("h-4", SKELETON_WIDTHS[i % 6])} /></TableCell>
              <TableCell className={cn(TD, "w-1/2")}><Skeleton className={cn("h-4", SKELETON_WIDTHS[(i + 2) % 6])} /></TableCell>
              <TableCell className={TD}><Skeleton className="ml-auto h-4 w-8" /></TableCell>
              <TableCell className={TD}><Skeleton className="h-4 w-16" /></TableCell>
              <TableCell className={TD}><Skeleton className="ml-auto h-4 w-16" /></TableCell>
              <TableCell className={cn(TD, "p-1")}><Skeleton className="size-7" /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// Pantalla completa de Items mientras llega todo: la estructura se ve ya, vacía.
export function ItemsSkeleton() {
  return (
    <div role="status" aria-label="Cargando items">
      {/* Pestañas de las listas, con su contador. */}
      <div className="relative flex h-12 items-end gap-1 bg-layer-2 px-4 pt-1.5">
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-px bg-border" />
        <Skeleton className="mr-2 mb-3 size-5" />
        {[36, 28, 32].map((w, i) => (
          <div key={i} className={cn("flex h-full items-center gap-2 rounded-t-lg px-4", i === 0 ? "z-10 bg-background" : "mb-px bg-foreground/[0.05]")}>
            <Skeleton className="h-4" style={{ width: `${w * 3}px` }} />
            <Skeleton className="h-5 w-6 rounded-sm" />
          </div>
        ))}
      </div>
      {/* Datos del activo: ícono, etiqueta y valor en una línea, en dos filas. */}
      <div className="grid auto-cols-max grid-flow-col grid-rows-2 gap-x-8 gap-y-2 overflow-hidden border-b px-6 py-4">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-2">
            <Skeleton className="size-4" />
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-4 w-28" />
          </div>
        ))}
      </div>
      {/* Banda de agregar línea. */}
      <div className="border-b bg-surface-strong px-6 py-4">
        <div className="grid gap-4 md:grid-cols-[9rem_1fr_6.5rem_9rem_9rem_auto]">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex flex-col gap-2">
              <Skeleton className="h-3 w-16 bg-foreground/10" />
              <Skeleton className="h-10 rounded-lg bg-foreground/10" />
            </div>
          ))}
          <div className="flex flex-col gap-2">
            <Skeleton className="h-3 w-16 bg-transparent" />
            <Skeleton className="h-10 w-28 rounded-full bg-foreground/10" />
          </div>
        </div>
      </div>
      <div className="flex h-12 items-center gap-3 border-b px-6">
        <HugeiconsIcon icon={Search01Icon} aria-hidden className="size-5 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Buscar por número de parte o descripción</span>
      </div>
      <LinesTableSkeleton />
    </div>
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
  return (
    <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className={`${TH} w-px text-right`}>N.º</TableHead>
            <TableHead className={TH}>Part. num.</TableHead>
            <TableHead className={TH}>Descripción</TableHead>
            <TableHead className={`${TH} text-right`}>Cantidad</TableHead>
            <TableHead className={TH}>Unidad</TableHead>
            <TableHead className={`${TH} text-right`}>Valor unit. ref.</TableHead>
            <TableHead className={`${TH} w-px`}><span className="sr-only">Acciones</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((l) => (
            <LineRow
              key={l.id}
              line={l}
              n={l.n}
              duplicateOf={l.dupOf}
              editing={l.id === editingId}
              canEdit={canEdit}
              onEdit={onEdit}
              onRemove={onRemove}
            />
          ))}
        </TableBody>
      </Table>
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
  // Línea enviada y aún sin confirmar por el servidor.
  const saving = l.id.startsWith(TEMP_PREFIX);

  return (
    <TableRow
      className={cn(
        "last:border-b-0",
        saving && "opacity-60",
        editing && "bg-muted",
      )}
    >
      <TableCell className={`${TD} num text-right text-muted-foreground`}>{n}</TableCell>
      <TableCell className={`${TD} whitespace-nowrap font-mono text-xs`}>
        {l.partNumber || "—"}
        {duplicateOf && (
          <span className="block font-sans text-[0.6875rem] font-medium text-destructive">Repetido: igual a la línea {duplicateOf}</span>
        )}
      </TableCell>
      <TableCell className={`${TD} break-words`}>{l.description}</TableCell>
      <TableCell className={`${TD} num text-right`}>{l.quantity}</TableCell>
      <TableCell className={`${TD} whitespace-nowrap`}>{unitLabel(l.unit)}</TableCell>
      <TableCell className={`${TD} num whitespace-nowrap text-right`}>{l.referencePriceCents === null || l.quantity <= 0 ? "—" : formatCents(Math.round(l.referencePriceCents / l.quantity))}</TableCell>
      <TableCell className={cn(TD, "p-1 whitespace-nowrap")}>
        {saving ? null : (
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
            <ConfirmTap
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:text-destructive"
              aria-label={`Quitar la línea ${n} del contrato`}
              hint="Toca otra vez para quitar"
              onConfirm={() => onRemove(l.id)}
            >
              <HugeiconsIcon icon={Delete02Icon} className="size-4" />
            </ConfirmTap>
          </span>
        )}
      </TableCell>
    </TableRow>
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
  onAdded,
  onUpdate,
  onDone,
}: {
  org: string;
  contractId: string;
  listId: string;
  editing: LineView | null;
  onAdd: (line: LineView) => void;
  onAdded: () => void;
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
    const priceText = String(data.get("reference_price") ?? "").trim();

    // Se valida aquí para responder al instante; el servidor vuelve a validar.
    const fields: Record<string, string> = {};
    if (!description) fields.description = MESSAGES.description;
    if (quantity === null || quantity <= 0) fields.quantity = MESSAGES.quantity;
    if (!isUnit(unit)) fields.unit = MESSAGES.unit;
    let referencePriceCents: number | null = null;
    if (priceText) {
      const price = parseCents(priceText);
      if (!price.ok) fields.reference_price = price.error;
      else referencePriceCents = price.cents;
    }
    if (Object.keys(fields).length || quantity === null) {
      setState({ fields });
      return;
    }

    setState(undefined);
    const line = { listId, n: editing?.n ?? 0, partNumber, description, quantity, unit, referencePriceCents };

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
        for (const name of ["part_number", "description", "quantity", "unit", "reference_price"]) {
          const el = form.elements.namedItem(name);
          if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) {
            el.value = String(data.get(name) ?? "");
          }
        }
        setState(res);
      } else {
        onAdded();
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
      className="grid gap-4 md:grid-cols-[9rem_1fr_6.5rem_9rem_9rem_auto] md:items-start [&_input]:bg-background [&_select]:bg-background"
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
      <FormField name="reference_price" label="Precio ref. (total)" error={errors.reference_price}>
        {(a11y) => (
          <Input
            {...a11y}
            autoComplete="off"
            inputMode="decimal"
            maxLength={16}
            className="text-right font-mono"
            placeholder="0,00"
            defaultValue={editing?.referencePriceCents != null ? centsToInput(editing.referencePriceCents) : ""}
          />
        )}
      </FormField>
      {/* Etiqueta vacía del mismo alto que las demás: el botón queda a la altura de los campos. */}
      <Field>
        <FieldLabel aria-hidden className="max-md:hidden">&nbsp;</FieldLabel>
        <Button
          type="submit"
          size="icon"
          disabled={saving}
          className="h-10 gap-2 rounded-full px-5"
          aria-label={editing ? "Guardar cambios" : "Agregar línea"}
          title={editing ? "Guardar cambios" : "Agregar línea"}
        >
          <HugeiconsIcon icon={editing ? Tick02Icon : Add01Icon} className="size-5" strokeWidth={2} />
          {editing ? "Guardar" : "Añadir"}
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
