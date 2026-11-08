"use client";

import { PanelLoading } from "@/components/panel-loading";
import { LineQuotations } from "@/components/line-quotations";
import { ConfirmTap } from "@/components/confirm-tap";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AiMagicIcon, Archive02Icon, ArrowRight01Icon, Cancel01Icon, ClipboardCheckIcon, ClipboardPenLineIcon, Exchange01Icon, Invoice01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { NumericInput } from "@/components/numeric-input";
import { SearchInput } from "@/components/search-input";
import type { SupplyLine } from "@/components/supply-board";
import type { Reconcile } from "@/components/use-reconcile";
import { STATE } from "@/components/supply-progress";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatCents } from "@/lib/money";
import type { InvoiceLine } from "@/lib/reconcile-actions";
import { getLineSupply, releaseSource, type SourceView, type StockResult } from "@/lib/supply-actions";
import { toast } from "sonner";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { cn } from "@/lib/utils";

// Cubierta: ya no queda nada de esta línea de factura por asignar (ni llegado ni por llegar).
const covered = (l: InvoiceLine) => l.free <= 0;
// Para comparar números de parte sin importar mayúsculas, espacios ni guiones.
const normCode = (v: string) => v.toUpperCase().replace(/[\s\-_.]+/g, "");
const codesOf = (r: { sku: string | null; partNumbers: string[] }) => [r.sku, ...r.partNumbers].filter(Boolean).join(" · ");

type Target = { id: string; open: number };

// Panel «Abastecimiento»: se abre a la derecha de la tabla al tocar una línea del contrato (esa línea es el destino).
// De arriba abajo: el nombre de la línea, la fuente (Facturas o Bodega), la factura elegida, el buscador y la lista.
// Al pie, la línea con lo ya cubierto (y Liberar) y el botón para cambiar de fuente.
export function ReconcilePanel({
  rc,
  org,
  contractId,
  focus,
  canAct,
  closing,
  onClose,
}: {
  rc: Reconcile;
  org: string;
  contractId: string;
  focus: SupplyLine | null;
  canAct: boolean;
  closing: boolean;
  onClose: () => void;
}) {
  const target: Target | null = focus ? { id: focus.id, open: Math.max(0, focus.quantity - focus.reserved - focus.purchased) } : null;
  // Lo ya asignado a la línea abierta: es lo primero que muestra el panel.
  const [supply, setSupply] = useState<{ lineId: string; version: number; rows?: SourceView[]; error?: string } | null>(null);
  const [supplyRetry, setSupplyRetry] = useState(0);
  const focusId = focus?.id;
  const activeSupply = supply?.lineId === focusId && supply?.version === rc.version ? supply : null;
  const sources = activeSupply?.rows ?? null;
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
                <span className="num bg-muted px-1.5 py-0.5 text-[0.6875rem] leading-none text-muted-foreground">{count}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {!focus ? (
        <p className="p-6 text-sm text-muted-foreground">Toca una línea de la tabla para ver y asignarle productos.</p>
      ) : rc.source === "asignados" ? (
        activeSupply?.error ? (
          <PanelError message={activeSupply.error} onRetry={() => { setSupply(null); setSupplyRetry((n) => n + 1); }} />
        ) : <AssignedView rc={rc} org={org} contractId={contractId} sources={sources} canAct={canAct} />
      ) : rc.source === "cotizaciones" ? (
        <LineQuotations key={focus.id} org={org} contractId={contractId} lineId={focus.id} canAct={canAct} onSaved={rc.refresh} />
      ) : !canAct ? (
        <p className="p-6 text-sm text-muted-foreground">El abastecimiento se trabaja cuando el contrato está En ejecución.</p>
      ) : rc.source === "facturas" ? (
        <InvoiceMode rc={rc} target={target!} partNumber={focus?.partNumber ?? ""} />
      ) : (
        <StockMode rc={rc} target={target!} partNumber={focus?.partNumber ?? ""} />
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

function PanelError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div role="alert" className="space-y-3 p-4"><p className="text-sm text-destructive">{message}</p><Button variant="outline" size="sm" onClick={onRetry}>Reintentar</Button></div>;
}

// Fila de búsqueda del panel (el buscador del sistema). `children` va a la derecha.
function SearchRow({
  label,
  placeholder,
  value,
  onChange,
  autoFocus,
  children,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex h-12 shrink-0 border-b">
      <SearchInput label={label} placeholder={placeholder} value={value} onChange={onChange} autoFocus={autoFocus}>
        {children}
      </SearchInput>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------- facturas

function InvoiceMode({ rc, target, partNumber }: { rc: Reconcile; target: Target; partNumber: string }) {
  const [filter, setFilter] = useState("");
  const [showCovered, setShowCovered] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  const invoice = rc.invoices?.find((i) => i.id === rc.invoiceId) ?? null;
  // El campo responde al instante; la lista (hasta cientos de líneas) se refiltra cuando se deja de escribir.
  const term = useDebouncedValue(filter).trim().toLowerCase();
  const matching = (rc.lines ?? []).filter(
    (l) => !term || [l.name, l.code, l.sku, ...l.partNumbers].some((v) => v && v.toLowerCase().includes(term)),
  );
  // Tres grupos: las que coinciden con el número de parte de la línea abierta, el resto por asignar, y las ya cubiertas
  // (plegadas). El teclado recorre las filas en el mismo orden en que se ven.
  const sameCode = (l: InvoiceLine) => !!partNumber && [l.code, l.sku, ...l.partNumbers].some((c) => c && normCode(c) === normCode(partNumber));
  const suggested = matching.filter((l) => !covered(l) && sameCode(l));
  const others = matching.filter((l) => !covered(l) && !sameCode(l));
  const coveredLines = matching.filter(covered);
  const visible = [...suggested, ...others, ...(showCovered ? coveredLines : [])];

  const pickedId = rc.picked?.id;
  useEffect(() => {
    if (pickedId) document.getElementById(`rc-line-${pickedId}`)?.scrollIntoView({ block: "nearest" });
  }, [pickedId]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.altKey || e.ctrlKey || e.metaKey || !rc.invoiceId || rc.review) {
      if (rc.review && e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        rc.cancelReview();
      }
      return;
    }
    const inSearch = e.target instanceof HTMLInputElement && e.target.getAttribute("role") === "searchbox";
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const at = visible.findIndex((l) => l.id === rc.picked?.id);
      const next = e.key === "ArrowDown" ? visible[at + 1] ?? (at < 0 ? visible[0] : undefined) : visible[at - 1];
      if (next) rc.pick(next);
    } else if (e.key === "Enter" && rc.current && !inSearch) {
      e.preventDefault();
      void rc.assign(target);
    } else if (e.key === "Escape" && rc.picked) {
      e.preventDefault();
      e.stopPropagation();
      rc.pick(null);
    }
  }

  // Sin factura elegida: la lista completa, para elegir sin buscar.
  if (!rc.invoiceId) {
    return (
      rc.invoiceError ? <PanelError message={rc.invoiceError} onRetry={() => void rc.loadInvoices(true)} /> :
      rc.invoices === null ? <PanelLoading label="Cargando facturas" /> :
      <ul className="min-h-0 flex-1 divide-y overflow-y-auto">
        {rc.invoices.length === 0 ? (
          <li className="px-4 py-4 text-sm text-muted-foreground">Este contrato aún no tiene facturas completas.</li>
        ) : (
          rc.invoices.map((i) => (
            <li key={i.id}>
              <button
                type="button"
                className="flex w-full flex-col items-start px-4 py-3 text-left hover:bg-accent"
                onClick={() => void rc.chooseInvoice(i.id)}
              >
                <span className="font-mono text-sm">{i.number}</span>
                <span className="text-xs text-muted-foreground">{i.supplier || "Sin proveedor"}</span>
              </button>
            </li>
          ))
        )}
      </ul>
    );
  }

  return (
    <div ref={root} onKeyDown={onKeyDown} className="flex min-h-0 flex-1 flex-col">
      {/* Mismo alto que la fila de datos del activo de la izquierda (3,5 rem). */}
      <div className="flex h-14 shrink-0 items-center gap-3 border-b bg-surface-strong px-4">
        <HugeiconsIcon icon={Invoice01Icon} aria-hidden className="size-6 shrink-0 text-muted-foreground" />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium">{invoice?.supplier || "Sin proveedor"}</span>
          <span className="truncate font-mono text-xs text-muted-foreground">
            {invoice?.number} · {rc.lines === null ? "…" : rc.lines.length} {rc.lines?.length === 1 ? "ítem" : "ítems"}
          </span>
        </div>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="outline"
                size="icon"
                className="size-9 shrink-0"
                aria-label="Cambiar de factura"
                onClick={() => {
                  setFilter("");
                  void rc.chooseInvoice("");
                }}
              />
            }
          >
            <HugeiconsIcon icon={Exchange01Icon} className="size-4" />
          </TooltipTrigger>
          <TooltipContent>Cambiar de factura</TooltipContent>
        </Tooltip>
      </div>
      {rc.review ? (
        <ReviewList rc={rc} />
      ) : (
        <>
          <SearchRow label="Buscar en la factura" placeholder="Código o nombre" value={filter} onChange={setFilter} autoFocus>
            {rc.lines && rc.lines.some((l) => l.free > 0) && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-9 text-foreground hover:text-foreground"
                      aria-label="Cubrir coincidencias automáticamente"
                      disabled={rc.proposing}
                      onClick={() => void rc.propose()}
                    />
                  }
                >
                  <HugeiconsIcon icon={AiMagicIcon} className={cn("size-5", rc.proposing && "animate-pulse")} />
                </TooltipTrigger>
                <TooltipContent>Cubrir automáticamente: cruza esta factura con el contrato por número de parte y te deja revisar antes de asignar</TooltipContent>
              </Tooltip>
            )}
          </SearchRow>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {rc.invoiceLinesError ? (
              <PanelError message={rc.invoiceLinesError} onRetry={() => void rc.chooseInvoice(rc.invoiceId)} />
            ) : rc.lines === null ? (
              <PanelLoading label="Cargando productos de la factura" />
            ) : matching.length === 0 ? (
              <p className="px-4 py-4 text-sm text-muted-foreground">Ninguna línea coincide.</p>
            ) : (
              <>
                {suggested.length > 0 && (
                  <>
                    <GroupBar label="Coinciden con esta línea" count={suggested.length} accent />
                    <ul className="divide-y">
                      {suggested.map((l) => (
                        <LineRow key={l.id} rc={rc} line={l} target={target} />
                      ))}
                    </ul>
                  </>
                )}
                {others.length > 0 && (
                  <>
                    <GroupBar label="De la factura" count={others.length} />
                    <ul className="divide-y">
                      {others.map((l) => (
                        <LineRow key={l.id} rc={rc} line={l} target={target} />
                      ))}
                    </ul>
                  </>
                )}
                {coveredLines.length > 0 && (
                  <>
                    <button
                      type="button"
                      aria-expanded={showCovered}
                      onClick={() => setShowCovered((v) => !v)}
                      className="flex h-10 w-full items-center gap-2 border-y bg-surface-strong/60 px-4 text-left caps text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <HugeiconsIcon icon={ArrowRight01Icon} aria-hidden className={cn("size-3.5 transition-transform", showCovered && "rotate-90")} />
                      {coveredLines.length} {coveredLines.length === 1 ? "cubierta" : "cubiertas"}
                    </button>
                    {showCovered && (
                      <ul className="divide-y">
                        {coveredLines.map((l) => (
                          <LineRow key={l.id} rc={rc} line={l} target={target} />
                        ))}
                      </ul>
                    )}
                  </>
                )}
                {suggested.length + others.length === 0 && coveredLines.length > 0 && (
                  <p className="px-4 py-4 text-sm text-muted-foreground">Toda la factura está cubierta.</p>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// Revisión de lo que el sistema cruzó por número de parte: se desmarca lo que no sea y se cubre todo junto.
function ReviewList({ rc }: { rc: Reconcile }) {
  const review = rc.review;
  if (!review) return null;
  const chosen = review.proposals.filter((p) => !review.skipped.has(p.key)).length;
  return (
    <>
      <div className="shrink-0 border-b px-4 py-3">
        <p className="text-sm">
          <span className="num font-medium">{review.proposals.length}</span> asignaciones propuestas por número de parte.
        </p>
        {review.unmatched > 0 && (
          <p className="mt-1 text-xs text-muted-foreground">
            {review.unmatched} {review.unmatched === 1 ? "línea sin coincidencia queda" : "líneas sin coincidencia quedan"} para resolver a mano.
          </p>
        )}
        <div className="mt-3 flex items-center gap-2">
          <Button size="sm" disabled={rc.busy || chosen === 0} onClick={() => void rc.applyReview()}>
            {rc.busy ? "Asignando…" : `Asignar ${chosen}`}
          </Button>
          <Button size="sm" variant="ghost" disabled={rc.busy} onClick={rc.cancelReview}>
            Cancelar
          </Button>
        </div>
      </div>
      <ul className="min-h-0 flex-1 divide-y overflow-y-auto">
        {review.proposals.map((p) => {
          const on = !review.skipped.has(p.key);
          return (
            <li key={p.key}>
              <label className={cn("flex cursor-pointer items-start gap-3 px-4 py-2.5 hover:bg-accent/60", !on && "opacity-50")}>
                <input type="checkbox" className="mt-1 size-4 shrink-0 accent-foreground" checked={on} onChange={() => rc.toggleProposal(p.key)} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm" title={p.name}>
                    {p.name}
                  </span>
                  <span className="truncate font-mono text-xs text-muted-foreground">
                    {p.code || "—"} → Línea {p.targetN} · {p.listName} · {p.lotId ? "asigna de la bodega" : "reserva por llegar"}
                  </span>
                </span>
                <span className="num shrink-0 text-sm">{p.qty}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </>
  );
}

// Título de un grupo de la lista: qué es y cuántas hay.
function GroupBar({ label, count, accent }: { label: string; count: number; accent?: boolean }) {
  return (
    <h3
      className={cn(
        "sticky top-0 z-10 flex h-8 items-center gap-2 border-y bg-surface-strong px-4 text-xs font-medium",
        accent ? "text-foreground" : "text-muted-foreground",
      )}
    >
      {label}
      <span className="num font-normal text-muted-foreground">{count}</span>
      {/* Qué es cada columna de las filas: existencias y costo unitario. */}
      <span className="ml-auto font-normal text-muted-foreground">Disponible · c/u</span>
    </h3>
  );
}

// Existencias de una línea de factura, con un punto del color de su origen: verde en la bodega, azul por llegar.
function StockBadge({ line: l }: { line: InvoiceLine }) {
  if (covered(l)) return <span className="font-mono text-xs text-foreground">✓</span>;
  return (
    <span className="num flex shrink-0 items-center gap-3 font-mono text-sm">
      {l.inStock > 0 && (
        <span className="flex items-center gap-1.5" title={`${l.inStock} en la bodega`}>
          <span aria-hidden className={cn("size-2 rounded-full", STATE.in_stock.dot)} />
          {l.inStock}
        </span>
      )}
      {l.available > 0 && (
        <span className="flex items-center gap-1.5" title={`${l.available} por llegar`}>
          <span aria-hidden className={cn("size-2 rounded-full", STATE.purchased.dot)} />
          {l.available}
        </span>
      )}
    </span>
  );
}

// Línea de factura: el código manda (es lo que cruza con la línea del contrato), con sus existencias a la derecha, y la
// descripción debajo, atenuada.
function LineRow({ rc, line: l, target }: { rc: Reconcile; line: InvoiceLine; target: Target }) {
  const selected = rc.picked?.id === l.id;
  const done = covered(l);
  return (
    <li id={`rc-line-${l.id}`} className={cn(selected && "bg-accent/60", done && !selected && "opacity-60")}>
      <button
        type="button"
        aria-pressed={selected}
        onClick={() => rc.pick(selected ? null : l)}
        className={cn("flex w-full flex-col gap-1 px-4 py-3.5 text-left hover:bg-accent/60", selected && "shadow-[inset_4px_0_0_var(--primary)]")}
      >
        <span className="flex items-center justify-between gap-3">
          <span className={cn("truncate font-mono text-sm font-medium", !l.code && "font-normal text-muted-foreground")} title={l.code}>
            {l.code || "Sin código"}
          </span>
          <StockBadge line={l} />
        </span>
        <span className="flex items-baseline justify-between gap-3">
          <span className="truncate text-xs text-muted-foreground" title={l.name}>
            {l.name}
          </span>
          {/* Precio unitario de la factura (sin IVA), para compararlo con lo que paga el contrato. */}
          <span className="num shrink-0 text-xs text-muted-foreground">{formatCents(l.unitCostCents)}</span>
        </span>
      </button>
      {selected && <AssignTo rc={rc} target={target} />}
    </li>
  );
}

// ------------------------------------------------------------------------------------------------ bodega

function StockMode({ rc, target, partNumber }: { rc: Reconcile; target: Target; partNumber: string }) {
  const rows = rc.stockRows;
  // Igual que en la lista de la factura: arriba lo que coincide con el número de parte de la línea abierta, y luego el resto.
  const sameCode = (r: StockResult) => !!partNumber && [r.sku, ...r.partNumbers].some((c) => c && normCode(c) === normCode(partNumber));
  const stocked = (rows ?? []).filter((r) => r.onHand > 0);
  const suggested = stocked.filter(sameCode);
  const others = stocked.filter((r) => !sameCode(r));
  const withStock = [...suggested, ...others];

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const inSearch = e.target instanceof HTMLInputElement && e.target.getAttribute("role") === "searchbox";
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const at = withStock.findIndex((r) => r.id === rc.stockPicked?.id);
      const next = e.key === "ArrowDown" ? withStock[at + 1] ?? (at < 0 ? withStock[0] : undefined) : withStock[at - 1];
      if (next) rc.pickStock(next);
    } else if (e.key === "Enter" && rc.current && !inSearch) {
      e.preventDefault();
      void rc.assign(target);
    } else if (e.key === "Escape" && rc.stockPicked) {
      e.preventDefault();
      e.stopPropagation();
      rc.pickStock(null);
    }
  }

  return (
    <div onKeyDown={onKeyDown} className="flex min-h-0 flex-1 flex-col">
      {/* Mismo alto y forma que la fila de la factura elegida: qué hay en la bodega, en cifras. */}
      <div className="flex h-14 shrink-0 items-center gap-3 border-b bg-surface-strong px-4">
        <HugeiconsIcon icon={Archive02Icon} aria-hidden className="size-6 shrink-0 text-muted-foreground" />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium">Bodega</span>
          <span className="truncate font-mono text-xs text-muted-foreground">
            {rc.stockSummaryError ? (
              "Resumen no disponible"
            ) : rc.stockSummary === null ? (
              "Cargando existencias…"
            ) : (
              <>
                <span className="num">{rc.stockSummary.products}</span> {rc.stockSummary.products === 1 ? "producto" : "productos"} ·{" "}
                <span className="num">{rc.stockSummary.units}</span> {rc.stockSummary.units === 1 ? "unidad" : "unidades"} en existencia
              </>
            )}
          </span>
        </div>
      </div>
      {rc.stockSummaryError && <PanelError message={rc.stockSummaryError} onRetry={() => void rc.loadStockSummary(true)} />}
      <SearchRow label="Buscar en la bodega" placeholder="Número de parte, SKU o nombre" value={rc.stockQ} onChange={rc.searchStockText} autoFocus />
      <div aria-busy={rc.stockLoading} className="min-h-0 flex-1 overflow-y-auto">
        {!rc.stockQ.trim() ? (
          <p className="px-4 py-4 text-sm text-muted-foreground">Escribe un número de parte, SKU o nombre.</p>
        ) : rc.stockError ? (
          <PanelError message={rc.stockError} onRetry={() => rc.searchStockText(rc.stockQ)} />
        ) : rc.stockLoading || rows === null ? (
          <PanelLoading label="Buscando productos en bodega" />
        ) : rows.length === 0 ? (
          <p className="px-4 py-4 text-sm text-muted-foreground">Ningún producto de la bodega coincide.</p>
        ) : withStock.length === 0 ? (
          <p className="px-4 py-4 text-sm text-muted-foreground">Hay productos que coinciden, pero ninguno tiene existencias.</p>
        ) : (
          <>
            {suggested.length > 0 && (
              <>
                <GroupBar label="Coinciden con esta línea" count={suggested.length} accent />
                <ul className="divide-y">
                  {suggested.map((r) => (
                    <StockRow key={r.id} rc={rc} row={r} target={target} />
                  ))}
                </ul>
              </>
            )}
            {others.length > 0 && (
              <>
                <GroupBar label="En la bodega" count={others.length} />
                <ul className="divide-y">
                  {others.map((r) => (
                    <StockRow key={r.id} rc={rc} row={r} target={target} />
                  ))}
                </ul>
              </>
            )}
            {rc.stockMore && <p className="border-t px-4 py-3 text-xs text-muted-foreground">Hay más productos que coinciden. Escribe más para afinar.</p>}
          </>
        )}
      </div>
    </div>
  );
}

// Producto de la bodega con el mismo formato que una línea de factura: el código manda, con sus existencias a la derecha
// (punto verde), y el nombre debajo, atenuado.
function StockRow({ rc, row: r, target }: { rc: Reconcile; row: StockResult; target: Target }) {
  const selected = rc.stockPicked?.id === r.id;
  return (
    <li className={cn(selected && "bg-accent/60")}>
      <button
        type="button"
        aria-pressed={selected}
        onClick={() => rc.pickStock(selected ? null : r)}
        className={cn("flex w-full flex-col gap-1 px-4 py-3.5 text-left hover:bg-accent/60", selected && "shadow-[inset_4px_0_0_var(--primary)]")}
      >
        <span className="flex items-center justify-between gap-3">
          <span className={cn("truncate font-mono text-sm font-medium", !codesOf(r) && "font-normal text-muted-foreground")} title={codesOf(r)}>
            {codesOf(r) || "Sin código"}
          </span>
          <span className="num flex shrink-0 items-center gap-1.5 font-mono text-sm" title={`${r.onHand} en la bodega`}>
            <span aria-hidden className={cn("size-2 rounded-full", STATE.in_stock.dot)} />
            {r.onHand}
          </span>
        </span>
        <span className="flex items-baseline justify-between gap-3">
          <span className="truncate text-xs text-muted-foreground" title={r.name}>
            {r.name}
          </span>
          {/* Costo unitario: el del lote más barato; con lotes de distinto costo se dice "desde". */}
          <span className="num shrink-0 text-xs text-muted-foreground">
            {(() => {
              const costs = r.lots.filter((l) => l.costCents !== null).map((l) => l.costCents as number);
              if (costs.length === 0) return "Sin costo";
              const min = Math.min(...costs);
              return `${new Set(costs).size > 1 ? "desde " : ""}${formatCents(min)}`;
            })()}
          </span>
        </span>
      </button>
      {selected && <AssignTo rc={rc} target={target} />}
    </li>
  );
}

// ------------------------------------------------------------------------------------------ asignar a…

// Lo elegido, para asignarlo a la línea abierta: cantidad (automática si se deja vacía) y un botón por forma de
// cubrir. «Asignar» usa unidades que ya están en la bodega; «Reservar» lo que aún viene en la factura.
function AssignTo({ rc, target }: { rc: Reconcile; target: Target }) {
  const c = rc.current;
  if (!c) return null;
  const canStock = c.inStock > 0;
  const canArrive = c.available > 0;
  return (
    <div className="flex items-center justify-between gap-3 px-4 pt-1 pb-3">
      {target.open <= 0 ? (
        <p className="text-xs text-muted-foreground">Esta línea del contrato ya está cubierta por completo.</p>
      ) : !canStock && !canArrive ? (
        <p className="text-xs text-muted-foreground">Ya no queda nada de esto por cubrir.</p>
      ) : (
        <>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Cantidad
            <NumericInput
              kind="decimal"
              aria-label="Cantidad a asignar"
              placeholder={String(Math.min(canStock ? c.inStock : c.available, target.open))}
              className="h-8 w-20 font-mono"
              value={rc.qty}
              onChange={(e) => rc.setQty(e.target.value)}
            />
          </label>
          <div className="flex items-center gap-2">
            {canStock && (
              <Button size="sm" className="h-8" disabled={rc.busy} title="Asigna unidades que ya están en la bodega" onClick={() => void rc.assign(target, "bodega")}>
                Asignar <Kbd className="border-primary-foreground/30 bg-transparent text-primary-foreground">↵</Kbd>
              </Button>
            )}
            {canArrive && (
              <Button
                size="sm"
                variant={canStock ? "outline" : "default"}
                className="h-8"
                disabled={rc.busy}
                title="Reserva lo que aún viene en la factura"
                onClick={() => void rc.assign(target, "llegar")}
              >
                Reservar
                {!canStock && <Kbd className="border-primary-foreground/30 bg-transparent text-primary-foreground">↵</Kbd>}
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// -------------------------------------------------------------------------------------------------- pie

// Liberar, con el gesto de confirmación de la app (un toque arma, otro confirma).
function ReleaseButtons({ rc, org, contractId, sourceId }: { rc: Reconcile; org: string; contractId: string; sourceId: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <ConfirmTap
      size="sm"
      variant="outline"
      className="h-8 shrink-0"
      disabled={busy}
      hint="Toca otra vez para liberar"
      onConfirm={async () => {
        setBusy(true);
        try {
          const res = await releaseSource(org, contractId, sourceId);
          if (res?.error) return void toast.error(res.error);
          toast.success("Liberado.");
          await rc.refresh();
        } finally {
          setBusy(false);
        }
      }}
    >
      Liberar
    </ConfirmTap>
  );
}

// Lo ya asignado a la línea abierta: lo primero que se ve al tocar una fila. Cada producto en una fila de dos líneas
// (nombre y detalle) con su cantidad, su valor unitario y Liberar a la derecha. Sin nada asignado, un aviso con los dos
// caminos para asignar: facturas o bodega.
function AssignedView({
  rc,
  org,
  contractId,
  sources,
  canAct,
}: {
  rc: Reconcile;
  org: string;
  contractId: string;
  sources: SourceView[] | null;
  canAct: boolean;
}) {
  if (sources === null) return <PanelLoading label="Cargando productos asignados" />;
  if (sources.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-sm font-medium">Esta línea aún no tiene nada asignado</p>
        <p className="max-w-xs text-sm text-muted-foreground">
          {canAct ? "Búscalo en una factura del contrato o entre las existencias de la bodega." : "El contrato debe estar En ejecución para asignar productos."}
        </p>
        {canAct && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => rc.setSource("facturas")}>
              Ir a facturas
            </Button>
            <Button variant="outline" onClick={() => rc.setSource("bodega")}>
              Ir a bodega
            </Button>
          </div>
        )}
      </div>
    );
  }
  return (
    <ul className="min-h-0 flex-1 divide-y overflow-y-auto">
      {sources.map((s) => (
        <li key={s.id} className="flex items-start gap-4 px-4 py-4">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="break-words text-sm leading-snug">{s.itemName}</span>
            <span className="break-words font-mono text-xs leading-relaxed text-muted-foreground">
              {[
                [s.itemSku, ...s.partNumbers].filter(Boolean).join(" · ") || "Sin código",
                s.kind === "compra" ? `Por llegar · factura ${s.invoice}` : "De la bodega",
              ].join(" · ")}
            </span>
            <span className="break-words text-xs text-muted-foreground">{s.supplier || "Sin proveedor"}</span>
          </div>
          {/* Los datos a la izquierda y los números a la derecha: cantidad, valor unitario y, debajo, Liberar. */}
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <span className="num text-base leading-none">{s.quantity}</span>
            <span className="num text-xs leading-none text-muted-foreground">
              {s.costCents === null ? "Sin costo" : `${formatCents(s.costCents)} c/u`}
            </span>
            {canAct && (
              <div className="mt-1">
                <ReleaseButtons rc={rc} org={org} contractId={contractId} sourceId={s.id} />
              </div>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
