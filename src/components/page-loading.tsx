import { Skeleton } from "@/components/ui/skeleton";

// Estructura mientras llega cualquier pantalla del módulo: la navegación responde al instante y los
// datos entran después. Las pantallas con su propio loading.tsx (Items, Abastecimiento) lo reemplazan.
export function PageLoading() {
  return (
    <div role="status" aria-label="Cargando">
      <div className="flex h-12 items-center gap-3 border-b px-6">
        <Skeleton className="size-5" />
        <Skeleton className="h-4 w-56" />
      </div>
      <div className="flex flex-col divide-y border-b">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-6 px-6 py-4">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="ml-auto h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
