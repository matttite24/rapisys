"use client";

import { createContext, useContext, useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

export const FooterActionsContext = createContext<HTMLElement | null>(null);

export function PageFooterActions({ children }: { children: React.ReactNode }) {
  const slot = useContext(FooterActionsContext);
  return <>{slot && createPortal(children, slot)}<div className="p-4 md:hidden">{children}</div></>;
}

// Centro de la barra inferior: contexto de la pantalla (filtros activos, selección, estado de guardado). Cada página lo
// llena con <PageFooterContext>; solo se ve mientras la página está montada.
export const FooterContextContext = createContext<HTMLElement | null>(null);

export function PageFooterContext({ children }: { children: React.ReactNode }) {
  const slot = useContext(FooterContextContext);
  return slot ? createPortal(children, slot) : null;
}

// Acción de "crear nuevo" de la página: el encabezado la registra y la barra muestra su atajo.
export const PageNewActionContext = createContext<(label: string | null) => void>(() => {});

// Tecla modificadora principal que se muestra: ⌘ en Mac y Ctrl en el resto (el atajo acepta las dos).
export function useModKey(): string {
  const isMac = useSyncExternalStore(
    () => () => {},
    () => /Mac|iPhone|iPad/.test(navigator.platform),
    () => false,
  );
  return isMac ? "⌘" : "Ctrl";
}

export type PageShortcut = { keys: string[]; label: string };
export type PagePaginationState = {
  basePath: string;
  page: number;
  total: number;
  params?: Record<string, string>;
  size?: number;
  always?: boolean;
};

export const PagePaginationContext = createContext<(pagination: PagePaginationState | null) => void>(() => {});

// Registra la paginación activa para mostrarla en el pie fijo del shell.
export function PagePagination({
  basePath,
  page,
  total,
  params = {},
  size,
  always,
}: PagePaginationState) {
  const set = useContext(PagePaginationContext);
  const sig = JSON.stringify({ basePath, page, total, params, size, always });
  useEffect(() => {
    set(JSON.parse(sig) as PagePaginationState);
    return () => set(null);
  }, [sig, set]);
  return null;
}

// Cifras de la página para la barra inferior (por ejemplo, el monto del proceso). `tone: "warn"` las resalta.
export type PageFigure = { label: string; value: string; tone?: "warn"; note?: string };
export const PageFiguresContext = createContext<(figures: PageFigure[]) => void>(() => {});

// Registra las cifras de la página mientras está montada; la barra de atajos las muestra a la izquierda.
export function PageFigures({ figures }: { figures: PageFigure[] }) {
  const set = useContext(PageFiguresContext);
  const sig = JSON.stringify(figures);
  useEffect(() => {
    set(JSON.parse(sig) as PageFigure[]);
    return () => set([]);
  }, [sig, set]);
  return null;
}

// Setter de los atajos de la página actual; lo provee el shell y los muestra en su barra inferior.
export const PageShortcutsContext = createContext<(shortcuts: PageShortcut[]) => void>(() => {});

// Registra los atajos de la página mientras está montada (solo los muestra; cada página los atiende).
export function PageShortcuts({ shortcuts }: { shortcuts: PageShortcut[] }) {
  const set = useContext(PageShortcutsContext);
  const sig = JSON.stringify(shortcuts);
  useEffect(() => {
    set(JSON.parse(sig) as PageShortcut[]);
    return () => set([]);
  }, [sig, set]);
  return null;
}
