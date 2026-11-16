import { TABLE_TD, TABLE_TH } from "@/components/page-section";
import { cn } from "@/lib/utils";

// Encabezado de esta lista: negrita y texto pleno, no gris.
export const TH = TABLE_TH;

// Prefijo del id de una línea que aún no confirmó el servidor.
export const TEMP_PREFIX = "tmp-";

export const TD = cn(TABLE_TD, "py-1.5");

export type LineView = {
  id: string;
  listId: string;
  // Posición en la lista (1.º, 2.º…) y, si está repetida, a qué línea se parece.
  n: number;
  dupOf?: number;
  partNumber: string;
  // Segundo código de la línea (código interno de la empresa); se muestra como chip.
  internalCode: string;
  description: string;
  quantity: number;
  unit: string;
  // Precio referencial TOTAL de la línea (sin IVA), en centavos. El valor unitario es este total ÷ la cantidad.
  referencePriceCents: number | null;
};

export type OptimisticAction =
  | { type: "add"; line: LineView }
  | { type: "update"; line: LineView }
  | { type: "remove"; id: string };
