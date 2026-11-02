import { cn } from "@/lib/utils";

// Altura común de las celdas de la fila superior (ícono, organización, sección).
export const CELL_ROW = "flex h-14 shrink-0 items-center border-b";

// Encabezado de una celda: título a la izquierda y acción (ícono) a la derecha.
export function CellHeader({
  title,
  leading,
  action,
  className,
}: {
  title: React.ReactNode;
  leading?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn(CELL_ROW, "gap-2 px-4", className)}>
      {leading}
      <span className="min-w-0 flex-1 truncate font-mono text-sm font-medium uppercase tracking-[0.12em]">{title}</span>
      {action}
    </header>
  );
}
