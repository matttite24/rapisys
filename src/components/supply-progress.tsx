import type { Tone } from "@/lib/state-tone";
import { cn } from "@/lib/utils";

export type SupplyState = "pending" | "quoted" | "partial" | "purchased" | "in_stock" | "delivered";

// Etiqueta y punto de color de cada estado. El color nunca va solo: siempre lo acompaña el texto.
export const STATE: Record<SupplyState, { label: string; dot: string; tone: Tone }> = {
  pending: { label: "Pendiente", dot: "bg-state-pending", tone: "pending" },
  quoted: { label: "Cotizando", dot: "bg-state-quoted", tone: "quoted" },
  partial: { label: "Parcial", dot: "bg-state-running", tone: "running" },
  purchased: { label: "Por llegar", dot: "bg-state-arriving", tone: "arriving" },
  in_stock: { label: "En bodega", dot: "bg-state-stock", tone: "stock" },
  delivered: { label: "Entregado", dot: "bg-state-delivered", tone: "delivered" },
};

// Barra de avance: lo cubierto sobre lo pedido. Entregado (oscuro), asignado de la bodega (verde) y reservado por llegar (azul).
export function Progress({
  stock,
  purchased = 0,
  delivered = 0,
  total,
  className,
}: {
  stock: number;
  purchased?: number;
  delivered?: number;
  total: number;
  className?: string;
}) {
  const pct = (n: number) => (total > 0 ? Math.min(100, (n / total) * 100) : 0);
  const covered = stock + purchased;
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="flex h-2 w-28 overflow-hidden bg-foreground/10" aria-hidden>
        <div className="bg-state-delivered transition-[width] duration-500 ease-out" style={{ width: `${pct(delivered)}%` }} />
        <div className="bg-state-stock transition-[width] duration-500 ease-out" style={{ width: `${pct(Math.max(0, stock - delivered))}%` }} />
        <div className="bg-state-arriving transition-[width] duration-500 ease-out" style={{ width: `${pct(purchased)}%` }} />
      </div>
      <span className="num whitespace-nowrap text-xs text-muted-foreground">
        {covered} de {total}
        {purchased > 0 && ` · ${purchased} por llegar`}
        {delivered > 0 && ` · ${delivered} entregadas`}
      </span>
    </div>
  );
}
