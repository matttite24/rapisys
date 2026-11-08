"use client";

import { useSupplyFilter } from "@/components/use-supply-filter";
import { StateLabel } from "@/components/state-label";
import { TAB, TABS_ROW, TabCount } from "@/components/count-tabs";
import { EmptyState, NO_RESULTS_IMAGE } from "@/components/empty-state";
import { setRightPanelOpen } from "@/components/use-side-panel";
import { useEffect, useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { ListInfo, ListTabs, type ListView } from "@/components/contract-lists";
import { LineSearch } from "@/components/line-search";
import { PageSection, TABLE_TD, TABLE_TH } from "@/components/page-section";
import { Pager } from "@/components/pager";
import { DeliveryActions } from "@/components/delivery-sheet";
import { ReconcilePanel } from "@/components/reconcile-panel";
import { PageFigures, PageFooterActions, type PageFigure } from "@/components/page-shortcuts";
import { useReconcile } from "@/components/use-reconcile";
import { Progress, STATE, type SupplyState } from "@/components/supply-progress";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { LINES_PAGE_SIZE } from "@/lib/contracts";
import { formatCents } from "@/lib/money";
import { unitLabel } from "@/lib/units";
import { cn } from "@/lib/utils";
import { ArrowRight01Icon, Search01Icon } from "@hugeicons/core-free-icons";

export type SupplyLine = {
  id: string;
  listId: string;
  n: number;
  partNumber: string;
  description: string;
  quantity: number;
  unit: string;
  cpc: string;
  reserved: number;
  purchased: number;
  delivered: number;
  costCents: number | null;
  state: SupplyState;
  // Lo asignado a esta línea (productos de la bodega o reservados por llegar), en el orden en que se asignó.
  assigned: { name: string; code: string; quantity: number; kind: "bodega" | "compra"; costCents: number | null }[];
};

const TH = cn(TABLE_TH, "font-bold text-foreground");
const TD = cn(TABLE_TD, "py-2 align-middle");

// Orden de los filtros: del ciclo de una línea, de nada asignado a entregado.
const STATE_ORDER: SupplyState[] = ["pending", "quoted", "purchased", "partial", "in_stock", "delivered"];

export type { SupplyState };

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
  deliveries,
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
  // Entregas ya registradas en el contrato.
  deliveries: number;
  // Valor del contrato (con IVA) y costo de lo ya cubierto, para la barra de abajo.
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
  const rc = useReconcile(org, contractId);
  // Conserva el historial abierto si guardar una gestión saca la línea del filtro Pendiente.
  const focus = lines.find((l) => l.id === selectedId) ?? (selectedLine?.listId === loaded?.id ? selectedLine : null);
  const [closing, setClosing] = useState(false);
  // Sube al limpiar para que el campo de búsqueda se vacíe (no depende del texto, así no pierde el cursor al escribir).
  const [searchReset, setSearchReset] = useState(0);
  // Líneas con sus productos asignados desplegados; por defecto todas contraídas.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
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
          Este contrato aún no tiene listas de referencia. Crea una en <strong className="text-foreground">Listas</strong>{" "}
          para empezar a abastecer.
        </p>
      </PageSection>
    );
  }

  const listCounts: Record<string, number> = {};
  for (const l of lists) listCounts[l.id] = l.count;
  // La próxima línea por atender: la primera a la que aún le falta cubrir algo.
  const nextId = canAct ? lines.find((l) => l.reserved + l.purchased < l.quantity)?.id : undefined;
  const totalLines = counts.pending + counts.quoted + counts.partial + counts.purchased + counts.in_stock + counts.delivered;

  // Valor del contrato sin IVA contra el costo de lo cubierto: cuánto falta por cubrir.
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
            placeholder="Buscar por n.º de parte, descripción o producto asignado"
          />
        </div>

        {/* Fila 2: filtros por estado, como pestañas con su recuento (de líneas). */}
        <div role="group" aria-label="Filtrar por estado" className={cn(TABS_ROW, "shrink-0")}>
          <button type="button" aria-pressed={estado === ""} onClick={() => go({ estado: "" })} className={TAB(estado === "")}>
            Todas
            <TabCount n={totalLines} />
          </button>
          {STATE_ORDER.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={estado === s}
              onClick={() => go({ estado: estado === s ? "" : s })}
              className={cn(TAB(estado === s), counts[s] === 0 && estado !== s && "opacity-60")}
            >
              <span aria-hidden className={cn("size-2 rounded-full", STATE[s].dot)} />
              {STATE[s].label}
              <TabCount n={counts[s]} />
            </button>
          ))}
          {(q || estado) && (
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto"
              onClick={() => {
                setSearchReset((n) => n + 1);
                go({ q: "", estado: "" });
              }}
            >
              Limpiar
            </Button>
          )}
        </div>

        {loaded && (
          <DeliveryActions
            org={org}
            contractId={contractId}
            listId={loaded.id}
            listName={loaded.name}
            canAct={canAct}
            deliveries={deliveries}
            ready={counts.in_stock}
            hidden={panelShown}
          />
        )}

        {/* Las consultas al servidor muestran la estructura de la tabla; los filtros locales son inmediatos. */}
        {switching || navigating ? (
          <SupplyTableSkeleton rows={Math.min(8, Math.max(3, switching ? (active?.count ?? 5) : lines.length))} />
        ) : (
          <div className="relative flex min-h-0 flex-1 flex-col">
            {lines.length === 0 ? (
              q || estado ? (
                <EmptyState image={NO_RESULTS_IMAGE}>Ninguna línea coincide con el filtro.</EmptyState>
              ) : (
                <p className="p-6 text-muted-foreground">Esta lista no tiene líneas.</p>
              )
            ) : (
              <div className="min-h-0 flex-1 overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-surface-strong [&_th]:shadow-[inset_0_-1px_0_var(--border)]">
                    <tr className="border-b">
                      <th scope="col" className={`${TH} w-px text-right`}>N.º</th>
                      <th scope="col" className={TH}>Descripción</th>
                      <th scope="col" className={`${TH} w-24 text-right`}>Cantidad</th>
                      <th scope="col" className={`${TH} w-24 text-right`}>Costo unit.</th>
                      <th scope="col" className={`${TH} w-24 text-right`}>Total</th>
                      <th scope="col" className={`${TH} w-72`}>Estado y avance</th>
                    </tr>
                  </thead>
                  {/* Tabla jerárquica: cada línea del contrato es una fila con su resumen y, debajo, una fila por producto
                      asignado, sangrada, con las mismas columnas (cantidad asignada, costo unitario, total y de dónde viene).
                      Todas las filas tienen las mismas celdas, así las líneas y las columnas siempre se alinean. */}
                  {lines.map((l) => {
                    const lineTotal = l.assigned.reduce((sum, a) => sum + (a.costCents === null ? 0 : Math.round(a.costCents * a.quantity)), 0);
                    const hasCost = l.assigned.some((a) => a.costCents !== null);
                    const children = l.assigned.length > 0;
                    const open = expanded.has(l.id);
                    return (
                      <tbody
                        key={l.id}
                        // Un clic selecciona la línea y abre el panel; otro clic sobre la seleccionada despliega sus productos.
                        onClick={() => {
                          if (selectedId === l.id && rc.open) {
                            if (children) toggleExpanded(l.id);
                            return;
                          }
                          rc.unpick();
                          setSelectedLine(l);
                          rc.show();
                        }}
                        className={cn(
                          "cursor-pointer border-b transition-colors hover:[&_td]:bg-accent [&>tr+tr>td]:border-t [&>tr+tr>td]:border-border/60",
                          total > LINES_PAGE_SIZE && "last:border-b-0",
                          selectedId === l.id && "[&_td]:bg-surface-strong/60 [&_tr>td:first-child]:shadow-[inset_4px_0_0_var(--primary)]",
                        )}
                      >
                        <tr>
                          <td className={cn(TD, "num text-right text-muted-foreground")}>{l.n}</td>
                          <td className={cn(TD, "break-words")}>
                            <span className="block text-xs text-muted-foreground">{l.description}</span>
                            <span className={cn("mt-0.5 block font-mono text-sm font-medium", !l.partNumber && "font-normal text-muted-foreground")}>
                              {l.partNumber || "Sin n.º de parte"}
                            </span>
                            {children && (
                              <span className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                                <HugeiconsIcon icon={ArrowRight01Icon} aria-hidden className={cn("size-3 transition-transform", open && "rotate-90")} />
                                {l.assigned.length} {l.assigned.length === 1 ? "producto asignado" : "productos asignados"}
                              </span>
                            )}
                          </td>
                          <td className={cn(TD, "num whitespace-nowrap text-right")}>
                            {l.quantity} <span className="font-sans text-xs text-muted-foreground">{unitLabel(l.unit)}</span>
                          </td>
                          <td className={cn(TD, "whitespace-nowrap text-right text-muted-foreground")}>—</td>
                          <td className={cn(TD, "num whitespace-nowrap text-right font-medium")}>
                            {hasCost ? formatCents(lineTotal) : <span className="font-normal text-muted-foreground">—</span>}
                          </td>
                          <td className={TD}>
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex flex-col items-start gap-1.5">
                                <StateLabel tone={STATE[l.state].tone}>{STATE[l.state].label}</StateLabel>
                                <Progress stock={l.reserved} purchased={l.purchased} delivered={l.delivered} total={l.quantity} />
                              </div>
                              {/* Tocar la fila abre el panel; el botón es el mismo gesto para el teclado. */}
                              <Button
                                variant={l.id === nextId ? "default" : "ghost"}
                                size="icon"
                                className={cn("size-8 shrink-0", l.id !== nextId && "text-muted-foreground")}
                                aria-label={`${canAct ? "Abastecer" : "Ver"} la línea ${l.n}`}
                                title={canAct ? "Abastecer esta línea" : "Ver esta línea"}
                              >
                                <HugeiconsIcon icon={ArrowRight01Icon} className="size-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                        {children &&
                          open &&
                          l.assigned.map((a, i) => (
                            <tr key={i} className="text-[0.8125rem]">
                              <td className={TD} />
                              <td className={cn(TD, "max-w-0 py-1.5 pl-6")}>
                                <span className="flex items-baseline gap-2">
                                  <span aria-hidden className="shrink-0 text-muted-foreground">↳</span>
                                  <span className="min-w-0">
                                    <span className="block truncate text-xs text-muted-foreground" title={a.name}>
                                      {a.name}
                                    </span>
                                    <span className={cn("block truncate font-mono text-sm", !a.code && "text-muted-foreground")}>{a.code || "Sin código"}</span>
                                  </span>
                                </span>
                              </td>
                              <td className={cn(TD, "num py-1.5 text-right")}>{a.quantity}</td>
                              <td className={cn(TD, "num py-1.5 text-right")}>
                                {a.costCents === null ? <span className="text-muted-foreground">Sin costo</span> : formatCents(a.costCents)}
                              </td>
                              <td className={cn(TD, "num py-1.5 text-right text-muted-foreground")}>
                                {a.costCents === null ? "—" : formatCents(Math.round(a.costCents * a.quantity))}
                              </td>
                              <td className={cn(TD, "py-1.5")}>
                                <span className="inline-flex items-center gap-1.5 caps-md text-muted-foreground">
                                  <span aria-hidden className={cn("size-2 rounded-full", a.kind === "compra" ? STATE.purchased.dot : STATE.in_stock.dot)} />
                                  {a.kind === "compra" ? "Por llegar" : "En bodega"}
                                </span>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    );
                  })}
                </table>
              </div>
            )}
            <Pager
              basePath={basePath}
              page={page}
              total={total}
              size={LINES_PAGE_SIZE}
              params={{ lista: loaded?.id ?? "", ...(q ? { q } : {}), ...(estado ? { estado } : {}) }}
            />
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
        closing={closing}
        onClose={() => {
          // Se deja correr la animación de salida antes de quitar el panel.
          setClosing(true);
          setTimeout(() => {
            rc.hide();
            setSelectedLine(null);
            setClosing(false);
          }, 200);
        }}
      />
    )}
    </div>
  );
}

const WIDTHS = ["w-4/5", "w-3/5", "w-11/12", "w-2/3", "w-3/4", "w-1/2"];

function SupplyTableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Cargando líneas" aria-busy="true" className="min-h-0 flex-1 overflow-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 bg-surface-strong">
          <tr className="border-b">
            <th scope="col" className={`${TH} w-px text-right`}>N.º</th>
            <th scope="col" className={TH}>Descripción</th>
            <th scope="col" className={`${TH} w-24 text-right`}>Cantidad</th>
            <th scope="col" className={`${TH} w-24 text-right`}>Costo unit.</th>
            <th scope="col" className={`${TH} w-24 text-right`}>Total</th>
            <th scope="col" className={`${TH} w-72`}>Estado y avance</th>
          </tr>
        </thead>
        {/* Filas con la misma forma que las reales: descripción en dos líneas, y estado con su etiqueta y barra. */}
        <tbody>
          {Array.from({ length: rows }, (_, i) => (
            <tr key={i} className="border-b last:border-b-0">
              <td className={`${TD} w-px`}>
                <Skeleton className="ml-auto h-4 w-5" />
              </td>
              <td className={TD}>
                <Skeleton className={cn("h-4", WIDTHS[(i + 2) % 6])} />
                <Skeleton className="mt-1.5 h-3 w-24" />
              </td>
              <td className={TD}>
                <Skeleton className="ml-auto h-4 w-12" />
              </td>
              <td className={TD}>
                <Skeleton className="ml-auto h-4 w-12" />
              </td>
              <td className={TD}>
                <Skeleton className="ml-auto h-4 w-14" />
              </td>
              <td className={TD}>
                <Skeleton className="h-5 w-24" />
                <Skeleton className="mt-1.5 h-2 w-36" />
              </td>
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
