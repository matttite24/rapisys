"use client";

import { LineQuotations } from "@/components/line-quotations";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { PageShortcuts } from "@/components/page-shortcuts";
import { Archive02Icon, Cancel01Icon, ClipboardCheckIcon, ClipboardPenLineIcon, Invoice01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { SupplyLine } from "@/components/supply-board";
import { NEW_LINE, type Reconcile } from "@/components/use-reconcile";
import { Button } from "@/components/ui/button";
import { formatCents } from "@/lib/money";
import { getLineSupply, type SourceView } from "@/lib/supply-actions";
import { cn } from "@/lib/utils";
import { Target } from "@/components/reconcile-shared";
import { PanelError } from "@/components/reconcile-parts";
import { InvoiceMode } from "@/components/reconcile-invoices";
import { StockMode } from "@/components/reconcile-stock";
import { AssignedView } from "@/components/reconcile-assigned";

// Panel «Abastecimiento»: se abre a la derecha de la tabla al tocar una línea del contrato (esa línea es el destino).
// De arriba abajo: el nombre de la línea, la fuente (Facturas o Bodega), la factura elegida, el buscador y la lista.
// Al pie, la línea con lo ya cubierto (y Liberar) y el botón para cambiar de fuente.
export function ReconcilePanel({
  rc,
  org,
  contractId,
  focus,
  addToListId,
  canAct,
  closing,
  onClose,
}: {
  rc: Reconcile;
  org: string;
  contractId: string;
  focus: SupplyLine | null;
  // Proceso a crédito: lista a la que se agregan líneas nuevas desde Facturas y Bodega (sin línea abierta).
  addToListId?: string;
  canAct: boolean;
  closing: boolean;
  onClose: () => void;
}) {
  const target: Target | null = focus ? { id: focus.id, open: Math.max(0, focus.quantity - focus.reserved - focus.purchased), description: focus.description } : null;
  // Sin línea abierta, en un proceso a crédito, lo elegido crea su propia línea en la lista.
  const addTarget: Target | null = !focus && addToListId ? { id: NEW_LINE, open: Number.MAX_SAFE_INTEGER, addToListId } : null;
  // Lo ya asignado a la línea abierta: es lo primero que muestra el panel.
  const [supply, setSupply] = useState<{ lineId: string; version: number; rows?: SourceView[]; error?: string } | null>(null);
  const [supplyRetry, setSupplyRetry] = useState(0);
  const focusId = focus?.id;
  const activeSupply = supply?.lineId === focusId && supply?.version === rc.version ? supply : null;
  const sources = activeSupply?.rows ?? null;

  // Esc cierra el panel. Si hay un producto elegido o una revisión abierta, ese Esc lo atiende la lista y no llega aquí:
  // primero se quita lo elegido y el siguiente Esc cierra. No actúa dentro de un diálogo ni si otro control ya lo usó.
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape" || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (e.target instanceof HTMLElement && e.target.closest('[role="dialog"], [role="menu"], [role="listbox"]')) return;
      e.preventDefault();
      closeRef.current();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const coveredQty = focus ? (sources?.reduce((sum, x) => sum + x.quantity, 0) ?? focus.reserved + focus.purchased) : 0;
  useEffect(() => {
    if (!focusId) return;
    let alive = true;
    void getLineSupply(focusId).then((rows) => {
      if (alive) setSupply({ lineId: focusId, version: rc.version, rows });
    }).catch(() => {
      if (alive) setSupply({ lineId: focusId, version: rc.version, error: "No se pudieron cargar los productos asignados." });
    });
    return () => { alive = false; };
  }, [focusId, rc.version, supplyRetry]);
  // En pantallas anchas la columna va fija, de la parte de arriba del contenido hasta el borde de abajo (por encima de la
  // barra de atajos, que reserva su ancho y termina antes).
  const [top, setTop] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const [footerHeight, setFooterHeight] = useState<number | null>(null);
  // Al montarse empieza cerrado (ancho 0) y un instante después se abre, para que la entrada se anime.
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const expanded = shown && !closing;
  useLayoutEffect(() => {
    const bar = document.querySelector<HTMLElement>("[data-layout-footer]");
    const update = () => {
      setTop(document.querySelector("main")?.getBoundingClientRect().top ?? 0);
      const panel = panelRef.current;
      if (!bar || !panel || window.innerWidth < 1024 || bar.getBoundingClientRect().height === 0) {
        setFooterHeight(null);
        return;
      }
      // Usa coordenadas reales: el borde del pie queda exactamente a la altura de la barra del layout.
      setFooterHeight(Math.max(0, panel.getBoundingClientRect().bottom - bar.getBoundingClientRect().top));
    };
    const observer = new ResizeObserver(update);
    if (bar) observer.observe(bar);
    if (panelRef.current) observer.observe(panelRef.current);
    update();
    window.addEventListener("resize", update);
    return () => { observer.disconnect(); window.removeEventListener("resize", update); };
  }, []);

  return (
    <>
    {/* Sombra del panel sobre la tabla, de derecha a izquierda en la línea de división: el panel se siente delante y la lista
        detrás. Va aparte del panel porque este recorta lo que se sale de él; sigue su ancho mientras entra y sale. */}
    <div
      aria-hidden
      style={{ "--panel-w": expanded ? "32rem" : "0rem" } as React.CSSProperties}
      className={cn(
        "pointer-events-none fixed inset-y-0 right-(--panel-w) z-30 hidden w-5 bg-gradient-to-l from-black/10 to-transparent transition-[right,opacity] duration-200 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none lg:block dark:from-black/40",
        !expanded && "opacity-0",
      )}
    />
    <aside
      aria-label="Abastecimiento"
      style={{ "--panel-w": expanded ? "32rem" : "0rem" } as React.CSSProperties}
      className={cn(
        // En pantallas anchas es una columna fija que crece desde el borde derecho (su ancho va de 0 a 32 rem) y empuja
        // la interfaz: la tabla y la barra de abajo se ajustan a la vez. El contenido no se redistribuye: tiene ancho fijo
        // y queda pegado a la derecha, así que se descubre de derecha a izquierda.
        "max-lg:fixed max-lg:inset-0 max-lg:z-40 max-lg:animate-in max-lg:fade-in-0 lg:fixed lg:top-0 lg:right-0 lg:bottom-0 lg:z-30 lg:flex lg:w-(--panel-w) lg:overflow-hidden lg:transition-[width] lg:duration-200 lg:ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:lg:transition-none",
      )}
    >
     <div
       ref={panelRef}
       style={{ paddingBottom: focus ? `calc(${footerHeight === null ? "var(--footer-height)" : `${footerHeight}px`} + 2rem)` : undefined }}
       className="relative flex h-full min-h-0 w-full flex-col border-l bg-background lg:ml-auto lg:w-[32rem] lg:shrink-0"
     >
      <PageShortcuts shortcuts={[{ keys: ["Esc"], label: "Cerrar panel" }]} />
      {/* Mismo alto que el encabezado de la página, para que lo de abajo siga alineado con la tabla. */}
      <div style={{ height: top || 48 }} className="flex shrink-0 items-center justify-between gap-3 border-b bg-primary px-4 text-primary-foreground">
        <span className="caps-md font-bold">Abastecimiento</span>
        <div className="flex items-center gap-3">
          {focus && (
            <span className="font-mono text-xs">
              cubierto <span className="num text-sm font-bold">{coveredQty}</span> de <span className="num text-sm font-bold">{focus.quantity}</span>
            </span>
          )}
        <Button
          variant="ghost"
          size="icon"
          className="-mr-2 size-8 shrink-0 hover:bg-primary-foreground/15 hover:text-primary-foreground"
          aria-label="Cerrar el panel"
          onClick={onClose}
        >
          <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
        </Button>
        </div>
      </div>

      <div className="flex h-12 shrink-0 border-b">
        <div role="tablist" aria-label="Qué mostrar" className="flex h-full w-full min-w-0 overflow-x-auto [scrollbar-width:none]">
          {(
            [
              ["asignados", "Asignados", sources?.length ?? null, ClipboardCheckIcon],
              ["cotizaciones", "Cotizaciones", null, ClipboardPenLineIcon],
              ["facturas", "Facturas", null, Invoice01Icon],
              ["bodega", "Bodega", null, Archive02Icon],
            ] as const
          ).map(([key, label, count, icon]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={rc.source === key}
              disabled={!canAct && key !== "asignados" && key !== "cotizaciones"}
              onClick={() => rc.setSource(key)}
              className={cn(
                "-mb-px flex h-full min-w-0 flex-1 items-center justify-center gap-1.5 border-b-2 px-2 font-sans text-sm transition-colors",
                rc.source === key ? "border-b-brand font-bold text-foreground" : "border-b-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {/* El ícono solo en la pestaña activa, para no saturar. */}
              {rc.source === key && <HugeiconsIcon icon={icon} className="size-4 shrink-0" aria-hidden="true" />}
              {label}
              {count !== null && count > 0 && (
                <span className="num bg-muted px-1.5 py-0.5 text-2xs leading-none text-muted-foreground">{count}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {!focus && !(addTarget && canAct && (rc.source === "facturas" || rc.source === "bodega")) ? (
        <p className="p-6 text-sm text-muted-foreground">
          {addTarget
            ? "Elige Facturas o Bodega para agregar productos a la lista, o toca una línea de la tabla para asignarle productos."
            : "Toca una línea de la tabla para ver y asignarle productos."}
        </p>
      ) : focus && rc.source === "asignados" ? (
        activeSupply?.error ? (
          <PanelError message={activeSupply.error} onRetry={() => { setSupply(null); setSupplyRetry((n) => n + 1); }} />
        ) : <AssignedView rc={rc} org={org} contractId={contractId} sources={sources} canAct={canAct} />
      ) : focus && rc.source === "cotizaciones" ? (
        <LineQuotations key={focus.id} org={org} contractId={contractId} lineId={focus.id} canAct={canAct} onSaved={rc.refresh} />
      ) : !focus && rc.source !== "facturas" && rc.source !== "bodega" ? null : !canAct ? (
        <p className="p-6 text-sm text-muted-foreground">El abastecimiento se trabaja cuando el contrato está En ejecución.</p>
      ) : rc.source === "facturas" ? (
        <InvoiceMode rc={rc} target={(target ?? addTarget)!} partNumber={focus?.partNumber ?? ""} />
      ) : (
        <StockMode rc={rc} target={(target ?? addTarget)!} partNumber={focus?.partNumber ?? ""} />
      )}

      </div>

      {/* Presupuesto de la línea, sobre el pie: el precio referencial contra el costo de lo asignado, para no pasarse de lo que paga el contrato. */}
      {focus && (
        <div style={{ bottom: footerHeight ?? "var(--footer-height)" }} className="absolute inset-x-0 flex h-8 items-center gap-x-5 overflow-hidden border-t bg-background px-4 text-xs whitespace-nowrap" aria-live="polite">
          {focus.referenceCents === null ? (
            <span className="text-muted-foreground">Sin precio referencial: agrégalo en Listas para controlar el costo.</span>
          ) : (
            (() => {
              const ref = focus.referenceCents;
              const assigned = (sources ?? []).reduce((sum, x) => sum + (x.costCents === null ? 0 : Math.round(x.costCents * x.quantity)), 0);
              const unknown = (sources ?? []).filter((x) => x.costCents === null).length;
              const left = ref - assigned;
              return (
                <>
                  <span className="text-muted-foreground">
                    Precio ref. <span className="num font-medium text-foreground">{formatCents(ref)}</span>
                  </span>
                  <span className="text-muted-foreground">
                    Asignado <span className="num font-medium text-foreground">{formatCents(assigned)}</span>
                    {unknown > 0 && ` (+${unknown} sin costo)`}
                  </span>
                  {left >= 0 ? (
                    <span className="text-muted-foreground">
                      Disponible <span className="num font-medium text-foreground">{formatCents(left)}</span>
                    </span>
                  ) : (
                    <span role="alert" className="font-medium text-destructive">
                      Excede <span className="num">{formatCents(-left)}</span>
                    </span>
                  )}
                </>
              );
            })()
          )}
        </div>
      )}

      {/* Pie anclado al fondo y alineado con el borde superior real de la barra inferior. */}
      {focus && (
        <div style={{ height: footerHeight ?? "var(--footer-height)" }} className="absolute inset-x-0 bottom-0 flex flex-col justify-center border-t bg-surface-strong px-4">
          <span className="truncate text-sm font-medium" title={focus.description}>
            {focus.description}
          </span>
          <span className="truncate font-mono text-xs text-muted-foreground">
            Línea {focus.n} · {focus.partNumber || "Sin n.º de parte"}
          </span>
        </div>
      )}

     </div>
    </aside>
    </>
  );
}
