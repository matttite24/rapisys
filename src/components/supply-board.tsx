"use client";

import { useSupplyFilter } from "@/components/use-supply-filter";
import { StateLabel } from "@/components/state-label";
import { EmptyState, NO_RESULTS_IMAGE } from "@/components/empty-state";
import { setRightPanelOpen } from "@/components/use-side-panel";
import { useEffect, useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { ListInfo } from "@/components/contract-list-info";
import { ListTabs } from "@/components/contract-list-tabs";
import type { ListView } from "@/components/contract-lists-model";
import { LineSearch } from "@/components/line-search";
import { PageSection, TABLE_TD, TABLE_TH } from "@/components/page-section";
import { DeliveryActions } from "@/components/delivery-sheet";
import { ReconcilePanel } from "@/components/reconcile-panel";
import { PageFigures, PageFooterActions, PagePagination, type PageFigure } from "@/components/page-shortcuts";
import { useReconcile } from "@/components/use-reconcile";
import { MiniProgress, STATE, type SupplyState } from "@/components/supply-progress";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { LINES_PAGE_SIZE } from "@/lib/contracts";
import { formatCents } from "@/lib/money";
import { removeLine } from "@/lib/contract-actions";
import { toast } from "sonner";
import { PRODUCT_COL, ProductCell } from "@/components/product-cell";
import { DEFAULT_SUPPLY_COLUMNS, SupplyColumnsMenu, useSupplyColumns, type SupplyColumn } from "@/components/supply-columns";
import { AddLineButton, SupplyAddLine } from "@/components/supply-add-line";
import { unitLabel } from "@/lib/units";
import { cn } from "@/lib/utils";
import { ArrowRight01Icon, PackageIcon, PackageMovingIcon, Search01Icon } from "@hugeicons/core-free-icons";

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

const TH = TABLE_TH;
// Lista de líneas: filas sueltas con esquinas redondeadas y un poco de aire entre ellas, en vez de una tabla de borde a borde.
const LIST = "min-h-0 flex-1 overflow-auto px-3 pb-3";
// El -mt-1.5 quita el hueco que border-spacing deja arriba: la cabecera queda pegada a la fila de filtros.
const LIST_TABLE = "-mt-1.5 w-full border-separate border-spacing-y-1.5 text-sm";
// Cabecera de columnas: barra suave de esquinas rectas y ancho completo (la sombra lateral cubre el margen de la lista); la sombra
// del color de la página tapa el hueco bajo ella al desplazarse.
const LIST_HEAD =
  "sticky top-0 z-10 [&_th]:bg-surface-strong [&_th]:shadow-[0_6px_0_var(--background)] [&_th:first-child]:shadow-[-0.75rem_0_0_var(--surface-strong),0_6px_0_var(--background)] [&_th:last-child]:shadow-[0.75rem_0_0_var(--surface-strong),0_6px_0_var(--background)]";
const TD = cn(TABLE_TD, "py-1.5 align-middle");
// Fila de una línea del proceso: con más aire que las de sus productos asignados.
const PTD = cn(TABLE_TD, "py-3 align-middle");

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
    <div className="h-full">
    <div className="flex h-full min-w-0 flex-col">
      <PageFigures figures={figures} />
      <PagePagination
        basePath={basePath}
        page={page}
        total={total}
        size={LINES_PAGE_SIZE}
        params={{ lista: loaded?.id ?? "", ...(q ? { q } : {}), ...(estado ? { estado } : {}) }}
      />
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
          {/* Abre el panel de abastecimiento sin elegir una línea: con el proceso en ejecución, desde ahí se agregan items. */}
          <div className="flex shrink-0 items-stretch border-l">
            <Button type="button" variant={panelShown ? "secondary" : "default"} size="sm" className={cn("h-full gap-2 rounded-none px-6", !panelShown && "bg-state-running-solid text-state-running-on hover:bg-state-running-solid/90")} aria-pressed={panelShown} onClick={togglePanel}>
              <HugeiconsIcon icon={PackageMovingIcon} className="size-4" />
              Abastecimiento
            </Button>
          </div>
        </div>

        {/* Fila 2: filtros por estado, como pestañas con su recuento (de líneas). */}
        <div className="flex shrink-0 items-center gap-2 border-b px-4 py-2">
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

        {loaded && (
          <DeliveryActions
            org={org}
            contractId={contractId}
            listId={loaded.id}
            listName={loaded.name}
            canAct={canAct}
            ready={counts.in_stock}
            hidden={panelShown}
          />
        )}

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
              <div className={LIST}>
                <table className={LIST_TABLE}>
                  <thead className={LIST_HEAD}>
                    <tr>
                      <th scope="col" className={`${TH} w-px pr-0`}><SupplyColumnsMenu {...columns} /></th>
                      <th scope="col" className={`${TH} w-px pl-2 text-right`}>N.º</th>
                      <th scope="col" className={`${TH} ${PRODUCT_COL}`}>Producto</th>
                      {cols.has("quantity") && <th scope="col" className={`${TH} w-28 px-2 text-right`}>Cantidad</th>}
                      {cols.has("reference") && <th scope="col" className={`${TH} w-28 px-2 text-right`}>Precio ref.</th>}
                      {cols.has("cost") && <th scope="col" className={`${TH} w-28 px-2 text-right`}>Costo</th>}
                      {cols.has("margin") && <th scope="col" className={`${TH} w-28 px-2 text-right`}>Margen</th>}
                      {cols.has("state") && <th scope="col" className={`${TH} w-72`}>Estado</th>}
                    </tr>
                  </thead>
                  {/* Tabla jerárquica: cada línea del proceso es una fila de un solo renglón de números y, debajo (al
                      desplegarla con su botón), una fila por producto asignado con las mismas columnas. */}
                  {lines.map((l) => {
                    const lineTotal = l.assigned.reduce((sum, a) => sum + (a.costCents === null ? 0 : Math.round(a.costCents * a.quantity)), 0);
                    const hasCost = l.assigned.some((a) => a.costCents !== null);
                    const margin = hasCost && l.referenceCents !== null ? l.referenceCents - lineTotal : null;
                    const children = l.assigned.length > 0;
                    const open = expanded.has(l.id);
                    const unit = unitLabel(l.unit);
                    return (
                      <tbody
                        key={l.id}
                        // Tocar la fila la selecciona y abre el panel. Los productos se despliegan con su propio botón.
                        onClick={() => {
                          if (selectedId === l.id && rc.open) return;
                          rc.unpick();
                          setSelectedLine(l);
                          rc.show();
                        }}
                        className={cn(
                          "cursor-pointer transition-colors [&>tr>td]:bg-foreground/[0.035] [&>tr>td:first-child]:rounded-l-lg [&>tr>td:last-child]:rounded-r-lg hover:[&>tr:first-child>td]:bg-foreground/[0.07] [&>tr:not(:first-child)>td]:bg-foreground/[0.02]",
                          selectedId === l.id && "[&>tr:first-child>td]:bg-foreground/[0.09]",
                        )}
                      >
                        <tr
                          aria-selected={selectedId === l.id || undefined}
                          // La fila se abre también con el teclado (Tab hasta ella y Enter o Espacio).
                          tabIndex={0}
                          aria-label={`Línea ${l.n}: ${l.description}. ${STATE[l.state].label}. Abrir en el panel`}
                          onKeyDown={(e) => {
                            if (e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " ")) return;
                            e.preventDefault();
                            e.currentTarget.click();
                          }}
                          className="outline-none focus-visible:[&>td]:bg-foreground/[0.09]"
                        >
                          <td className={cn(PTD, "w-px pr-0")}>
                            {children ? (
                              <button
                                type="button"
                                aria-expanded={open}
                                aria-label={`${open ? "Ocultar" : "Mostrar"} ${l.assigned.length} ${l.assigned.length === 1 ? "producto asignado" : "productos asignados"} de la línea ${l.n}`}
                                title={open ? "Ocultar productos asignados" : "Mostrar productos asignados"}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleExpanded(l.id);
                                }}
                                className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                              >
                                <HugeiconsIcon icon={ArrowRight01Icon} className={cn("size-4 transition-transform duration-150", open && "rotate-90")} />
                              </button>
                            ) : (
                              <span className="block size-7" />
                            )}
                          </td>
                          <td className={cn(PTD, "num pl-2 text-right text-muted-foreground")}>
                            {/* La línea abierta en el panel se marca con su número sobre fondo oscuro. */}
                            <span className={cn("inline-block min-w-6 rounded-md px-1.5 py-0.5 text-center transition-colors", selectedId === l.id && "bg-foreground font-medium text-background")}>{l.n}</span>
                          </td>
                          <td className={cn(PTD, "break-words")}>
                            <ProductCell
                              description={l.description}
                              partNumber={l.partNumber}
                              internalCode={l.internalCode}
                              reference={l.reference}
                              bold={selectedId === l.id}
                              extra={
                                children ? (
                                  // Chip de los productos asignados: se ve sin desplegar y, al tocarlo, despliega o pliega.
                                  <button
                                    type="button"
                                    aria-expanded={open}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleExpanded(l.id);
                                    }}
                                    className="inline-flex h-5 items-center gap-1 rounded-full bg-state-stock/12 px-2 text-xs font-medium text-state-stock-ink transition-colors hover:bg-state-stock/20 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                                  >
                                    <HugeiconsIcon icon={PackageIcon} className="size-3.5" />
                                    {l.assigned.length} {l.assigned.length === 1 ? "producto" : "productos"}
                                  </button>
                                ) : undefined
                              }
                            />
                          </td>
                          {cols.has("quantity") && (
                          <td className={cn(PTD, "px-2 num whitespace-nowrap text-right")}>
                            <span className="font-medium">{l.quantity}</span> <span className="font-sans text-xs text-muted-foreground">{unit}</span>
                          </td>
                          )}
                          {cols.has("reference") && (
                          <td
                            className={cn(PTD, "px-2 num whitespace-nowrap text-right text-foreground/80")}
                            title={l.referenceCents !== null && l.quantity > 0 ? `${formatCents(Math.round(l.referenceCents / l.quantity))} c/u` : undefined}
                          >
                            {l.referenceCents === null ? <span className="text-muted-foreground/40">—</span> : formatCents(l.referenceCents)}
                          </td>
                          )}
                          {cols.has("cost") && (
                          <td className={cn(PTD, "px-2 num whitespace-nowrap text-right")}>
                            {hasCost ? <span className="font-medium">{formatCents(lineTotal)}</span> : <span className="text-muted-foreground/40">—</span>}
                          </td>
                          )}
                          {/* Margen contra el precio referencial: en rojo si lo asignado cuesta más de lo que paga el proceso. */}
                          {cols.has("margin") && (
                          <td className={cn(PTD, "px-2 num whitespace-nowrap text-right")}>
                            {margin === null ? (
                              <span className="text-muted-foreground/40">—</span>
                            ) : margin < 0 ? (
                              <span className="font-medium text-destructive" title="Lo asignado cuesta más que el precio referencial">−{formatCents(-margin)}</span>
                            ) : (
                              <span className="text-state-stock-ink">+{formatCents(margin)}</span>
                            )}
                          </td>
                          )}
                          {cols.has("state") && (
                          <td className={PTD}>
                            <span className="flex w-full min-w-0 items-center gap-3 pr-2">
                                <StateLabel tone={STATE[l.state].tone} className={cn("w-28 shrink-0 whitespace-nowrap", l.state === "pending" ? "font-normal text-muted-foreground" : "font-medium")}>{STATE[l.state].label}</StateLabel>
                                <MiniProgress stock={l.reserved} purchased={l.purchased} delivered={l.delivered} total={l.quantity} className="flex-1" />
                            </span>
                          </td>
                          )}
                        </tr>
                        {children &&
                          open &&
                          l.assigned.map((a, i) => (
                            <tr key={`${a.kind}-${a.code}-${i}`}>
                              <td className={TD} />
                              <td className={TD} />
                              <td className={cn(TD, "max-w-0 pl-8")}>
                                <span className="block truncate text-[0.8125rem] text-foreground/85" title={a.name}>{a.name}</span>
                                <span className={cn("block truncate font-mono text-xs", a.code ? "text-muted-foreground" : "text-muted-foreground/70")}>{a.code || "Sin código"}</span>
                              </td>
                              {cols.has("quantity") && (
                              <td className={cn(TD, "px-2 num whitespace-nowrap text-right text-[0.8125rem]")}>
                                {a.quantity} <span className="font-sans text-xs text-muted-foreground">{unit}</span>
                              </td>
                              )}
                              {cols.has("reference") && (
                              <td className={TD} />
                              )}
                              {cols.has("cost") && (
                              <td
                                className={cn(TD, "px-2 num whitespace-nowrap text-right text-[0.8125rem]")}
                                title={a.costCents === null ? undefined : `${formatCents(a.costCents)} c/u`}
                              >
                                {a.costCents === null ? <span className="text-muted-foreground">Sin costo</span> : formatCents(Math.round(a.costCents * a.quantity))}
                              </td>
                              )}
                              {cols.has("margin") && (
                              <td className={TD} />
                              )}
                              {cols.has("state") && (
                              <td className={TD}>
                                <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                                  <span aria-hidden className={cn("size-1.5 rounded-full", a.kind === "compra" ? STATE.purchased.dot : STATE.in_stock.dot)} />
                                  {a.kind === "compra" ? "Por llegar" : "En bodega"}
                                </span>
                              </td>
                              )}
                            </tr>
                          ))}
                      </tbody>
                    );
                  })}
                </table>
              </div>
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

const WIDTHS = ["w-4/5", "w-3/5", "w-11/12", "w-2/3", "w-3/4", "w-1/2"];

function SupplyTableSkeleton({ rows = 6, cols = DEFAULT_SUPPLY_COLUMNS }: { rows?: number; cols?: Set<SupplyColumn> }) {
  return (
    <div role="status" aria-label="Cargando líneas" aria-busy="true" className={LIST}>
      <table className={LIST_TABLE}>
        <thead className={LIST_HEAD}>
          <tr>
            <th scope="col" className={`${TH} w-px pr-0`}><span className="sr-only">Productos asignados</span></th>
            <th scope="col" className={`${TH} w-px pl-2 text-right`}>N.º</th>
            <th scope="col" className={`${TH} ${PRODUCT_COL}`}>Producto</th>
            {cols.has("quantity") && <th scope="col" className={`${TH} w-28 px-2 text-right`}>Cantidad</th>}
            {cols.has("reference") && <th scope="col" className={`${TH} w-28 px-2 text-right`}>Precio ref.</th>}
            {cols.has("cost") && <th scope="col" className={`${TH} w-28 px-2 text-right`}>Costo</th>}
            {cols.has("margin") && <th scope="col" className={`${TH} w-28 px-2 text-right`}>Margen</th>}
            {cols.has("state") && <th scope="col" className={`${TH} w-72`}>Estado</th>}
          </tr>
        </thead>
        {/* Filas con la misma forma que las reales: descripción y códigos, números en un renglón, estado con su barra. */}
        <tbody>
          {Array.from({ length: rows }, (_, i) => (
            <tr key={i} className="[&>td]:bg-foreground/[0.035] [&>td:first-child]:rounded-l-lg [&>td:last-child]:rounded-r-lg">
              <td className={cn(PTD, "w-px pr-0")}><span className="block size-7" /></td>
              <td className={cn(PTD, "w-px pl-2")}><Skeleton className="ml-auto h-4 w-5" /></td>
              <td className={PTD}>
                <Skeleton className={cn("h-4", WIDTHS[(i + 2) % 6])} />
                <Skeleton className="mt-1.5 h-3 w-28" />
              </td>
              {cols.has("quantity") && <td className={PTD}><Skeleton className="ml-auto h-4 w-14" /></td>}
              {cols.has("reference") && <td className={PTD}><Skeleton className="ml-auto h-4 w-16" /></td>}
              {cols.has("cost") && <td className={PTD}><Skeleton className="ml-auto h-4 w-16" /></td>}
              {cols.has("margin") && <td className={PTD}><Skeleton className="ml-auto h-4 w-14" /></td>}
              {cols.has("state") && <td className={PTD}><Skeleton className="h-4 w-40" /></td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
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
      <div className="flex flex-wrap items-center gap-2 border-b-2 bg-accent/30 px-4 py-2.5">
        {["Todas", ...STATE_ORDER.map((s) => STATE[s].label)].map((label) => (
          <span key={label} className="inline-flex h-8 items-center gap-2 border bg-background px-3 text-sm font-medium text-muted-foreground">
            {label}
            <Skeleton className="h-3.5 w-4" />
          </span>
        ))}
      </div>
      <SupplyTableSkeleton />
    </div>
  );
}
