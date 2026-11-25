"use client";

import { CellHeader } from "@/components/cell-header";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { contractSection, contractSubsection } from "@/components/nav-config";
import { type PageFigure, type PagePaginationState, type PageShortcut } from "@/components/page-shortcuts";
import { Skeleton } from "@/components/ui/skeleton";
import { ShortcutBar } from "@/components/shortcut-bar";
import { cn } from "@/lib/utils";
import { useRightPanelOpen } from "@/components/use-side-panel";
import { useActiveModule, useCurrentNavItem } from "@/components/app-shell-nav";

// Separador de las migas: ">" (la "/" se queda para "cliente / proceso").
function Chevron() {
  return <HugeiconsIcon icon={ArrowRight01Icon} className="mx-1 inline size-3.5 align-middle text-muted-foreground" aria-hidden />;
}

export function SectionHeader({
  leading,
  setSlot,
  title,
  crumb,
  panelOpen,
}: {
  leading: React.ReactNode;
  setSlot: (el: HTMLElement | null) => void;
  title: React.ReactNode;
  // Última miga que pone la pantalla (el código de una entrega…); sin ella, el nombre genérico de la ruta.
  crumb?: React.ReactNode;
  // Con la columna de opciones oculta, su tarjeta no se ve: el encabezado muestra cliente y proceso.
  panelOpen: boolean;
}) {
  const { active, path, to } = useActiveModule();
  const currentItem = useCurrentNavItem();
  // Gastos cuelga de Pagos.
  const section = contractSection(path.replace(/^(\/contratos\/[^/]+)\/gastos(?=\/|$)/, "$1/pagos"));
  const sub = crumb ?? contractSubsection(path);
  const base = path.match(/^\/contratos\/[0-9a-f-]{36}/i)?.[0] ?? "";
    // Migas: módulo / sección / pantalla dentro de la sección (si la hay).
  const crumbs = section ? (
    <span>
      <Link href={to("/contratos")} className="text-muted-foreground transition-colors hover:text-foreground">Procesos</Link>
      <Chevron />
      {sub ? (
        <>
          <Link href={to(`${base}${section.slug ? `/${section.slug}` : ""}`)} className="text-muted-foreground transition-colors hover:text-foreground">{section.title}</Link>
          <Chevron />
          <span aria-current="page" className="text-foreground">{sub}</span>
        </>
      ) : (
        <span aria-current="page" className="text-foreground">{section.title}</span>
      )}
    </span>
  ) : null;
  // Fuera de un proceso: solo la opción que se está viendo (Todos, En ejecución, Crédito…); el módulo ya está en el título de
  // la columna de opciones. Sin opción que coincida, el nombre del módulo.
  const sectionTitle = currentItem?.title ?? active.title;
  // Con la columna de opciones oculta su tarjeta no se ve: arriba van cliente y proceso, y debajo las migas.
  const showProcess = Boolean(section) && !panelOpen;
  return (
    <CellHeader
      // Por encima de las filas fijas de las pantallas (buscadores y pestañas, z-20) para que su sombra siempre se vea, y por
      // debajo de las columnas laterales y los cajones (z-30 y más).
      className="relative z-[25] shadow-bar print:hidden"
      title={showProcess ? (title ?? <Skeleton className="h-4 w-56" />) : (crumbs ?? title ?? sectionTitle)}
      subtitle={showProcess ? crumbs : undefined}
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
  orgMenu,
  panelOpen,
  pageShortcuts,
  pageFigures,
  pagePagination,
}: {
  setActionsSlot: (node: HTMLDivElement | null) => void;
  setContextSlot: (node: HTMLDivElement | null) => void;
  newLabel: string | null;
  account: React.ReactNode;
  orgMenu: React.ReactNode;
  panelOpen: boolean;
  pageShortcuts: PageShortcut[];
  pageFigures: PageFigure[];
  pagePagination: PagePaginationState | null;
}) {
  // La columna de asignar tapa el borde derecho de la barra: se deja ese ancho libre y se ocultan las cifras.
  const rightOpen = useRightPanelOpen();
  return (
    <div data-layout-footer className="absolute inset-x-0 bottom-0 z-[24] hidden h-(--footer-height) print:hidden md:flex">
      {/* La celda de la cuenta es la continuación de la columna de módulos: mismo fondo, mismo borde y el ícono con el
          color y el resalte de los demás íconos de la columna. */}
      <div className="w-[4.0625rem] shrink-0 border-t border-r border-foreground/10 bg-layer-1 [&_button]:size-full! [&_button]:rounded-none! [&_button]:bg-transparent! [&_button]:text-muted-foreground! [&_button]:transition-colors [&_button:hover]:bg-foreground/[0.08]! [&_button:hover]:text-foreground!">
        {account}
      </div>
      {/* Bajo las opciones: el selector de organización (el botón para plegarlas está en el encabezado de la columna).
          Plegadas, la celda desaparece y el selector pasa al inicio de la barra (el botón para abrirlas está en el encabezado). */}
      <div
        inert={!panelOpen}
        className={cn(
          "shrink-0 overflow-hidden border-t border-foreground/10 bg-layer-2 transition-[width] duration-200 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none",
          panelOpen ? "w-60 border-r" : "w-0 border-r-0",
        )}
      >
        <div className="h-full w-60">{orgMenu}</div>
      </div>
      <div className={cn("relative flex min-w-0 flex-1 border-t transition-[padding] duration-200 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none", rightOpen && "lg:pr-[32rem]")}>
        <ShortcutBar pageShortcuts={pageShortcuts} pageFigures={rightOpen ? [] : pageFigures} pagePagination={pagePagination} setActionsSlot={setActionsSlot} setContextSlot={setContextSlot} newLabel={newLabel} leading={panelOpen ? null : (
          <div className="w-52 shrink-0 border-r">{orgMenu}</div>
        )} />
      </div>
    </div>
  );
}
