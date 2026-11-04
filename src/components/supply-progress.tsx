import { cn } from "@/lib/utils";

export type SupplyState = "pending" | "partial" | "in_stock" | "delivered";

// Etiqueta y punto de color de cada estado. El color nunca va solo: siempre lo acompaña el texto.
export const STATE: Record<SupplyState, { label: string; dot: string }> = {
  pending: { label: "Pendiente", dot: "bg-muted-foreground" },
  partial: { label: "En stock parcial", dot: "bg-amber-500" },
  in_stock: { label: "En stock completo", dot: "bg-emerald-600" },
  delivered: { label: "Entregado", dot: "bg-sky-600" },
};

// Barra de avance: lo cubierto sobre lo pedido.
export function Progress({
  done,
  total,
  delivered = 0,
  className,
}: {
  done: number;
  total: number;
  delivered?: number;
  className?: string;
}) {
  const pct = total > 0 ? Math.min(100, (done / total) * 100) : 0;
  const sent = total > 0 ? Math.min(100, (delivered / total) * 100) : 0;
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="flex h-2 w-24 overflow-hidden bg-muted" aria-hidden>
        {/* Lo entregado va primero (azul); lo que está en stock y falta entregar, después (verde). */}
        <div className="bg-sky-600" style={{ width: `${sent}%` }} />
        <div className="bg-emerald-600" style={{ width: `${Math.max(0, pct - sent)}%` }} />
      </div>
      <span className="num whitespace-nowrap text-xs text-muted-foreground">
        {done} de {total}
        {delivered > 0 && ` · ${delivered} entregadas`}
      </span>
    </div>
  );
}
