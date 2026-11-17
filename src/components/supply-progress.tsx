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

// Avance en una sola línea, junto a la etiqueta del estado: mini barra y «cubierto/pedido». El detalle (por llegar,
// entregadas) va en el título y en el panel.
export function MiniProgress({ stock, purchased = 0, delivered = 0, total, className }: { stock: number; purchased?: number; delivered?: number; total: number; className?: string }) {
  const pct = (n: number) => (total > 0 ? Math.min(100, (n / total) * 100) : 0);
  const covered = stock + purchased;
  const detail = [
    `${covered} de ${total} cubiertas`,
    purchased > 0 && `${purchased} por llegar`,
    delivered > 0 && `${delivered} ${delivered === 1 ? "entregada" : "entregadas"}`,
  ].filter(Boolean).join(" · ");
  return (
    <span className={cn("inline-flex items-center gap-2", className)} title={detail}>
      <span className="flex h-1 min-w-10 flex-1 overflow-hidden rounded-full bg-foreground/10" aria-hidden>
        <span className="bg-state-delivered" style={{ width: `${pct(delivered)}%` }} />
        <span className="bg-state-stock" style={{ width: `${pct(Math.max(0, stock - delivered))}%` }} />
        <span className="bg-state-arriving" style={{ width: `${pct(purchased)}%` }} />
      </span>
      <span className="num min-w-9 text-right text-xs text-muted-foreground">
        <span className="sr-only">{detail}</span>
        <span aria-hidden>{covered}/{total}</span>
      </span>
    </span>
  );
}

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
      <div className="flex h-1.5 w-24 overflow-hidden bg-foreground/10" aria-hidden>
        <div className="bg-state-delivered transition-[width] duration-500 ease-out" style={{ width: `${pct(delivered)}%` }} />
        <div className="bg-state-stock transition-[width] duration-500 ease-out" style={{ width: `${pct(Math.max(0, stock - delivered))}%` }} />
        <div className="bg-state-arriving transition-[width] duration-500 ease-out" style={{ width: `${pct(purchased)}%` }} />
      </div>
      <span className="num whitespace-nowrap text-xs text-muted-foreground">
        {covered} de {total}
        {purchased > 0 && ` · ${purchased} por llegar`}
        {delivered > 0 && ` · ${delivered} ${delivered === 1 ? "entregada" : "entregadas"}`}
      </span>
    </div>
  );
}
