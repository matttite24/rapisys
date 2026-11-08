"use client";

import { CELL_ROW } from "@/components/cell-header";
import { TabCount } from "@/components/count-tabs";
import { FolderTabs } from "@/components/folder-tabs";
import { useState } from "react";
import { Cancel01Icon, LeftToRightListBulletIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { SearchInput } from "@/components/search-input";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { ListView } from "@/components/contract-lists-model";

// Botón inicial de la fila: abre un cajón con todas las listas y un buscador (sirve con muchas).
export function AllLists({
  lists,
  counts,
  activeId,
  onSelect,
}: {
  lists: ListView[];
  counts: Record<string, number>;
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const term = q.trim().toLowerCase();
  const shown = term
    ? lists.filter((l) =>
        [l.name, l.brand, l.model, l.serial, l.identifier].some((v) => v.toLowerCase().includes(term)),
      )
    : lists;

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQ("");
      }}
    >
      <button
        type="button"
        aria-label={`Ver todas las listas (${lists.length})`}
        title="Todas las listas"
        onClick={() => setOpen(true)}
        className="mr-2 mb-px flex h-full shrink-0 items-center px-2 text-muted-foreground transition-colors hover:text-foreground"
      >
        <HugeiconsIcon icon={LeftToRightListBulletIcon} className="size-5" />
      </button>
      <SheetContent side="left" showCloseButton={false} className="gap-0 bg-background data-[side=left]:w-full data-[side=left]:sm:max-w-md">
        <SheetHeader className={cn(CELL_ROW, "flex-row justify-between gap-3 px-4 pr-4 shadow-bar")}>
          <SheetTitle className="caps-md min-w-0 truncate font-medium">Listas del contrato</SheetTitle>
          <SheetDescription className="sr-only">
            {lists.length} {lists.length === 1 ? "lista" : "listas"}. Elige una para abrirla.
          </SheetDescription>
          <SheetClose render={<Button variant="ghost" size="icon" aria-label="Cerrar listas" />}>
            <HugeiconsIcon icon={Cancel01Icon} className="size-5" />
          </SheetClose>
        </SheetHeader>
        <div className="flex h-12 border-b">
          <SearchInput
            label="Buscar lista"
            placeholder="Buscar por nombre, marca, modelo o serie"
            value={q}
            onChange={setQ}
            autoFocus
          />
        </div>
        <ul aria-label="Listas" className="min-h-0 flex-1 divide-y overflow-y-auto">
          {shown.length === 0 && <li className="p-4 text-sm text-muted-foreground">Ninguna lista coincide.</li>}
          {shown.map((l) => {
            const active = l.id === activeId;
            const detail = [l.brand, l.model, l.serial].filter(Boolean).join(" · ");
            return (
              <li key={l.id}>
                <button
                  type="button"
                  aria-current={active ? "true" : undefined}
                  onClick={() => {
                    onSelect(l.id);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex min-h-14 w-full items-start gap-3 border-l-2 px-4 py-3 text-left transition-colors hover:bg-accent",
                    active ? "border-l-brand bg-foreground/[0.06]" : "border-l-transparent",
                  )}
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className={cn("break-words", active && "font-bold")}>{l.name}</span>
                    {detail && <span className="truncate font-mono text-xs text-muted-foreground">{detail}</span>}
                  </span>
                  <TabCount n={counts[l.id] ?? 0} active={active} />
                </button>
              </li>
            );
          })}
        </ul>
      </SheetContent>
    </Sheet>
  );
}

// Pestañas: una por lista, con su cantidad de líneas.
export function ListTabs({
  lists,
  counts,
  activeId,
  onSelect,
}: {
  lists: ListView[];
  counts: Record<string, number>;
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <FolderTabs
      label="Listas del contrato"
      tabs={lists.map((l) => ({ key: l.id, label: l.name, count: counts[l.id] ?? 0 }))}
      activeKey={activeId}
      onSelect={onSelect}
      leading={<AllLists lists={lists} counts={counts} activeId={activeId} onSelect={onSelect} />}
    />
  );
}
