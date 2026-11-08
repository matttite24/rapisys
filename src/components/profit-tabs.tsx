"use client";

import { useState } from "react";
import { Cancel01Icon, LeftToRightListBulletIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { CELL_ROW } from "@/components/cell-header";
import { TabCount } from "@/components/count-tabs";
import { FolderTabs } from "@/components/folder-tabs";
import { SearchInput } from "@/components/search-input";
import { PageFigures, type PageFigure } from "@/components/page-shortcuts";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type Tab = { key: string; label: string; count: number; figures: PageFigure[]; note: React.ReactNode; panel: React.ReactNode; list?: boolean };

// Pestañas de la revisión, con forma de carpeta: facturas y gastos primero, luego una por lista.
// El botón de la izquierda abre el cajón con todas las listas (son muchas para caber en la fila).
export function ProfitTabs({ tabs, top }: { tabs: Tab[]; top?: React.ReactNode }) {
  const [active, setActive] = useState(tabs[0]?.key);
  const [open, setOpen] = useState(false);
  const current = tabs.find((t) => t.key === active) ?? tabs[0];
  const [q, setQ] = useState("");
  const lists = tabs.filter((t) => t.list);
  const term = q.trim().toLowerCase();
  const shown = term ? lists.filter((t) => t.label.toLowerCase().includes(term)) : lists;

  return (
    <>
      {top}
      <FolderTabs
        label="Revisión por facturas, gastos y listas"
        tabs={tabs.map((t) => ({ key: t.key, label: t.label, count: t.count }))}
        activeKey={current?.key}
        onSelect={setActive}
        leading={
          lists.length > 0 ? (
            <button
              type="button"
              aria-label={`Ver todas las listas (${lists.length})`}
              title="Todas las listas"
              onClick={() => setOpen(true)}
              className="mr-2 mb-px flex h-full shrink-0 items-center px-2 text-muted-foreground transition-colors hover:text-foreground"
            >
              <HugeiconsIcon icon={LeftToRightListBulletIcon} className="size-5" />
            </button>
          ) : null
        }
      />
      <PageFigures figures={current?.figures ?? []} />
      <p className="border-b px-4 py-3 text-xs text-muted-foreground">{current?.note}</p>
      {current?.panel}

      <Sheet
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setQ("");
        }}
      >
        <SheetContent side="left" showCloseButton={false} className="gap-0 bg-background data-[side=left]:w-full data-[side=left]:sm:max-w-md">
          <SheetHeader className={cn(CELL_ROW, "flex-row justify-between gap-3 px-4 pr-4 shadow-bar")}>
            <SheetTitle className="caps-md min-w-0 truncate font-medium">Listas del contrato</SheetTitle>
            <SheetDescription className="sr-only">Elige una lista para ver su rentabilidad.</SheetDescription>
            <SheetClose render={<Button variant="ghost" size="icon" aria-label="Cerrar listas" />}>
              <HugeiconsIcon icon={Cancel01Icon} className="size-5" />
            </SheetClose>
          </SheetHeader>
          <div className="flex h-12 border-b">
            <SearchInput label="Buscar lista" placeholder="Buscar por nombre" value={q} onChange={setQ} autoFocus />
          </div>
          <ul aria-label="Listas" className="min-h-0 flex-1 divide-y overflow-y-auto">
            {shown.length === 0 && <li className="p-4 text-sm text-muted-foreground">Ninguna lista coincide.</li>}
            {shown.map((t) => {
              const on = current?.key === t.key;
              return (
                <li key={t.key}>
                  <button
                    type="button"
                    aria-current={on ? "true" : undefined}
                    onClick={() => {
                      setActive(t.key);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex min-h-14 w-full items-start gap-3 border-l-2 px-4 py-3 text-left transition-colors hover:bg-accent",
                      on ? "border-l-brand bg-foreground/[0.06]" : "border-l-transparent",
                    )}
                  >
                    <span className={cn("min-w-0 flex-1 break-words", on && "font-bold")}>{t.label}</span>
                    <TabCount n={t.count} active={on} />
                  </button>
                </li>
              );
            })}
          </ul>
        </SheetContent>
      </Sheet>
    </>
  );
}
