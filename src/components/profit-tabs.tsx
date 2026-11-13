"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
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

export type ProfitTab = { key: string; label: string; count: number; list?: boolean };

// Pestañas de la revisión, con forma de carpeta: facturas y gastos primero, luego una por entrega. La pestaña viaja en la
// dirección (?pestana=) y el servidor entrega solo el contenido de la activa: cambiarla pide únicamente esa pestaña.
// El botón de la izquierda abre el cajón con todas las entregas (son muchas para caber en la fila).
export function ProfitTabs({
  tabs,
  activeKey,
  top,
  figures,
  note,
  children,
}: {
  tabs: ProfitTab[];
  activeKey: string;
  top?: React.ReactNode;
  figures: PageFigure[];
  note?: React.ReactNode;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  function select(key: string) {
    startTransition(() => router.replace(`${pathname}?pestana=${encodeURIComponent(key)}`, { scroll: false }));
  }
  const [open, setOpen] = useState(false);
  const current = tabs.find((t) => t.key === activeKey) ?? tabs[0];
  const [q, setQ] = useState("");
  const lists = tabs.filter((t) => t.list);
  const term = q.trim().toLowerCase();
  const shown = term ? lists.filter((t) => t.label.toLowerCase().includes(term)) : lists;

  return (
    <>
      {top}
      <FolderTabs
        label="Revisión por facturas, gastos y entregas"
        tabs={tabs.map((t) => ({ key: t.key, label: t.label, count: t.count }))}
        activeKey={current?.key}
        onSelect={select}
        leading={
          lists.length > 0 ? (
            <button
              type="button"
              aria-label={`Ver todas las entregas (${lists.length})`}
              title="Todas las entregas"
              onClick={() => setOpen(true)}
              className="mr-2 mb-px flex h-full shrink-0 items-center px-2 text-muted-foreground transition-colors hover:text-foreground"
            >
              <HugeiconsIcon icon={LeftToRightListBulletIcon} className="size-5" />
            </button>
          ) : null
        }
      />
      <PageFigures figures={figures} />
      {note && <p className="border-b px-4 py-3 text-xs text-muted-foreground">{note}</p>}
      <div aria-busy={pending} className={cn("transition-opacity", pending && "opacity-60")}>
        {children}
      </div>

      <Sheet
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setQ("");
        }}
      >
        <SheetContent side="left" showCloseButton={false} className="gap-0 bg-background data-[side=left]:w-full data-[side=left]:sm:max-w-md">
          <SheetHeader className={cn(CELL_ROW, "flex-row justify-between gap-3 px-4 pr-4 shadow-bar")}>
            <SheetTitle className="caps-md min-w-0 truncate font-medium">Entregas del contrato</SheetTitle>
            <SheetDescription className="sr-only">Elige una entrega para ver su rentabilidad.</SheetDescription>
            <SheetClose render={<Button variant="ghost" size="icon" aria-label="Cerrar entregas" />}>
              <HugeiconsIcon icon={Cancel01Icon} className="size-5" />
            </SheetClose>
          </SheetHeader>
          <div className="flex h-12 border-b">
            <SearchInput label="Buscar entrega" placeholder="Buscar por número de entrega" value={q} onChange={setQ} autoFocus />
          </div>
          <ul aria-label="Listas" className="min-h-0 flex-1 divide-y overflow-y-auto">
            {shown.length === 0 && <li className="p-4 text-sm text-muted-foreground">Ninguna entrega coincide.</li>}
            {shown.map((t) => {
              const on = current?.key === t.key;
              return (
                <li key={t.key}>
                  <button
                    type="button"
                    aria-current={on ? "true" : undefined}
                    onClick={() => {
                      select(t.key);
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
