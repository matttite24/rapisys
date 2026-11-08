import type { InvoiceLine } from "@/lib/reconcile-actions";

// Cubierta: ya no queda nada de esta línea de factura por asignar (ni llegado ni por llegar).
export const covered = (l: InvoiceLine) => l.free <= 0;
// Para comparar números de parte sin importar mayúsculas, espacios ni guiones.
export const normCode = (v: string) => v.toUpperCase().replace(/[\s\-_.]+/g, "");
export const codesOf = (r: { sku: string | null; partNumbers: string[] }) => [r.sku, ...r.partNumbers].filter(Boolean).join(" · ");

export type Target = { id: string; open: number };
