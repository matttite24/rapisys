"use client";

import { TabCount } from "@/components/count-tabs";
import { cn } from "@/lib/utils";

export type FolderTab = { key: string; label: string; count: number };

// Pestañas tipo carpeta: sobre una franja gris, la activa sube al color del contenido y se une a él; las demás quedan
// hundidas. Teclado: flechas, Inicio y Fin cambian de pestaña (solo la activa entra con Tab).
export function FolderTabs({
  tabs,
  activeKey,
  onSelect,
  label,
  leading,
  trailing,
}: {
  tabs: FolderTab[];
  activeKey: string | null | undefined;
  onSelect: (key: string) => void;
  label: string;
  // Lo que va antes de las pestañas (por ejemplo, el botón que abre todas las listas).
  leading?: React.ReactNode;
  // Lo que va a la derecha de la fila (por ejemplo, una acción de la lista): se queda a la vista aunque haya muchas pestañas.
  trailing?: React.ReactNode;
}) {
  const active = tabs.some((t) => t.key === activeKey) ? activeKey : tabs[0]?.key;

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const i = tabs.findIndex((t) => t.key === active);
    const next =
      e.key === "ArrowRight" ? (i + 1) % tabs.length : e.key === "ArrowLeft" ? (i - 1 + tabs.length) % tabs.length : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : -1;
    if (next < 0 || tabs.length === 0) return;
    e.preventDefault();
    onSelect(tabs[next].key);
    e.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]')[next]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className="sticky top-0 z-20 flex h-12 items-end gap-1 overflow-x-auto overflow-y-hidden bg-layer-2 px-4 pt-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-border" />
      {leading}
      {tabs.map((t) => {
        const on = t.key === active;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onSelect(t.key)}
            className={cn(
              "relative flex h-full max-w-64 shrink-0 items-center gap-2 rounded-t-lg px-4 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
              on ? "z-10 bg-background font-semibold text-foreground" : "mb-px font-medium text-muted-foreground hover:bg-foreground/[0.09] hover:text-foreground",
            )}
          >
            <span className="truncate">{t.label}</span>
            <TabCount n={t.count} active={on} />
          </button>
        );
      })}
      {trailing && <div className="sticky right-0 ml-auto flex shrink-0 items-center self-stretch bg-layer-2 pb-px pl-3">{trailing}</div>}
    </div>
  );
}
