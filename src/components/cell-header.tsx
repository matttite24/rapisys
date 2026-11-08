import { cn } from "@/lib/utils";

// Altura común de las celdas de la fila superior (ícono, organización, sección).
export const CELL_ROW = "flex h-15 shrink-0 items-center border-b";

// Encabezado de una celda: título a la izquierda y acción (ícono) a la derecha.
export function CellHeader({
  title,
  subtitle,
  leading,
  action,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  leading?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn(CELL_ROW, "gap-2 px-4", className)}>
      {leading}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate caps-md font-medium">{title}</span>
        {subtitle && <span className="truncate text-xs text-muted-foreground">{subtitle}</span>}
      </div>
      {action}
    </header>
  );
}
