// Columnas del reporte de cobro en Excel, en su orden. Sin dependencias: lo usan el modal del navegador y el generador.
export const BILLING_COLUMNS = [
  { key: "n", title: "N.º", width: 6, right: false },
  // Solo en el consolidado: a qué entrega pertenece cada línea.
  { key: "delivery", title: "Entrega", width: 12, right: false, consolidatedOnly: true },
  { key: "date", title: "Fecha de entrega", width: 14, right: false },
  { key: "part", title: "N.º de parte", width: 20, right: false },
  { key: "desc", title: "Descripción", width: 48, right: false },
  { key: "asset", title: "Activo", width: 34, right: false },
  { key: "qty", title: "Cantidad", width: 11, right: true },
  { key: "unit", title: "Unidad", width: 11, right: true },
  { key: "cost", title: "Costo total (c/IVA)", width: 16, right: true },
  { key: "margin", title: "Margen aplicado", width: 14, right: true },
  { key: "final", title: "Valor final", width: 16, right: true },
  { key: "profit", title: "Utilidad generada", width: 16, right: true },
] as const satisfies readonly { key: string; title: string; width: number; right: boolean; consolidatedOnly?: boolean }[];

export type BillingColumnKey = (typeof BILLING_COLUMNS)[number]["key"];
type Col = { key: BillingColumnKey; title: string; width: number; right: boolean; consolidatedOnly?: boolean };
// Columnas disponibles: las del reporte de una entrega, o (consolidado) también «Entrega».
export const columnsFor = (consolidated: boolean): Col[] => (BILLING_COLUMNS as readonly Col[]).filter((c) => consolidated || !c.consolidatedOnly);
export const ALL_BILLING_COLUMNS: BillingColumnKey[] = columnsFor(false).map((c) => c.key);
export const ALL_CONSOLIDATED_COLUMNS: BillingColumnKey[] = columnsFor(true).map((c) => c.key);

// Lee ?cols=a,b,c: solo claves válidas, en el orden del reporte; sin nada válido, todas.
export function parseBillingColumns(raw: string | null | undefined, consolidated = false): BillingColumnKey[] {
  const all = consolidated ? ALL_CONSOLIDATED_COLUMNS : ALL_BILLING_COLUMNS;
  const wanted = new Set((raw ?? "").split(",").map((x) => x.trim()));
  const picked = all.filter((k) => wanted.has(k));
  return picked.length ? picked : all;
}
