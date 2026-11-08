"use client";

import { cn } from "@/lib/utils";

// Título de un grupo de la lista: qué es y cuántas hay.
export function GroupBar({ label, count, accent }: { label: string; count: number; accent?: boolean }) {
  return (
    <h3
      className={cn(
        "sticky top-0 z-10 flex h-8 items-center gap-2 border-y bg-surface-strong px-4 text-xs font-medium",
        accent ? "text-foreground" : "text-muted-foreground",
      )}
    >
      {label}
      <span className="num font-normal text-muted-foreground">{count}</span>
      {/* Qué es cada columna de las filas: existencias y costo unitario. */}
      <span className="ml-auto font-normal text-muted-foreground">Disponible · c/u</span>
    </h3>
  );
}
