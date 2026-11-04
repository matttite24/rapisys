import { cn } from "@/lib/utils";

export type SupplyState = "pending" | "partial" | "in_stock";

// Etiqueta y punto de color de cada estado. El color nunca va solo: siempre lo acompaña el texto.
export const STATE: Record<SupplyState, { label: string; dot: string }> = {
  pending: { label: "Pendiente", dot: "bg-muted-foreground" },
  partial: { label: "En stock parcial", dot: "bg-amber-500" },
  in_stock: { label: "En stock completo", dot: "bg-emerald-600" },
};

// Barra de avance: lo cubierto sobre lo pedido.
export function Progress({ done, total, className }: { done: number; total: number; className?: string }) {
  const pct = total > 0 ? Math.min(100, (done / total) * 100) : 0;
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="flex h-2 w-24 overflow-hidden bg-muted" aria-hidden>
        <div className="bg-emerald-600" style={{ width: `${pct}%` }} />
      </div>
      <span className="num whitespace-nowrap text-xs text-muted-foreground">
        {done} de {total}
      </span>
    </div>
  );
}
