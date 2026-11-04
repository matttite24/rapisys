import { cn } from "@/lib/utils";

export type SupplyState = "pending" | "partial" | "purchased" | "in_stock" | "delivered";

// Etiqueta y punto de color de cada estado. El color nunca va solo: siempre lo acompaña el texto.
export const STATE: Record<SupplyState, { label: string; dot: string; chip: string }> = {
  pending: { label: "Pendiente", dot: "bg-muted-foreground", chip: "bg-foreground/10 text-foreground" },
  partial: { label: "Cobertura parcial", dot: "bg-amber-500", chip: "bg-amber-500/20 text-amber-950 dark:text-amber-100" },
  purchased: { label: "Comprado", dot: "bg-violet-600", chip: "bg-violet-600/15 text-violet-900 dark:text-violet-100" },
  in_stock: { label: "En stock completo", dot: "bg-emerald-600", chip: "bg-emerald-600/15 text-emerald-900 dark:text-emerald-100" },
  delivered: { label: "Entregado", dot: "bg-sky-600", chip: "bg-sky-600/15 text-sky-900 dark:text-sky-100" },
};

// Barra de avance: lo cubierto sobre lo pedido. Entregado (azul), en stock (verde) y comprado por recibir (violeta).
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
        <div className="bg-sky-600 transition-[width] duration-500 ease-out" style={{ width: `${pct(delivered)}%` }} />
        <div className="bg-emerald-600 transition-[width] duration-500 ease-out" style={{ width: `${pct(Math.max(0, stock - delivered))}%` }} />
        <div className="bg-violet-600 transition-[width] duration-500 ease-out" style={{ width: `${pct(purchased)}%` }} />
      </div>
      <span className="num whitespace-nowrap text-xs text-muted-foreground">
        {covered} de {total}
        {purchased > 0 && ` · ${purchased} por recibir`}
        {delivered > 0 && ` · ${delivered} entregadas`}
      </span>
    </div>
  );
}
