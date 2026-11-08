"use client";

import Link from "next/link";
import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Kbd } from "@/components/ui/kbd";
import { buttonVariants } from "@/components/ui/button";
import type { PageFigure, PagePaginationState, PageShortcut } from "@/components/page-shortcuts";
import { PAGE_SIZE, pageCount } from "@/lib/pagination";
import { cn } from "@/lib/utils";

// Lenguaje de la barra inferior. De izquierda a derecha:
//   datos (qué veo) · contexto (qué tengo seleccionado o filtrado) · atajos y paginación (cómo me muevo).
// Tres piezas, siempre con la misma forma: cifra, tecla y paginador.

// Cifra: etiqueta gris y valor en peso medio, en una sola línea. "warn" pasa el valor al rojo de atención.
function Figure({ f }: { f: PageFigure }) {
  return (
    <div className="flex items-baseline gap-2 px-4">
      <dt className="text-xs text-muted-foreground">{f.label}</dt>
      <dd className={cn("num flex items-baseline gap-1.5 text-sm font-semibold", f.tone === "warn" ? "text-destructive" : "text-foreground")}>
        {f.value}
        {f.note && <span className="font-sans text-xs font-normal text-muted-foreground">{f.note}</span>}
      </dd>
    </div>
  );
}

// Atajo: teclas pequeñas y su nombre en gris.
function Shortcut({ s }: { s: PageShortcut }) {
  return (
    <span className="flex shrink-0 items-center gap-1.5 text-xs">
      <span className="flex gap-0.5">
        {s.keys.map((k) => (
          <Kbd key={k} className="h-5 min-w-5 border-0 bg-foreground/[0.07] px-1 text-[0.6875rem] font-normal">
            {k}
          </Kbd>
        ))}
      </span>
      <span className="hidden opacity-80 xl:inline">{s.label}</span>
    </span>
  );
}

// Paginador compacto: "1–50 de 120" y dos flechas.
function Pager({ p }: { p: PagePaginationState }) {
  const size = p.size ?? PAGE_SIZE;
  const pages = pageCount(p.total, size);
  if (pages <= 1 && !p.always) return null;
  const from = p.total === 0 ? 0 : (p.page - 1) * size + 1;
  const to = Math.min(p.total, p.page * size);
  const href = (page: number) => `${p.basePath}?${new URLSearchParams({ ...p.params, page: String(page) })}`;
  const arrow = (icon: typeof ArrowLeft01Icon, target: number, enabled: boolean, label: string) =>
    enabled ? (
      <Link href={href(target)} className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "size-8")} aria-label={label}>
        <HugeiconsIcon icon={icon} className="size-4" aria-hidden />
      </Link>
    ) : (
      <span aria-hidden className="size-8" />
    );
  return (
    <nav aria-label="Paginación" className="flex shrink-0 items-center gap-1 px-2">
      <span className="num whitespace-nowrap px-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{from}–{to}</span> de {p.total}
      </span>
      {arrow(ArrowLeft01Icon, p.page - 1, p.page > 1, "Página anterior")}
      {arrow(ArrowRight01Icon, p.page + 1, p.page < pages, "Página siguiente")}
    </nav>
  );
}

export function ShortcutBar({
  pageShortcuts = [],
  pageFigures = [],
  pagePagination,
  setActionsSlot,
  setContextSlot,
  newLabel,
  leading,
}: {
  pageShortcuts?: PageShortcut[];
  pageFigures?: PageFigure[];
  pagePagination?: PagePaginationState | null;
  setActionsSlot?: (node: HTMLDivElement | null) => void;
  setContextSlot?: (node: HTMLDivElement | null) => void;
  newLabel?: string | null;
  // Control al inicio de la barra (por ejemplo, volver a abrir las opciones cuando están plegadas).
  leading?: React.ReactNode;
}) {
  // El atajo de "nuevo" va primero, en todas las secciones que tienen una acción de crear.
  const shortcuts: PageShortcut[] = [...(newLabel ? [{ keys: ["Alt", "N"], label: newLabel }] : []), ...pageShortcuts];

  return (
    <div role="group" aria-label="Resumen y atajos" className="flex min-w-0 flex-1 items-stretch overflow-hidden bg-background/75 text-muted-foreground backdrop-blur-xs">
      {leading}
      {pageFigures.length > 0 && (
        <dl className="flex shrink-0 items-center divide-x py-3">
          {pageFigures.map((f) => (
            <Figure key={f.label} f={f} />
          ))}
        </dl>
      )}
      {/* Contexto: lo llena la página con <PageFooterContext>. Vacío, no ocupa nada. */}
      <div ref={setContextSlot} className="flex min-w-0 flex-1 items-center gap-3 px-4 text-sm text-foreground empty:hidden" />
      <div className="ml-auto flex shrink-0 items-center divide-x">
        {shortcuts.length > 0 && (
          <div className="flex items-center gap-4 px-4">
            {shortcuts.map((s) => (
              <Shortcut key={s.label} s={s} />
            ))}
          </div>
        )}
        <div ref={setActionsSlot} className="flex items-center gap-2 px-3 empty:hidden" />
        {pagePagination && <Pager p={pagePagination} />}
      </div>
    </div>
  );
}
