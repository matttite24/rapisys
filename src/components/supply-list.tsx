"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon, PackageIcon } from "@hugeicons/core-free-icons";
import { ProductCell } from "@/components/product-cell";
import { StateLabel } from "@/components/state-label";
import type { SupplyLine } from "@/components/supply-board";
import { SupplyColumnsMenu, type SupplyColumn, type useSupplyColumns } from "@/components/supply-columns";
import { MiniProgress, STATE } from "@/components/supply-progress";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCents } from "@/lib/money";
import { unitLabel } from "@/lib/units";
import { cn } from "@/lib/utils";

// Lista de líneas de Abastecimiento: filas redondeadas sobre una cuadrícula CSS. La cabecera y todas las filas (reales y
// de carga) comparten la misma plantilla de columnas, así que alinean siempre y miden lo mismo.
//
// Márgenes: el texto va a 24 px del borde en la cabecera (px-6) y en las filas (12 de margen del bloque + 12 de relleno),
// la misma medida que el buscador, los filtros y el formulario de añadir línea.

// Anchos de columna, en rem. N.º y Producto siempre están; el resto son las que eligió la persona.
const WIDTH = { expand: 1.75, n: 2.5, product: 16, quantity: 6.5, reference: 7, cost: 7, margin: 6.5, state: 16 };
const GAP = 0.75; // entre columnas (gap-x-3)
// Relleno de la cabecera (px-6 = 1.5 rem a cada lado).
const HEAD_PAD = 3;

function columnsOf(cols: Set<SupplyColumn>): number[] {
  return [
    WIDTH.expand,
    WIDTH.n,
    WIDTH.product,
    ...(cols.has("quantity") ? [WIDTH.quantity] : []),
    ...(cols.has("reference") ? [WIDTH.reference] : []),
    ...(cols.has("cost") ? [WIDTH.cost] : []),
    ...(cols.has("margin") ? [WIDTH.margin] : []),
    ...(cols.has("state") ? [WIDTH.state] : []),
  ];
}

// Plantilla compartida por la cabecera y las filas. Producto toma lo que sobra; las demás son fijas.
function template(cols: Set<SupplyColumn>) {
  return columnsOf(cols)
    .map((w, i) => (i === 2 ? `minmax(${w}rem, 1fr)` : `${w}rem`))
    .join(" ");
}

// Ancho mínimo de la lista: por debajo de esto se desplaza de lado en vez de apretar las columnas.
function minWidth(cols: Set<SupplyColumn>) {
  const w = columnsOf(cols);
  return w.reduce((a, b) => a + b, 0) + GAP * (w.length - 1) + HEAD_PAD;
}

const ROW = "grid items-center gap-x-3 px-3";
const NUM = "num whitespace-nowrap text-right";

// Cabecera de columnas: barra gris de ancho completo, fija arriba al desplazar.
function Header({ cols, columns }: { cols: Set<SupplyColumn>; columns?: ReturnType<typeof useSupplyColumns> }) {
  const head = "text-xs font-medium whitespace-nowrap text-muted-foreground";
  return (
    <div
      role="row"
      style={{ gridTemplateColumns: template(cols) }}
      className="sticky top-0 z-10 grid h-10 shrink-0 items-center gap-x-3 bg-surface-strong px-6"
    >
      <div role="columnheader" className="flex items-center">
        {columns ? <SupplyColumnsMenu {...columns} /> : <span className="sr-only">Productos asignados</span>}
      </div>
      <div role="columnheader" className={cn(head, "text-right")}>N.º</div>
      <div role="columnheader" className={head}>Producto</div>
      {cols.has("quantity") && <div role="columnheader" className={cn(head, "text-right")}>Cantidad</div>}
      {cols.has("reference") && <div role="columnheader" className={cn(head, "text-right")}>Precio ref.</div>}
      {cols.has("cost") && <div role="columnheader" className={cn(head, "text-right")}>Costo</div>}
      {cols.has("margin") && <div role="columnheader" className={cn(head, "text-right")}>Margen</div>}
      {cols.has("state") && <div role="columnheader" className={head}>Estado</div>}
    </div>
  );
}

// Contenedor con desplazamiento (de lado y vertical). Ocupa el alto que le deja la pantalla y no añade huecos: lo que
// sobra de alto queda en blanco solo si la lista es corta.
// `relative` es imprescindible: dentro de las filas hay textos para lectores de pantalla (`sr-only`, que es `absolute`). Sin
// un ancestro posicionado dentro de este contenedor, esos textos se anclan a uno de más arriba y, aunque miden 1 px, cada
// uno estira el desplazamiento de TODA la página hasta la altura de su fila: aparecía un scroll de la página con un
// espacio en blanco enorme al final.
function Frame({ cols, label, busy, children }: { cols: Set<SupplyColumn>; label: string; busy?: boolean; children: React.ReactNode }) {
  return (
    <div className="relative min-h-0 flex-1 overflow-auto" {...(busy ? { role: "status", "aria-label": label, "aria-busy": true } : {})}>
      <div role="table" aria-label={label} style={{ minWidth: `${minWidth(cols)}rem` }} className="flex w-full flex-col">
        {children}
      </div>
    </div>
  );
}

// Los bloques (una línea y sus productos) van separados por 6 px; margen de 12 px a los lados y 8 abajo. En escritorio se
// suma la altura del pie: la lista llega hasta el borde de la pantalla, bajo la barra, y la última fila no queda tapada.
const BODY = "flex flex-col gap-1.5 px-3 pt-1.5 pb-2 md:pb-[calc(var(--footer-height)+0.5rem)]";

export function SupplyList({
  lines,
  cols,
  columns,
  expanded,
  selectedId,
  onToggle,
  onSelect,
}: {
  lines: SupplyLine[];
  cols: Set<SupplyColumn>;
  columns: ReturnType<typeof useSupplyColumns>;
  expanded: Set<string>;
  selectedId: string | null;
  onToggle: (id: string) => void;
  onSelect: (line: SupplyLine) => void;
}) {
  const tpl = { gridTemplateColumns: template(cols) };
  return (
    <Frame cols={cols} label="Líneas de la lista">
      <Header cols={cols} columns={columns} />
      <div role="rowgroup" className={BODY}>
        {lines.map((l) => {
          const lineTotal = l.assigned.reduce((sum, a) => sum + (a.costCents === null ? 0 : Math.round(a.costCents * a.quantity)), 0);
          const hasCost = l.assigned.some((a) => a.costCents !== null);
          const margin = hasCost && l.referenceCents !== null ? l.referenceCents - lineTotal : null;
          const children = l.assigned.length > 0;
          const open = expanded.has(l.id);
          const selected = selectedId === l.id;
          const unit = unitLabel(l.unit);
          return (
            <div
              key={l.id}
              role="rowgroup"
              // Tocar la línea la selecciona y abre el panel. Los productos se despliegan con su propio botón.
              onClick={() => onSelect(l)}
              className="group/line cursor-pointer overflow-hidden rounded-xl bg-foreground/[0.035]"
            >
              <div
                role="row"
                aria-selected={selected || undefined}
                // La fila se abre también con el teclado (Tab hasta ella y Enter o Espacio).
                tabIndex={0}
                aria-label={`Línea ${l.n}: ${l.description}. ${STATE[l.state].label}. Abrir en el panel`}
                onKeyDown={(e) => {
                  if (e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " ")) return;
                  e.preventDefault();
                  e.currentTarget.click();
                }}
                style={tpl}
                className={cn(
                  ROW,
                  "py-3 outline-none transition-colors group-hover/line:bg-foreground/[0.04] focus-visible:bg-foreground/[0.06]",
                  selected && "bg-foreground/[0.06]",
                )}
              >
                <div role="cell" className="flex items-center">
                  {children ? (
                    <button
                      type="button"
                      aria-expanded={open}
                      aria-label={`${open ? "Ocultar" : "Mostrar"} ${l.assigned.length} ${l.assigned.length === 1 ? "producto asignado" : "productos asignados"} de la línea ${l.n}`}
                      title={open ? "Ocultar productos asignados" : "Mostrar productos asignados"}
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggle(l.id);
                      }}
                      className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      <HugeiconsIcon icon={ArrowRight01Icon} className={cn("size-4 transition-transform duration-150", open && "rotate-90")} />
                    </button>
                  ) : (
                    <span className="block size-7" />
                  )}
                </div>
                <div role="cell" className="num text-right text-muted-foreground">
                  {/* La línea abierta en el panel se marca con su número sobre fondo oscuro. */}
                  <span className={cn("inline-block min-w-6 rounded-md px-1.5 py-0.5 text-center transition-colors", selected && "bg-foreground font-medium text-background")}>{l.n}</span>
                </div>
                <div role="cell" className="min-w-0 break-words">
                  <ProductCell
                    description={l.description}
                    partNumber={l.partNumber}
                    internalCode={l.internalCode}
                    reference={l.reference}
                    bold={selected}
                    extra={
                      children ? (
                        // Chip de los productos asignados: se ve sin desplegar y, al tocarlo, despliega o pliega.
                        <button
                          type="button"
                          aria-expanded={open}
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggle(l.id);
                          }}
                          className="inline-flex h-5 items-center gap-1 rounded-full bg-state-stock/12 px-2 text-xs font-medium text-state-stock-ink transition-colors hover:bg-state-stock/20 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        >
                          <HugeiconsIcon icon={PackageIcon} className="size-3.5" />
                          {l.assigned.length} {l.assigned.length === 1 ? "producto" : "productos"}
                        </button>
                      ) : undefined
                    }
                  />
                </div>
                {cols.has("quantity") && (
                  <div role="cell" className={NUM}>
                    <span className="font-medium">{l.quantity}</span> <span className="font-sans text-xs text-muted-foreground">{unit}</span>
                  </div>
                )}
                {cols.has("reference") && (
                  <div
                    role="cell"
                    className={cn(NUM, "text-foreground/80")}
                    title={l.referenceCents !== null && l.quantity > 0 ? `${formatCents(Math.round(l.referenceCents / l.quantity))} c/u` : undefined}
                  >
                    {l.referenceCents === null ? <span className="text-muted-foreground/40">—</span> : formatCents(l.referenceCents)}
                  </div>
                )}
                {cols.has("cost") && (
                  <div role="cell" className={NUM}>
                    {hasCost ? <span className="font-medium">{formatCents(lineTotal)}</span> : <span className="text-muted-foreground/40">—</span>}
                  </div>
                )}
                {/* Margen contra el precio referencial: en rojo si lo asignado cuesta más de lo que paga el proceso. */}
                {cols.has("margin") && (
                  <div role="cell" className={NUM}>
                    {margin === null ? (
                      <span className="text-muted-foreground/40">—</span>
                    ) : margin < 0 ? (
                      <span className="font-medium text-destructive" title="Lo asignado cuesta más que el precio referencial">−{formatCents(-margin)}</span>
                    ) : (
                      <span className="text-state-stock-ink">+{formatCents(margin)}</span>
                    )}
                  </div>
                )}
                {cols.has("state") && (
                  <div role="cell" className="flex min-w-0 items-center gap-3">
                    <StateLabel tone={STATE[l.state].tone} className={cn("w-28 shrink-0 whitespace-nowrap", l.state === "pending" ? "font-normal text-muted-foreground" : "font-medium")}>{STATE[l.state].label}</StateLabel>
                    <MiniProgress stock={l.reserved} purchased={l.purchased} delivered={l.delivered} total={l.quantity} className="min-w-0 flex-1" />
                  </div>
                )}
              </div>
              {children &&
                open &&
                l.assigned.map((a, i) => (
                  // Separador sutil entre un producto asignado y el siguiente: con varios, es más fácil distinguir dónde acaba uno.
                  <div key={`${a.kind}-${a.code}-${i}`} role="row" style={tpl} className={cn(ROW, "bg-background/50 py-1.5", i > 0 && "border-t border-foreground/[0.06]")}>
                    <div role="cell" />
                    <div role="cell" />
                    <div role="cell" className="min-w-0 pl-5">
                      <span className="block truncate text-[0.8125rem] text-foreground/85" title={a.name}>{a.name}</span>
                      <span className={cn("block truncate font-mono text-xs", a.code ? "text-muted-foreground" : "text-muted-foreground/70")}>{a.code || "Sin código"}</span>
                    </div>
                    {cols.has("quantity") && (
                      <div role="cell" className={cn(NUM, "text-[0.8125rem]")}>
                        {a.quantity} <span className="font-sans text-xs text-muted-foreground">{unit}</span>
                      </div>
                    )}
                    {cols.has("reference") && <div role="cell" />}
                    {cols.has("cost") && (
                      <div
                        role="cell"
                        className={cn(NUM, "text-[0.8125rem]")}
                        title={a.costCents === null ? undefined : `${formatCents(a.costCents)} c/u`}
                      >
                        {a.costCents === null ? <span className="text-muted-foreground">Sin costo</span> : formatCents(Math.round(a.costCents * a.quantity))}
                      </div>
                    )}
                    {cols.has("margin") && <div role="cell" />}
                    {cols.has("state") && (
                      <div role="cell">
                        <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                          <span aria-hidden className={cn("size-1.5 rounded-full", a.kind === "compra" ? STATE.purchased.dot : STATE.in_stock.dot)} />
                          {a.kind === "compra" ? "Por llegar" : "En bodega"}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
            </div>
          );
        })}
      </div>
    </Frame>
  );
}

const WIDTHS = ["w-4/5", "w-3/5", "w-11/12", "w-2/3", "w-3/4", "w-1/2"];

// Misma forma que la lista real (cabecera, bloques, columnas y alto de fila), con barras en lugar de datos.
export function SupplyListSkeleton({ rows = 6, cols }: { rows?: number; cols: Set<SupplyColumn> }) {
  const tpl = { gridTemplateColumns: template(cols) };
  return (
    <Frame cols={cols} label="Cargando líneas" busy>
      <Header cols={cols} />
      <div role="rowgroup" className={BODY}>
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} role="rowgroup" className="overflow-hidden rounded-xl bg-foreground/[0.035]">
            <div role="row" style={tpl} className={cn(ROW, "py-3")}>
              <div role="cell"><span className="block size-7" /></div>
              <div role="cell"><Skeleton className="ml-auto h-4 w-5" /></div>
              <div role="cell">
                <Skeleton className={cn("h-4", WIDTHS[(i + 2) % 6])} />
                <Skeleton className="mt-1.5 h-3 w-28" />
              </div>
              {cols.has("quantity") && <div role="cell"><Skeleton className="ml-auto h-4 w-14" /></div>}
              {cols.has("reference") && <div role="cell"><Skeleton className="ml-auto h-4 w-16" /></div>}
              {cols.has("cost") && <div role="cell"><Skeleton className="ml-auto h-4 w-16" /></div>}
              {cols.has("margin") && <div role="cell"><Skeleton className="ml-auto h-4 w-14" /></div>}
              {cols.has("state") && <div role="cell"><Skeleton className="h-4 w-40" /></div>}
            </div>
          </div>
        ))}
      </div>
    </Frame>
  );
}
