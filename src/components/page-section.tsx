import { cn } from "@/lib/utils";

// Fila de etiqueta de una sección: "CONTRATOS / LISTADO" a la izquierda y un dato a la derecha.
export function SectionBar({
  label,
  meta,
  index,
}: {
  label?: string;
  meta?: React.ReactNode;
  index?: string;
}) {
  return (
    <div className="flex h-11 items-center justify-between gap-4 border-b px-6 caps-md font-bold">
      <span className="flex min-w-0 items-center gap-3 truncate text-foreground">
        {index && (
          <span className="bg-primary px-1.5 py-0.5 text-primary-foreground">{index}</span>
        )}
        {label}
      </span>
      {meta && <span className="shrink-0 text-muted-foreground">{meta}</span>}
    </div>
  );
}

// Una celda de la página: barra de etiqueta + cuerpo, separadas por líneas de 1 px.
export function PageSection({
  label,
  meta,
  index,
  className,
  children,
}: {
  label?: string;
  meta?: React.ReactNode;
  index?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  // La barra solo aparece si aporta algo; el módulo ya lo nombra el header y
  // la pantalla ya la nombra el panel, así que no se repiten aquí.
  const showBar = Boolean(label || meta || index);
  return (
    <section className="border-b last:border-b-0">
      {showBar && <SectionBar label={label} meta={meta} index={index} />}
      {children !== undefined && <div className={cn("p-6", className)}>{children}</div>}
    </section>
  );
}

// Cuadrícula de celdas: las líneas salen del `gap-px` sobre el fondo del borde.
export function CellGrid({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("grid gap-px border bg-border [&>*]:bg-background [&>*]:p-4", className)}>
      {children}
    </div>
  );
}

// Clases de las tablas: una sola definición para todas las pantallas.
export const TABLE_TH = "h-10 px-4 text-left align-middle text-xs font-medium whitespace-nowrap text-muted-foreground";
export const TABLE_TD = "px-4 py-3 align-middle";
