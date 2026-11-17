"use client";

import { PageFigures, PageShortcuts } from "@/components/page-shortcuts";
import { EmptyState, NO_RESULTS_IMAGE } from "@/components/empty-state";
import { HeaderAction } from "@/components/header-action";
import { PageSection } from "@/components/page-section";
import { useRouter } from "next/navigation";
import { startTransition, useOptimistic, useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { Add01Icon, Cancel01Icon, FileAddIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { LineSearch } from "@/components/line-search";
import { Pager } from "@/components/pager";
import { pageCount } from "@/lib/pagination";
import { BulkImport } from "@/components/bulk-import";
import { ListDetailsForm } from "@/components/list-details-form";
import { ListInfo } from "@/components/contract-list-info";
import { ListTabs } from "@/components/contract-list-tabs";
import { NewListDialog } from "@/components/new-list-dialog";
import type { ListView } from "@/components/contract-lists-model";
import { Button } from "@/components/ui/button";
import { removeLine } from "@/lib/contract-actions";
import { LINES_PAGE_SIZE, MAX_LINES_PER_LIST } from "@/lib/contracts";
import { LineView, OptimisticAction } from "@/components/contract-lines-model";
import { LinesTableSkeleton } from "@/components/contract-lines-skeleton";
import { LinesTable } from "@/components/contract-lines-table";
import { LineForm } from "@/components/contract-line-form";

// Las listas del proceso (una por activo). Solo llega la página abierta de la lista abierta:
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
        <p className="p-6 text-muted-foreground">Este proceso no tiene items.</p>
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
            <Button className="h-9 gap-2" onClick={() => setNewOpen(true)}>
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



