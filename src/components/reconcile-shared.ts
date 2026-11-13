import type { InvoiceLine } from "@/lib/reconcile-actions";

// Cubierta: ya no queda nada de esta línea de factura por asignar (ni llegado ni por llegar).
export const covered = (l: InvoiceLine) => l.free <= 0;
// Para comparar números de parte sin importar mayúsculas, espacios ni guiones.
export const normCode = (v: string) => v.toUpperCase().replace(/[\s\-_.]+/g, "");
export const codesOf = (r: { sku: string | null; partNumbers: string[] }) => [r.sku, ...r.partNumbers].filter(Boolean).join(" · ");

// Destino de lo elegido: una línea existente, o (proceso a crédito, sin línea abierta) `addToListId`: se crea la línea
// en esa lista con el producto y se le asigna.
export type Target = { id: string; open: number; description?: string; addToListId?: string };
