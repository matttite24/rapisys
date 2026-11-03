import { STATUS_DOT, STATUS_LABEL } from "@/lib/contracts";

// Celda superior de la columna de opciones dentro de un contrato: estado y fecha de entrega.
export function ContractStatusCell({ status, delivery }: { status: string; delivery: string }) {
  return (
    <div className="flex size-full min-w-0 flex-col justify-center gap-0.5 px-4">
      <span className="flex items-center gap-2 font-mono text-xs font-medium uppercase tracking-[0.1em]">
        <span aria-hidden className={`size-2 shrink-0 ${STATUS_DOT[status] ?? "bg-muted-foreground"}`} />
        <span className="truncate">{STATUS_LABEL[status] ?? status}</span>
      </span>
      <span className="truncate font-mono text-[0.6875rem] text-muted-foreground">Entrega {delivery}</span>
    </div>
  );
}
