import { Skeleton } from "@/components/ui/skeleton";

export function PanelLoading({ label = "Cargando contenido" }: { label?: string }) {
  return (
    <div role="status" aria-label={label} aria-busy="true" className="min-h-0 flex-1 divide-y overflow-hidden">
      {[0, 1, 2, 3].map((row) => (
        <div key={row} className="flex items-start justify-between gap-6 px-4 py-4">
          <div className="flex-1 space-y-2"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-3 w-1/2" /><Skeleton className="h-3 w-1/3" /></div>
          <Skeleton className="h-4 w-12" />
        </div>
      ))}
    </div>
  );
}
