"use client";

import { useSupplyFilter } from "@/components/use-supply-filter";
import { EmptyState, NO_RESULTS_IMAGE } from "@/components/empty-state";
import { setRightPanelOpen } from "@/components/use-side-panel";
import { useEffect, useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { ListInfo } from "@/components/contract-list-info";
import { ListTabs } from "@/components/contract-list-tabs";
import type { ListView } from "@/components/contract-lists-model";
import { LineSearch } from "@/components/line-search";
import { PageSection } from "@/components/page-section";
import { DeliveryActions } from "@/components/delivery-sheet";
import { ReconcilePanel } from "@/components/reconcile-panel";
import { HeaderSlot } from "@/components/header-action";
import { PageFigures, PageFooterActions, PagePagination, type PageFigure } from "@/components/page-shortcuts";
import { useReconcile } from "@/components/use-reconcile";
import { STATE, type SupplyState } from "@/components/supply-progress";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { LINES_PAGE_SIZE } from "@/lib/contracts";
import { formatCents } from "@/lib/money";
import { removeLine } from "@/lib/contract-actions";
import { toast } from "sonner";
import { DEFAULT_SUPPLY_COLUMNS, useSupplyColumns, type SupplyColumn } from "@/components/supply-columns";
import { SupplyList, SupplyListSkeleton } from "@/components/supply-list";
import { AddLineButton, SupplyAddLine } from "@/components/supply-add-line";
import { cn } from "@/lib/utils";
import { PackageMovingIcon, Search01Icon } from "@hugeicons/core-free-icons";

export type SupplyLine = {
  id: string;
  listId: string;
  n: number;
  partNumber: string;
  // Código interno de la línea (segundo código); se muestra como chip.
  internalCode: string;
  // Medida, tipo u otro dato interno de la línea.
  reference: string;
  description: string;
  quantity: number;
  unit: string;
  reserved: number;
  purchased: number;
  delivered: number;
  costCents: number | null;
  // Precio referencial TOTAL de la línea (sin IVA): lo que paga el proceso por ella.
  referenceCents: number | null;
  state: SupplyState;
  // Lo asignado a esta línea (productos de la bodega o reservados por llegar), en el orden en que se asignó.
  assigned: { name: string; code: string; quantity: number; kind: "bodega" | "compra"; costCents: number | null }[];
};

// Orden de los filtros: del ciclo de una línea, de nada asignado a entregado.
const STATE_ORDER: SupplyState[] = ["pending", "quoted", "purchased", "partial", "in_stock", "delivered"];

export type { SupplyState };

// Filtro por estado como chip: relleno cuando está activo, con borde cuando no.
const CHIP = (active: boolean) =>
  cn(
    "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
    active ? "border-foreground bg-foreground text-background" : "bg-background text-muted-foreground hover:border-foreground/40 hover:text-foreground",
  );

export function SupplyBoard({
  org,
  contractId,
  lists,
  lines: serverLines,
  counts,
  activeId,
  page: serverPage,
  total: serverTotal,
  q,
  estado: serverState,
  basePath,
  canAct,
  money,
}: {
  org: string;
  contractId: string;
  lists: ListView[];
  lines: SupplyLine[];
  counts: Record<SupplyState, number>;
  activeId: string | null;
  page: number;
  total: number;
  q: string;
  estado: SupplyState | "";
  basePath: string;
  canAct: boolean;
  // Entregas ya registradas en el proceso.
  // Valor del proceso (con IVA) y costo de lo ya cubierto, para la barra de abajo.
  money: { totalCents: number; vatRate: number; coveredCents: number; unknown: number } | null;
}) {
  const router = useRouter();
  const filter = useSupplyFilter({
    lines: serverLines, total: serverTotal, page: serverPage, estado: serverState,
    counts, activeId, q, basePath,
  });
  const { lines, total, page, estado } = filter;
  const [navigating, startNav] = useTransition();
  // La lista elegida se marca al instante; las líneas llegan cuando responde el servidor.
  const [shownActiveId, setShownActiveId] = useOptimistic(activeId);
  const active = lists.find((l) => l.id === shownActiveId) ?? lists[0] ?? null;
  const loaded = lists.find((l) => l.id === activeId) ?? lists[0] ?? null;
  const switching = active?.id !== loaded?.id;
  const [selectedLine, setSelectedLine] = useState<SupplyLine | null>(null);
  const selectedId = selectedLine?.id ?? null;
  // Panel de conciliación (derecha). Con una línea de factura elegida, tocar una fila de esta tabla le reserva.
  const [addOpen, setAddOpen] = useState(false);
  const rc = useReconcile(org, contractId);
  // Conserva el historial abierto si guardar una gestión saca la línea del filtro Pendiente.
  const focus = lines.find((l) => l.id === selectedId) ?? (selectedLine?.listId === loaded?.id ? selectedLine : null);
  const [closing, setClosing] = useState(false);
  // Sube al limpiar para que el campo de búsqueda se vacíe (no depende del texto, así no pierde el cursor al escribir).
  const [searchReset, setSearchReset] = useState(0);
  // Líneas con sus productos asignados desplegados; por defecto todas contraídas.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // Columnas opcionales que la persona eligió ver (recordadas en su navegador).
  const columns = useSupplyColumns();
  const cols = columns.cols;
  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }
  // Ancho que la columna del panel le quita a toda la interfaz (el shell lo aplica como relleno a la derecha); se anima con el panel.
  const panelShown = rc.open && !closing;
  useEffect(() => {
    document.documentElement.style.setProperty("--assign-w", panelShown ? "32rem" : "0rem");
    setRightPanelOpen(panelShown);
    return () => {
      document.documentElement.style.removeProperty("--assign-w");
      setRightPanelOpen(false);
    };
  }, [panelShown]);

  // Se deja correr la animación de salida antes de quitar el panel.
  function closePanel() {
    setClosing(true);
    setTimeout(() => {
      rc.hide();
      setSelectedLine(null);
      setClosing(false);
    }, 200);
  }
  // La línea abierta se quita desde el pie del panel.
  const [removing, startRemove] = useTransition();
  function removeFocused() {
    if (!focus) return;
    const id = focus.id;
    startRemove(async () => {
      const res = await removeLine(org, contractId, id);
      if (res?.error) return void toast.error(res.error);
      closePanel();
      router.refresh();
    });
  }
  // Abre o cierra el panel sin tocar una línea. Con el proceso en ejecución abre directo en Facturas: ahí se agregan items.
  function togglePanel() {
    if (panelShown) return closePanel();
    rc.unpick();
    setSelectedLine(null);
    rc.show();
    if (canAct) rc.setSource("facturas");
  }

  function go(next: { lista?: string; q?: string; estado?: string; page?: number }) {
    const sp = new URLSearchParams();
    sp.set("lista", next.lista ?? loaded?.id ?? "");
    const nq = next.q ?? q;
    const ne = next.estado ?? estado;
    if (nq) sp.set("q", nq);
    if (ne) sp.set("estado", ne);
    if (next.page && next.page > 1) sp.set("page", String(next.page));
    const href = `${basePath}?${sp}`;
    const sameList = (next.lista ?? loaded?.id) === loaded?.id;
    if (sameList && nq === q && !next.page && filter.select(ne as SupplyState | "", href)) return;
    startNav(() => {
      if (next.lista) setShownActiveId(next.lista);
      router.push(href, { scroll: false });
    });
  }

  if (lists.length === 0) {
    return (
      <PageSection label="Sin listas">
        <p className="max-w-xl text-muted-foreground">
          Este proceso aún no tiene listas de referencia. Crea una en <strong className="text-foreground">Listas</strong>{" "}
          para empezar a abastecer.
        </p>
      </PageSection>
    );
  }

  const listCounts: Record<string, number> = {};
  for (const l of lists) listCounts[l.id] = l.count;
  // La próxima línea por atender: la primera a la que aún le falta cubrir algo.
  const totalLines = counts.pending + counts.quoted + counts.partial + counts.purchased + counts.in_stock + counts.delivered;

  // Valor del proceso sin IVA contra el costo de lo cubierto: cuánto falta por cubrir.
  const figures: PageFigure[] = [];
  if (money) {
    const net = Math.round((money.totalCents * 100) / (100 + money.vatRate));
    const left = net - money.coveredCents;
    figures.push(
      { label: "Contrato", value: formatCents(money.totalCents) },
      { label: "Sin IVA", value: formatCents(net) },
      { label: "Cubierto", value: formatCents(money.coveredCents), note: money.unknown > 0 ? `+${money.unknown} sin costo` : undefined },
      left >= 0 ? { label: "Falta", value: formatCents(left), tone: "warn" } : { label: "Excede", value: formatCents(-left), tone: "warn" },
    );
  }

  // La página ocupa todo el alto: solo el contenido de la tabla se desplaza; pestañas, datos del activo, buscador, filtros y
  // cabecera de columnas se quedan quietos.
  return (
    // En escritorio el tablero llega hasta el borde inferior, por debajo del pie translúcido: el relleno inferior de la página
    // (la altura del pie) se cubre con un alto mayor y un margen negativo igual, y la lista deja ese mismo espacio libre al
    // final. Así las filas pasan bajo la barra (se ven desenfocadas, como en las demás secciones) y la página no se desplaza.
    <div className="h-full md:-mb-(--footer-height) md:h-[calc(100%+var(--footer-height))]">
    <div className="flex h-full min-w-0 flex-col">
      <PageFigures figures={figures} />
      <PagePagination
        basePath={basePath}
        page={page}
        total={total}
        size={LINES_PAGE_SIZE}
        params={{ lista: loaded?.id ?? "", ...(q ? { q } : {}), ...(estado ? { estado } : {}) }}
      />
      {/* Abastecer, en el encabezado: abre el panel sin elegir una línea (con el proceso en ejecución, desde ahí se agregan
          items). Se oculta con un fundido mientras el panel ocupa esa parte del encabezado. */}
      <HeaderSlot>
        <div
          inert={panelShown}
          className={cn(
            "flex h-full items-stretch transition-opacity ease-out motion-reduce:transition-none",
            panelShown ? "pointer-events-none opacity-0 duration-75" : "opacity-100 delay-200 duration-150",
          )}
        >
          <Button type="button" variant="brand" className="-mr-4 h-full! gap-2 border-0! bg-clip-border! px-5" aria-pressed={panelShown} onClick={togglePanel}>
            <HugeiconsIcon icon={PackageMovingIcon} className="size-4" />
            Abastecer
          </Button>
        </div>
      </HeaderSlot>
      <PageFooterActions>
        <span aria-live="polite" className="whitespace-nowrap text-sm text-muted-foreground">
          <span className="num">{q || estado ? `${total} de ${totalLines}` : totalLines}</span> líneas
        </span>
      </PageFooterActions>
      <ListTabs
        lists={lists}
        counts={listCounts}
        activeId={active?.id ?? null}
        onSelect={(id) => go({ lista: id, q: "", estado: "" })}
        trailing={
          loaded && (
            <DeliveryActions
              org={org}
              contractId={contractId}
              listId={loaded.id}
              listName={loaded.name}
              canAct={canAct}
              ready={counts.in_stock}
            />
          )
        }
      />
      {loaded && (
        <ListInfo
          key={loaded.id}
          org={org}
          contractId={contractId}
          list={loaded}
          lineCount={loaded.count}
          canEdit={false}
          editing={false}
          onEdit={() => {}}
        />
      )}

      <section className="flex min-h-0 flex-1 flex-col">
        {/* Fila 1: búsqueda y filtros activos. */}
        <div className="flex h-12 shrink-0 items-stretch border-b bg-accent/60">
          {/* La clave no incluye el texto: si cambiara al buscar, el campo se recrearía y perdería el cursor a cada pausa. */}
          <LineSearch
            key={`${loaded?.id}:${searchReset}`}
            q={q}
            onSearch={(next) => go({ q: next })}
            placeholder="Buscar por n.º de parte, código interno, descripción o producto asignado"
          />
        </div>

        {/* Fila 2: filtros por estado, como pestañas con su recuento (de líneas). */}
        <div className="flex shrink-0 items-center gap-2 border-b px-6 py-2">
          <div role="group" aria-label="Filtrar por estado" className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto [scrollbar-width:none]">
          <button type="button" aria-pressed={estado === ""} onClick={() => go({ estado: "" })} className={CHIP(estado === "")}>
            Todas
            <span className="num text-xs opacity-70">{totalLines}</span>
          </button>
          {STATE_ORDER.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={estado === s}
              onClick={() => go({ estado: estado === s ? "" : s })}
              className={cn(CHIP(estado === s), counts[s] === 0 && estado !== s && "opacity-60")}
            >
              <span aria-hidden className={cn("size-2 rounded-full", STATE[s].dot)} />
              {STATE[s].label}
              <span className="num text-xs opacity-70">{counts[s]}</span>
            </button>
          ))}
          </div>
          {lines.some((l) => l.assigned.length > 0) && (
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0"
              onClick={() => {
                const withProducts = lines.filter((l) => l.assigned.length > 0).map((l) => l.id);
                const allOpen = withProducts.every((id) => expanded.has(id));
                setExpanded(allOpen ? new Set() : new Set(withProducts));
              }}
            >
              {lines.filter((l) => l.assigned.length > 0).every((l) => expanded.has(l.id)) ? "Contraer todo" : "Expandir todo"}
            </Button>
          )}
          {(q || estado) && (
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0"
              onClick={() => {
                setSearchReset((n) => n + 1);
                go({ q: "", estado: "" });
              }}
            >
              Limpiar
            </Button>
          )}
          {canAct && loaded && (
            <AddLineButton open={addOpen} onToggle={() => setAddOpen((v) => !v)} listName={loaded.name} />
          )}
        </div>

        {canAct && loaded && addOpen && <SupplyAddLine org={org} contractId={contractId} listId={loaded.id} />}


        {/* Las consultas al servidor muestran la estructura de la tabla; los filtros locales son inmediatos. */}
        {switching || navigating ? (
          <SupplyTableSkeleton cols={cols} rows={Math.min(8, Math.max(3, switching ? (active?.count ?? 5) : lines.length))} />
        ) : (
          <div className="relative flex min-h-0 flex-1 flex-col">
            {lines.length === 0 ? (
              q || estado ? (
                <EmptyState image={NO_RESULTS_IMAGE}>Ninguna línea coincide con el filtro.</EmptyState>
              ) : (
                <p className="p-6 text-muted-foreground">Esta lista no tiene líneas.</p>
              )
            ) : (
              <SupplyList
                lines={lines}
                cols={cols}
                columns={columns}
                expanded={expanded}
                selectedId={selectedId}
                onToggle={toggleExpanded}
                onSelect={(l) => {
                  if (selectedId === l.id && rc.open) return;
                  rc.unpick();
                  setSelectedLine(l);
                  rc.show();
                }}
              />
            )}
          </div>
        )}
      </section>

    </div>
    {rc.open && (
      <ReconcilePanel
        rc={rc}
        org={org}
        contractId={contractId}
        focus={focus}
        canAct={canAct}
        vatRate={money?.vatRate}
        closing={closing}
        addToListId={canAct && loaded ? loaded.id : undefined}
        onRemove={canAct ? removeFocused : undefined}
        removing={removing}
        onClose={closePanel}
      />
    )}
    </div>
  );
}

function SupplyTableSkeleton({ rows = 6, cols = DEFAULT_SUPPLY_COLUMNS }: { rows?: number; cols?: Set<SupplyColumn> }) {
  return <SupplyListSkeleton rows={rows} cols={cols} />;
}

// Estructura de la pantalla mientras llegan los datos.
export function SupplySkeleton() {
  return (
    <div role="status" aria-label="Cargando abastecimiento">
      <div className="flex h-12 items-center gap-6 border-b px-6">
        <Skeleton className="size-5" />
        {[36, 28, 32].map((w, i) => (
          <Skeleton key={i} className="h-4" style={{ width: `${w * 4}px` }} />
        ))}
      </div>
      <div className="flex h-12 items-center gap-3 border-b bg-accent/60 px-6">
        <HugeiconsIcon icon={Search01Icon} aria-hidden className="size-5 text-foreground" />
        <span className="text-sm text-muted-foreground">Buscar por número de parte o descripción</span>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-b px-6 py-2">
        {["Todas", ...STATE_ORDER.map((s) => STATE[s].label)].map((label) => (
          <span key={label} className="inline-flex h-7 items-center gap-1.5 rounded-full border bg-background px-3 text-xs font-medium text-muted-foreground">
            {label}
            <Skeleton className="h-3.5 w-4" />
          </span>
        ))}
      </div>
      <SupplyTableSkeleton />
    </div>
  );
}
