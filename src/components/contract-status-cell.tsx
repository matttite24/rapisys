import { StatusChip } from "@/components/status-chip";

// Celda superior de la columna de opciones dentro de un contrato: estado y fecha de entrega. Neutra; el color lo lleva solo el badge.
export function ContractStatusCell({ status, delivery }: { status: string; delivery: string }) {
  return (
    <div className="flex size-full min-w-0 flex-col justify-center gap-1 px-4">
      <StatusChip status={status} className="self-start" />
      <span className="truncate text-xs text-muted-foreground">Entrega {delivery}</span>
    </div>
  );
}
