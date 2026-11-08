import { lineAmounts, parseCents, parseDecimal } from "@/lib/money";
import { type ItemOption, type XmlInfo } from "@/lib/purchase-actions";
import type { SriInvoice } from "@/lib/sri-xml";

export type Row = {
  key: string;
  item: ItemOption | null;
  quantity: string;
  cost: string; // costo unitario s/IVA, canónico ("12.50")
  vat: string;
  // Solo en líneas leídas del XML: subtotal exacto de la factura (manda sobre cantidad x costo) y lo que dice el XML.
  total?: number;
  xml?: { code: string; description: string; how?: "code" | "description" | null };
  // Código y nombre de la línea: si no hay producto y se marca "Crear", pasan a ser el número de parte y el nombre
  // del producto nuevo (se crea al completar la factura). Vienen del XML y se pueden editar.
  code: string;
  name: string;
  create: boolean;
  verified: boolean; // la persona confirmó el producto emparejado
};

// Borrador guardado que se retoma: la factura y sus líneas tal como se guardaron.
export type DraftData = {
  id: string;
  supplierId: string;
  number: string;
  date: string;
  notes: string;
  xmlInfo: XmlInfo | null;
  rows: {
    item: ItemOption | null;
    quantity: string;
    cost: string;
    vat: string;
    total?: number;
    xml?: { code: string; description: string };
    code: string;
    name: string;
    create: boolean;
    verified: boolean;
  }[];
};

// Resultado de la última lectura de un XML, para la barra de revisión.
export type XmlReview = { invoice: SriInvoice; fileName: string; supplierFound: boolean };

export const rowSubtotal = (r: Row): number | null => {
  if (r.total !== undefined) return r.total;
  const qty = parseDecimal(r.quantity);
  const cost = parseCents(r.cost);
  return qty === null || !cost.ok ? null : lineAmounts(qty, cost.cents, 0).subtotal;
};

// Columnas de cada línea de la factura; el encabezado y las filas comparten la misma rejilla.
export const ROW_GRID = "grid items-center gap-2 max-sm:grid-cols-2 sm:max-lg:grid-cols-7 lg:grid-cols-[1.5rem_11rem_minmax(0,1fr)_4rem_6rem_3.5rem_6.5rem_10.5rem_2rem]";

// Clave única por fila (no un contador del módulo: con la recarga en caliente el contador vuelve a 0 y repite claves).
// IVA que se puede elegir en cada línea de la factura.
export const IVA_OPTIONS = ["15", "5", "0"];
export const blank = (): Row => ({ key: crypto.randomUUID(), item: null, quantity: "1", cost: "", vat: "15", code: "", name: "", create: false, verified: false });
