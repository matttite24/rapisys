import { CodeChip } from "@/components/code-chip";
import { cn } from "@/lib/utils";

// Celda «Producto» compartida por Listas y Abastecimiento: primero qué es (la descripción), debajo cómo se llama
// (número de parte, código interno y referencia) en una sola línea. `extra` va al final de esa línea.
export function ProductCell({
  description,
  partNumber,
  internalCode,
  reference,
  extra,
}: {
  description: string;
  partNumber: string;
  internalCode: string;
  reference: string;
  extra?: React.ReactNode;
}) {
  return (
    <>
      <span className="block text-sm leading-snug font-medium text-foreground">{description}</span>
      <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span className={cn("font-mono text-[0.8125rem]", partNumber && "text-foreground/65")}>{partNumber || "Sin n.º de parte"}</span>
        {internalCode && <CodeChip code={internalCode} />}
        {reference && <span>· {reference}</span>}
        {extra}
      </span>
    </>
  );
}

// Columna Producto: toma todo el ancho que dejan las demás (las numéricas tienen ancho fijo), con un mínimo legible.
export const PRODUCT_COL = "min-w-64";
