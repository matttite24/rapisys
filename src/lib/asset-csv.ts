// Lectura del CSV de activos de bodega (vehículos y maquinaria). Solo lee y valida; guardar es cosa de
// asset-import-actions. Misma lectura que el CSV de items: coma o punto y coma, comillas, encabezados con o sin tildes.
import { splitCsv } from "@/lib/item-csv";
import { ASSET_KIND_LABEL, type AssetKind } from "@/lib/items";

export type AssetColumnKey = "kind" | "name" | "brand" | "model" | "year" | "plate" | "serial" | "engine" | "identifier" | "other";

// En el orden de la plantilla.
export const ASSET_COLUMNS: { key: AssetColumnKey; label: string; required?: boolean }[] = [
  { key: "kind", label: "Tipo", required: true },
  { key: "name", label: "Nombre", required: true },
  { key: "brand", label: "Marca" },
  { key: "model", label: "Modelo" },
  { key: "year", label: "Año" },
  { key: "plate", label: "Placa" },
  { key: "serial", label: "Serie" },
  { key: "engine", label: "Motor" },
  { key: "identifier", label: "Identificación" },
  { key: "other", label: "Otros" },
];

export const ASSET_TEMPLATE =
  ASSET_COLUMNS.map((c) => c.label).join(";") + "\nVehículo liviano;Camioneta de reparto;Toyota;Hilux;2020;ABC-1234;;;;\n";
export const MAX_ASSET_IMPORT_ROWS = 500;

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

const ALIASES: Record<string, AssetColumnKey> = {
  tipo: "kind", nombre: "name", marca: "brand", modelo: "model", ano: "year", anio: "year", placa: "plate",
  serie: "serial", motor: "engine", identificacion: "identifier", otros: "other", otro: "other",
};

const KINDS: Record<string, AssetKind> = {
  "vehiculo liviano": "light_vehicle", liviano: "light_vehicle", light_vehicle: "light_vehicle",
  "vehiculo pesado": "heavy_vehicle", pesado: "heavy_vehicle", heavy_vehicle: "heavy_vehicle",
  maquinaria: "machinery", machinery: "machinery",
};

export type RawAssetRow = Partial<Record<AssetColumnKey, string>>;

// Fila lista para guardar; error = no se importa.
export type AssetImportRow = {
  kind: AssetKind | "";
  name: string; brand: string; model: string; year: string; plate: string; serial: string; engine: string; identifier: string; other: string;
  error?: string;
};

export function readAssetsCsv(raw: string): { present: AssetColumnKey[]; rows: RawAssetRow[]; error?: string } {
  const table = splitCsv(raw);
  if (table.length < 2) return { present: [], rows: [], error: "El archivo no tiene filas para importar." };
  const columns = table[0].map((h) => ALIASES[norm(h)]);
  for (const c of ASSET_COLUMNS) {
    if (c.required && !columns.includes(c.key)) return { present: [], rows: [], error: `Falta la columna «${c.label}» en el encabezado.` };
  }
  if (table.length - 1 > MAX_ASSET_IMPORT_ROWS) return { present: [], rows: [], error: `Máximo ${MAX_ASSET_IMPORT_ROWS} activos por importación.` };
  const present = ASSET_COLUMNS.map((c) => c.key).filter((k) => columns.includes(k));
  const rows = table.slice(1).map((cells) => {
    const row: RawAssetRow = {};
    columns.forEach((key, i) => { if (key && row[key] === undefined) row[key] = (cells[i] ?? "").trim(); });
    return row;
  });
  return { present, rows };
}

// Aplica las columnas elegidas y valida cada fila con las mismas reglas del formulario de un activo.
export function buildAssetRows(raw: RawAssetRow[], selected: ReadonlySet<AssetColumnKey>): AssetImportRow[] {
  const get = (r: RawAssetRow, k: AssetColumnKey) => (selected.has(k) || ASSET_COLUMNS.find((c) => c.key === k)?.required ? (r[k] ?? "") : "");
  const seenPlate = new Set<string>();
  return raw.map((r) => {
    const kindText = get(r, "kind");
    const row: AssetImportRow = {
      kind: KINDS[norm(kindText)] ?? "",
      name: get(r, "name"), brand: get(r, "brand"), model: get(r, "model"), year: get(r, "year"),
      plate: get(r, "plate").toUpperCase(), serial: get(r, "serial"), engine: get(r, "engine"),
      identifier: get(r, "identifier"), other: get(r, "other"),
    };
    const year = row.year ? Number(row.year) : null;
    if (!row.kind) row.error = kindText ? `Tipo no reconocido: «${kindText}». Usa ${Object.values(ASSET_KIND_LABEL).join(", ")}.` : "Falta el tipo.";
    else if (!row.name) row.error = "Falta el nombre.";
    else if (year !== null && (!Number.isInteger(year) || year < 1950 || year > 2100)) row.error = "El año debe estar entre 1950 y 2100.";
    else if (row.serial.length > 100 || row.engine.length > 100 || row.identifier.length > 100) row.error = "Serie, motor o identificación pasan de 100 caracteres.";
    else if (row.other.length > 200) row.error = "«Otros» pasa de 200 caracteres.";
    if (!row.error && row.plate) {
      if (seenPlate.has(row.plate)) row.error = "Placa repetida en el archivo.";
      seenPlate.add(row.plate);
    }
    return row;
  });
}
