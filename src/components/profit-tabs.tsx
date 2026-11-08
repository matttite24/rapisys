"use client";

import { useState } from "react";
import { Cancel01Icon, LeftToRightListBulletIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { PageFigures, type PageFigure } from "@/components/page-shortcuts";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type Tab = { key: string; label: string; count: number; figures: PageFigure[]; panel: React.ReactNode; list?: boolean };

// Pestañas de la revisión, con forma de carpeta: facturas y gastos primero, luego una por lista.
// El botón de la izquierda abre el cajón con todas las listas (son muchas para caber en la fila).
export function ProfitTabs({ tabs }: { tabs: Tab[] }) {
  const [active, setActive] = useState(tabs[0]?.key);
  const [open, setOpen] = useState(false);
  const current = tabs.find((t) => t.key === active) ?? tabs[0];
  const lists = tabs.filter((t) => t.list);

  return (
    <>
      <div className="flex items-end gap-1 border-b bg-surface-strong px-4 pt-3">
        {lists.length > 0 && (
          <button
            type="button"
            aria-label={`Ver todas las listas (${lists.length})`}
            title="Todas las listas"
            onClick={() => setOpen(true)}
            className="mb-1.5 flex size-8 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
          >
            <HugeiconsIcon icon={LeftToRightListBulletIcon} className="size-5" />
          </button>
        )}
        <nav aria-label="Revisión por facturas, gastos y listas" className="flex min-w-0 items-end gap-1 overflow-x-auto">
          {tabs.map((t) => {
            const on = current?.key === t.key;
            return (
              <button
                key={t.key}
                type="button"
                aria-pressed={on}
                onClick={() => setActive(t.key)}
                className={cn(
                  "-mb-px flex max-w-56 shrink-0 items-center gap-2 rounded-t-lg border border-b-0 px-4 py-2 text-sm transition-colors",
                  on ? "border-border bg-background font-semibold text-foreground" : "border-transparent text-muted-foreground hover:bg-background/60 hover:text-foreground",
                )}
              >
                <span className="truncate">{t.label}</span>
                <span className={cn("num rounded-sm px-1.5 py-0.5 text-xs font-medium", on ? "bg-brand text-brand-foreground" : "bg-muted text-foreground/80")}>{t.count}</span>
              </button>
            );
          })}
        </nav>
      </div>
      <PageFigures figures={current?.figures ?? []} />
      {current?.panel}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" showCloseButton={false} className="gap-0 bg-background data-[side=left]:w-full data-[side=left]:sm:max-w-md">
          <SheetHeader className="h-14 flex-row items-center justify-between gap-3 border-b px-4 py-0">
            <SheetTitle className="caps-md min-w-0 truncate font-medium">Listas del contrato</SheetTitle>
            <SheetDescription className="sr-only">Elige una lista para ver su rentabilidad.</SheetDescription>
            <SheetClose render={<Button variant="ghost" size="icon" aria-label="Cerrar listas" />}>
              <HugeiconsIcon icon={Cancel01Icon} className="size-5" />
            </SheetClose>
          </SheetHeader>
          <ul aria-label="Listas" className="min-h-0 flex-1 divide-y overflow-y-auto">
            {lists.map((t) => (
              <li key={t.key}>
                <button
                  type="button"
                  onClick={() => {
                    setActive(t.key);
                    setOpen(false);
                  }}
                  className={cn("flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-accent/60", current?.key === t.key && "bg-accent/40 font-semibold")}
                >
                  <span className="min-w-0 truncate">{t.label}</span>
                  <span className="num shrink-0 text-xs text-muted-foreground">{t.count} {t.count === 1 ? "línea" : "líneas"}</span>
                </button>
              </li>
            ))}
          </ul>
        </SheetContent>
      </Sheet>
    </>
  );
}
