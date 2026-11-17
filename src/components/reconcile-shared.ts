import type { InvoiceLine } from "@/lib/reconcile-actions";

// Cubierta: ya no queda nada de esta línea de factura por asignar (ni llegado ni por llegar).
export const covered = (l: InvoiceLine) => l.free <= 0;
// Para comparar números de parte sin importar mayúsculas, espacios ni guiones.
export const normCode = (v: string) => v.toUpperCase().replace(/[\s\-_.]+/g, "");
export const codesOf = (r: { sku: string | null; partNumbers: string[] }) => [r.sku, ...r.partNumbers].filter(Boolean).join(" · ");

// Destino de lo elegido: una línea existente, o (proceso a crédito, sin línea abierta) `addToListId`: se crea la línea
// en esa lista con el producto y se le asigna.
export type Target = { id: string; open: number; description?: string; addToListId?: string };

const fold = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const compact = (v: string) => fold(v).replace(/[^a-z0-9]+/g, "");

// Búsqueda dentro de las líneas de una factura. El texto se parte en palabras y todas deben aparecer, en cualquier orden;
// no importan mayúsculas, acentos ni signos: «1R-0716» encuentra «1r 0716», y «tension correa» encuentra «Correa tensionadora».
export function lineMatches(l: Pick<InvoiceLine, "name" | "tdrName" | "code" | "sku" | "partNumbers">, query: string): boolean {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const parts = [l.name, l.tdrName, l.code, l.sku, ...l.partNumbers].filter((v): v is string => !!v);
  const text = fold(parts.join(" "));
  const tight = compact(parts.join(" "));
  return words.every((w) => text.includes(w) || (compact(w).length > 0 && tight.includes(compact(w))));
}
