"use client";

import { PRODUCT_COL } from "@/components/product-cell";
import { cn } from "@/lib/utils";
import { Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { TD, TH } from "@/components/contract-lines-model";

// Anchos de las barras de relleno, variados para que no parezca una rejilla repetida.
export const SKELETON_WIDTHS = ["w-4/5", "w-3/5", "w-11/12", "w-2/3", "w-3/4", "w-1/2"];

// La tabla vacía con sus títulos reales y filas de relleno: aparece al instante y los datos
// llegan después. Sirve también al cambiar de lista, de página o al buscar.
export function LinesTableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Cargando líneas">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className={`${TH} w-px text-right`}>N.º</TableHead>
            <TableHead className={`${TH} ${PRODUCT_COL}`}>Producto</TableHead>
            <TableHead className={`${TH} w-28 text-right`}>Cantidad</TableHead>
            <TableHead className={`${TH} w-32 text-right`}>Valor unit. ref.</TableHead>
            <TableHead className={`${TH} w-32 text-right`}>Total ref.</TableHead>
            <TableHead className={`${TH} w-px`}><span className="sr-only">Acciones</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: rows }, (_, i) => (
            <TableRow key={i} className="hover:bg-transparent">
              <TableCell className={`${TD} w-px`}><Skeleton className="ml-auto h-4 w-5" /></TableCell>
              <TableCell className={TD}>
                <Skeleton className={cn("h-4", SKELETON_WIDTHS[(i + 2) % 6])} />
                <Skeleton className="mt-1.5 h-3 w-28" />
              </TableCell>
              <TableCell className={TD}><Skeleton className="ml-auto h-4 w-14" /></TableCell>
              <TableCell className={TD}><Skeleton className="ml-auto h-4 w-16" /></TableCell>
              <TableCell className={TD}><Skeleton className="ml-auto h-4 w-20" /></TableCell>
              <TableCell className={cn(TD, "p-1")}><Skeleton className="size-7" /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// Pantalla completa de Items mientras llega todo: la estructura se ve ya, vacía.
export function ItemsSkeleton() {
  return (
    <div role="status" aria-label="Cargando items">
      {/* Pestañas de las listas, con su contador. */}
      <div className="relative flex h-12 items-end gap-1 bg-layer-2 px-4 pt-1.5">
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-px bg-border" />
        <Skeleton className="mr-2 mb-3 size-5" />
        {[36, 28, 32].map((w, i) => (
          <div key={i} className={cn("flex h-full items-center gap-2 rounded-t-lg px-4", i === 0 ? "z-10 bg-background" : "mb-px bg-foreground/[0.05]")}>
            <Skeleton className="h-4" style={{ width: `${w * 3}px` }} />
            <Skeleton className="h-5 w-6 rounded-sm" />
          </div>
        ))}
      </div>
      {/* Datos del activo: ícono, etiqueta y valor en una línea, en dos filas. */}
      <div className="grid auto-cols-max grid-flow-col grid-rows-2 gap-x-8 gap-y-2 overflow-hidden border-b px-6 py-4">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-2">
            <Skeleton className="size-4" />
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-4 w-28" />
          </div>
        ))}
      </div>
      {/* Banda de agregar línea. */}
      <div className="border-b bg-surface-strong px-6 py-4">
        <div className="grid gap-4 md:grid-cols-[9rem_1fr_6.5rem_9rem_9rem_auto]">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex flex-col gap-2">
              <Skeleton className="h-3 w-16 bg-foreground/10" />
              <Skeleton className="h-10 rounded-lg bg-foreground/10" />
            </div>
          ))}
          <div className="flex flex-col gap-2">
            <Skeleton className="h-3 w-16 bg-transparent" />
            <Skeleton className="h-10 w-28 rounded-full bg-foreground/10" />
          </div>
        </div>
      </div>
      <div className="flex h-12 items-center gap-3 border-b px-6">
        <HugeiconsIcon icon={Search01Icon} aria-hidden className="size-5 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Buscar por número de parte o descripción</span>
      </div>
      <LinesTableSkeleton />
    </div>
  );
}
