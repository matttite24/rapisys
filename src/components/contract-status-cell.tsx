import { StatusChip } from "@/components/status-chip";

// Celda superior de la columna de opciones dentro de un proceso: estado y fecha de entrega. Neutra; el color lo lleva solo el badge.
export function ContractStatusCell({ status, delivery, kind, deliveries }: { status: string; delivery: string; kind?: string; deliveries?: number }) {
  return (
    <div className="flex size-full min-w-0 flex-col justify-center gap-1 px-4">
      <StatusChip status={status} kind={kind} deliveries={deliveries} className="self-start" />
      {kind === "credit" ? <span className="truncate text-xs text-muted-foreground">Proceso a crédito</span> : <span className="truncate text-xs text-muted-foreground">Entrega {delivery}</span>}
    </div>
  );
}
