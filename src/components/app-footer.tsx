"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { SidebarLeftIcon, SidebarRightIcon } from "@hugeicons/core-free-icons";
import { CellHeader } from "@/components/cell-header";
import { CONTRACT_SECTIONS } from "@/components/nav-config";
import { useModKey, type PageFigure, type PagePaginationState, type PageShortcut } from "@/components/page-shortcuts";
import { Kbd } from "@/components/ui/kbd";
import { ShortcutBar } from "@/components/shortcut-bar";
import { cn } from "@/lib/utils";
import { useActiveModule } from "@/components/app-shell-nav";

export function SectionHeader({
  leading,
  setSlot,
  title,
}: {
  leading: React.ReactNode;
  setSlot: (el: HTMLElement | null) => void;
  title: React.ReactNode;
}) {
  const { active, path } = useActiveModule();
  // Dentro de un proceso: arriba la sección y debajo "cliente / contrato" (lo que pone el layout).
  const slug = path.match(/^\/contratos\/[0-9a-f-]{36}(?:\/([^/]+))?/i);
  const section = slug ? CONTRACT_SECTIONS.find((s) => s.slug === (slug[1] ?? "")) : undefined;
  return (
    <CellHeader
      // Por encima de las filas fijas de las pantallas (buscadores y pestañas, z-20) para que su sombra siempre se vea, y por
      // debajo de las columnas laterales y los cajones (z-30 y más).
      className="crosshair-start relative z-[25] shadow-bar print:hidden"
      title={section ? section.title : (title ?? active.title)}
      subtitle={section ? title : undefined}
      leading={leading}
      action={<div ref={setSlot} className="flex items-center gap-1 self-stretch" />}
    />
  );
}

// Pie de la cuadrícula, con las mismas tres columnas que el encabezado: cuenta bajo los módulos,
// "Volver" (dentro de un proceso) bajo las opciones, y los atajos bajo el contenido.
export function Footer({
  setActionsSlot,
  setContextSlot,
  newLabel,
  account,
  panelOpen,
  onTogglePanel,
  pageShortcuts,
  pageFigures,
  pagePagination,
}: {
  setActionsSlot: (node: HTMLDivElement | null) => void;
  setContextSlot: (node: HTMLDivElement | null) => void;
  newLabel: string | null;
  account: React.ReactNode;
  panelOpen: boolean;
  onTogglePanel: () => void;
  pageShortcuts: PageShortcut[];
  pageFigures: PageFigure[];
  pagePagination: PagePaginationState | null;
}) {
  const mod = useModKey();
  return (
    <div data-layout-footer className="absolute inset-x-0 bottom-0 z-[24] hidden h-(--footer-height) border-t print:hidden md:flex">
      {/* La celda de la cuenta es la continuación de la columna de módulos: mismo fondo, mismo borde y el ícono con el
          color y el resalte de los demás íconos de la columna. */}
      <div className="w-16 shrink-0 border-r bg-layer-1 [&_button]:size-full! [&_button]:rounded-none! [&_button]:bg-transparent! [&_button]:text-muted-foreground! [&_button]:transition-colors [&_button:hover]:bg-foreground/[0.08]! [&_button:hover]:text-foreground!">
        {account}
      </div>
      {/* Bajo las opciones: el botón para plegarlas (y su atajo). Plegadas, la celda desaparece; para abrirlas se toca un
          módulo del riel o se usa el atajo, que la barra recuerda a la derecha. */}
      <div
        inert={!panelOpen}
        className={cn(
          "shrink-0 overflow-hidden bg-layer-2 transition-[width] duration-200 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none",
          panelOpen ? "w-60 border-r" : "w-0",
        )}
      >
        <button
          type="button"
          onClick={onTogglePanel}
          aria-expanded={panelOpen}
          aria-label={panelOpen ? "Ocultar opciones" : "Mostrar opciones"}
          title={`${panelOpen ? "Ocultar" : "Mostrar"} opciones (${mod} B)`}
          className="flex h-full w-60 items-center gap-2.5 px-[0.9375rem] text-sm text-muted-foreground transition-colors outline-none hover:bg-foreground/[0.06] hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          <HugeiconsIcon icon={panelOpen ? SidebarLeftIcon : SidebarRightIcon} className="size-[1.125rem] shrink-0" aria-hidden />
          <span className="truncate">{panelOpen ? "Ocultar opciones" : "Mostrar opciones"}</span>
          <span className="ml-auto flex shrink-0 gap-0.5 pr-4" aria-hidden>
            <Kbd soft>{mod}</Kbd>
            <Kbd soft>B</Kbd>
          </span>
        </button>
      </div>
      <div className="relative flex min-w-0 flex-1">
        {/* Cruz sobre el cruce de la línea del pie (y de 0 a 1) y la vertical de la columna anterior (x de -1 a 0). */}
        <span aria-hidden className="pointer-events-none absolute -top-[5px] -left-[6px] z-30 size-[11px]">
          <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-foreground" />
          <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-foreground" />
        </span>
        <ShortcutBar pageShortcuts={pageShortcuts} pageFigures={pageFigures} pagePagination={pagePagination} setActionsSlot={setActionsSlot} setContextSlot={setContextSlot} newLabel={newLabel} leading={panelOpen ? null : (
          <button
            type="button"
            onClick={onTogglePanel}
            aria-label="Mostrar opciones"
            className="flex shrink-0 items-center gap-2 border-r px-4 text-sm font-medium text-foreground transition-colors outline-none hover:bg-foreground/[0.06] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <HugeiconsIcon icon={SidebarRightIcon} className="size-[1.125rem]" aria-hidden />
            Mostrar opciones
            <span className="flex gap-0.5" aria-hidden>
              <Kbd soft>{mod}</Kbd>
              <Kbd soft>B</Kbd>
            </span>
          </button>
        )} />
      </div>
    </div>
  );
}
