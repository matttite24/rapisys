// Lectura del CSV de items de bodega (el formato que exporta el sistema anterior). Solo lee y valida;
// guardar es cosa de item-import-actions. Acepta coma o punto y coma, comillas, y encabezados con o sin
// tildes/mayúsculas. Cada columna se puede elegir al importar; Saldo y los precios se muestran pero no se cargan.

export type ColumnKey =
  | "internalCode" | "sku" | "partRef" | "barcode" | "name" | "description"
  | "balance" | "unit" | "retail" | "cost" | "tdrName";

// En el orden de la plantilla. `importable: false` = se ve en la revisión, pero no se puede cargar.
export const COLUMNS: { key: ColumnKey; label: string; required?: boolean; importable: boolean }[] = [
  { key: "internalCode", label: "Código interno", importable: true } /* va como número de parte 1 */,
  { key: "sku", label: "SKU", importable: true },
  { key: "partRef", label: "Referencia del fabricante", importable: true },
  { key: "barcode", label: "Código de barras", importable: true },
  { key: "name", label: "Nombre", required: true, importable: true },
  { key: "description", label: "Descripción", importable: true },
  { key: "balance", label: "Saldo", importable: false },
  { key: "unit", label: "Unidad de medida", importable: true },
  { key: "retail", label: "Precio al por menor", importable: false },
  { key: "cost", label: "Precio de compra", importable: false },
  { key: "tdrName", label: "NOMBRE TDR", importable: true },
];

export const TEMPLATE = COLUMNS.map((c) => c.label).join(";") + "\n";
export const MAX_IMPORT_ROWS = 500;

// Encabezado normalizado (sin tildes ni mayúsculas) → columna.
const ALIASES: Record<string, ColumnKey> = {
  "codigo interno": "internalCode", sku: "sku",
  "referencia del fabricante": "partRef", referencia: "partRef",
  "codigo de barras": "barcode", nombre: "name", descripcion: "description",
  saldo: "balance", "unidad de medida": "unit", unidad: "unit",
  "precio al por menor": "retail", "precio de compra": "cost",
  "nombre tdr": "tdrName", tdr: "tdrName",
};

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

export type RawRow = Partial<Record<ColumnKey, string>>;

// Fila lista para guardar, solo con las columnas elegidas; error = no se importa.
export type ImportRow = {
  internalCode: string; sku: string; partRef: string; barcode: string; name: string; description: string;
  unit: string; tdrName: string;
  error?: string;
};

// Parte el texto en filas de celdas (comillas dobles, "" como comilla escapada).
export function splitCsv(raw: string): string[][] {
  const text = raw.replace(/^﻿/, "");
  const first = text.split(/\r?\n/, 1)[0] ?? "";
  const delim = (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      rows.push(row); row = [];
    } else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}

// Lee el archivo tal cual: qué columnas trae y sus filas. Sin validar (eso depende de lo que se elija).
export function readItemsCsv(raw: string): { present: ColumnKey[]; rows: RawRow[]; error?: string } {
  const table = splitCsv(raw);
  if (table.length < 2) return { present: [], rows: [], error: "El archivo no tiene filas para importar." };
  const columns = table[0].map((h) => ALIASES[norm(h)]);
  if (!columns.includes("name")) return { present: [], rows: [], error: "Falta la columna «Nombre» en el encabezado." };
  if (table.length - 1 > MAX_IMPORT_ROWS) return { present: [], rows: [], error: `Máximo ${MAX_IMPORT_ROWS} items por importación.` };
  const present = COLUMNS.map((c) => c.key).filter((k) => columns.includes(k));
  const rows = table.slice(1).map((cells) => {
    const row: RawRow = {};
    columns.forEach((key, i) => { if (key && row[key] === undefined) row[key] = (cells[i] ?? "").trim(); });
    return row;
  });
  return { present, rows };
}

// Aplica las columnas elegidas y valida cada fila. Lo no elegido queda vacío, y no genera errores.
export function buildRows(raw: RawRow[], selected: ReadonlySet<ColumnKey>): ImportRow[] {
  const get = (r: RawRow, k: ColumnKey) => (selected.has(k) ? (r[k] ?? "") : "");
  const seenSku = new Set<string>();
  return raw.map((r) => {
    const row: ImportRow = {
      internalCode: get(r, "internalCode"), sku: get(r, "sku"), partRef: get(r, "partRef"), barcode: get(r, "barcode"),
      name: get(r, "name"), description: get(r, "description"), unit: get(r, "unit"), tdrName: get(r, "tdrName"),
    };
    if (!row.name) row.error = "Falta el nombre.";
    else if (row.tdrName.length > 300) row.error = "El nombre TDR pasa de 300 caracteres.";
    else if (row.internalCode.length > 60 || row.sku.length > 60 || row.barcode.length > 60) row.error = "Un código pasa de 60 caracteres.";
    else if (row.unit.length > 30) row.error = "La unidad pasa de 30 caracteres.";
    if (!row.error && row.sku) {
      const key = row.sku.toLowerCase();
      if (seenSku.has(key)) row.error = "SKU repetido en el archivo.";
      seenSku.add(key);
    }
    return row;
  });
}
