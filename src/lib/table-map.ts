// Carga masiva: de una tabla leída (celdas en filas y columnas, venga de Excel, CSV o de una captura) a las
// filas de la lista. La persona elige qué columna leída corresponde a cada campo; aquí solo hay lógica pura.
import type { OcrWord } from "@/lib/ocr-table";
import { UNITS, isUnit } from "@/lib/units";

export type Field = "part" | "description" | "quantity" | "unit" | "price";
export const FIELDS: { key: Field; label: string }[] = [
  { key: "part", label: "N.º de parte" },
  { key: "description", label: "Descripción" },
  { key: "quantity", label: "Cantidad" },
  { key: "unit", label: "Unidad" },
  { key: "price", label: "Precio ref. (total)" },
];

// Cada columna leída va a un campo, o a ninguno (null = no se usa).
export type Mapping = (Field | null)[];
export type Grid = string[][];

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/gi, " ").replace(/\s+/g, " ").trim().toLowerCase();

const ALIASES: [Field, RegExp][] = [
  ["part", /^(part\.?( ?num\.?)?|parte|n parte|nro parte|numero de parte|n de parte|referencia|ref|codigo|cod|sku|part number|pn)$/],
  ["description", /^(descripcion|descripcion del item|detalle|nombre|producto|item descripcion|description)$/],
  ["quantity", /^(cantidad|cantid|cant|cant\.|qty|unidades|cantidad solicitada)$/],
  ["unit", /^(unidad|unidad de medida|u m|um|medida|und|unit)$/],
  ["price", /^(p total|p\.? total|precio total|precio ref|precio referencial|precio|total|valor total|valor|importe|price)$/],
];

// Campo que sugiere el texto de un encabezado, si lo reconoce.
export function fieldFor(header: string): Field | null {
  const h = norm(header);
  return ALIASES.find(([, re]) => re.test(h))?.[0] ?? null;
}

// Sugerencia de mapeo a partir de la primera fila: cada campo se asigna una sola vez.
export function guessMapping(header: string[]): Mapping {
  const used = new Set<Field>();
  return header.map((h) => {
    const f = fieldFor(h);
    if (!f || used.has(f)) return null;
    used.add(f);
    return f;
  });
}

// La primera fila es encabezado si reconoce al menos dos campos distintos.
export function looksLikeHeader(row: string[]): boolean {
  return new Set(row.map(fieldFor).filter(Boolean)).size >= 2;
}

// Iguala el ancho de todas las filas y descarta las que no tienen ni una celda con texto.
export function normalizeGrid(grid: Grid): Grid {
  const rows = grid.map((r) => r.map((c) => c.replace(/\s+/g, " ").trim())).filter((r) => r.some(Boolean));
  const width = Math.max(0, ...rows.map((r) => r.length));
  const used = Array.from({ length: width }, (_, c) => rows.some((r) => (r[c] ?? "") !== ""));
  // Las columnas totalmente vacías no aportan: se quitan.
  return rows.map((r) => Array.from({ length: width }, (_, c) => r[c] ?? "").filter((_, c) => used[c]));
}

// Unidad escrita por la persona → clave de unidad; lo que no se reconoce queda como «Unidad».
export function unitKey(text: string): string {
  const t = norm(text);
  if (!t) return "unit";
  if (isUnit(t)) return t;
  for (const [key, label] of Object.entries(UNITS)) if (norm(label) === t) return key;
  const SHORT: Record<string, string> = { u: "unit", und: "unit", unid: "unit", un: "unit", jgo: "set", juego: "set", lt: "liter", lts: "liter", l: "liter", gl: "gallon", gal: "gallon", m: "meter", mt: "meter", mts: "meter", kg: "kg", kgs: "kg", cj: "box", par: "pair", pares: "pair" };
  return SHORT[t] ?? "unit";
}

// Número escrito a la ecuatoriana o a la inglesa → texto con punto decimal («1.234,50» y «1,234.50» → «1234.50»).
export function cleanNumber(text: string): string {
  const t = text.replace(/[^\d.,-]/g, "");
  if (!t) return "";
  const lastDot = t.lastIndexOf("."), lastComma = t.lastIndexOf(",");
  const decimal = Math.max(lastDot, lastComma);
  if (decimal === -1) return t;
  const digitsAfter = t.length - decimal - 1;
  // «1.234» o «1,234» sin más separadores: miles si hay exactamente 3 dígitos y es el único separador.
  const single = (t.match(/[.,]/g) ?? []).length === 1;
  if (single && digitsAfter === 3) return t.replace(/[.,]/g, "");
  return t.slice(0, decimal).replace(/[.,]/g, "") + "." + t.slice(decimal + 1);
}

export type MappedRow = { part: string; description: string; quantity: string; unit: string; price: string; raw: string; review: boolean };

// El OCR confunde la Z con el 7 y con el 2. Se corrige por contexto, segmento a segmento (los separados por guion, punto o espacio):
//  · un 7 o un 2 entre letras ("AB7CD", "AB2CD") es una Z;
//  · una Z en un segmento que por lo demás es solo números ("23Z4") es un 7.
// Lo dudoso (un 7 al borde de una palabra, "CAT7") se deja como está para que la persona lo revise.
export function fixZ7(code: string): string {
  return code
    .split(/([^A-Za-z0-9]+)/)
    .map((seg) => {
      if (seg.length < 3 || !/^[A-Za-z0-9]+$/.test(seg)) return seg;
      const chars = [...seg];
      return chars
        .map((c, i) => {
          const others = chars.filter((_, j) => j !== i);
          if (c === "7" || c === "2") {
            const interior = i > 0 && i < chars.length - 1 && /[A-Za-z]/.test(chars[i - 1]) && /[A-Za-z]/.test(chars[i + 1]);
            return interior && others.filter((x) => /[A-Za-z]/.test(x)).length >= 2 && !others.some((x) => /\d/.test(x)) ? "Z" : c;
          }
          if (c === "Z" || c === "z") return others.every((x) => /\d/.test(x)) ? "7" : c;
          return c;
        })
        .join("");
    })
    .join("");
}

// Aplica el mapeo a las filas elegidas. `review` marca las que les falta algo esencial.
export function applyMapping(grid: Grid, mapping: Mapping, include: (rowIndex: number) => boolean, opts: { fixCodes?: boolean } = {}): MappedRow[] {
  const out: MappedRow[] = [];
  grid.forEach((cells, i) => {
    if (!include(i)) return;
    const pick = (f: Field) => cells.filter((_, c) => mapping[c] === f).join(" ").trim();
    const quantity = cleanNumber(pick("quantity"));
    const row: MappedRow = {
      part: opts.fixCodes ? fixZ7(pick("part")) : pick("part"),
      description: pick("description"),
      quantity,
      unit: unitKey(pick("unit")),
      price: cleanNumber(pick("price")),
      raw: cells.filter(Boolean).join(" | "),
      review: false,
    };
    row.review = !row.description || !quantity;
    out.push(row);
  });
  return out;
}

// De palabras con posición (OCR) a una tabla. Con las líneas verticales de la tabla, cada palabra va a la celda donde cae;
// sin ellas, las columnas salen de los huecos en blanco que se repiten en todos los renglones.
export function gridFromWords(allWords: OcrWord[], borders: number[]): Grid {
  const words = allWords.filter((w) => w.text.trim());
  if (!words.length) return [];
  const heights = words.map((w) => w.y1 - w.y0).sort((a, b) => a - b);
  const medianH = heights[Math.floor(heights.length / 2)];
  const tolerance = Math.max(4, medianH * 0.6);

  const sorted = [...words].sort((a, b) => a.y0 + a.y1 - (b.y0 + b.y1));
  const lines: { yc: number; words: OcrWord[] }[] = [];
  for (const w of sorted) {
    const yc = (w.y0 + w.y1) / 2;
    const line = lines[lines.length - 1];
    if (line && Math.abs(yc - line.yc) <= tolerance) {
      line.words.push(w);
      line.yc = line.words.reduce((s, x) => s + (x.y0 + x.y1) / 2, 0) / line.words.length;
    } else lines.push({ yc, words: [w] });
  }

  // Límites entre columnas: las líneas de la tabla o, si no hay, los huecos libres en todos los renglones.
  let cuts = borders.length >= 2 ? borders : [];
  if (!cuts.length) {
    const spans = words.map((w) => [w.x0, w.x1] as const).sort((a, b) => a[0] - b[0]);
    const merged: [number, number][] = [];
    for (const [a, b] of spans) {
      const last = merged[merged.length - 1];
      if (last && a - last[1] <= medianH * 1.2) last[1] = Math.max(last[1], b);
      else merged.push([a, b]);
    }
    cuts = merged.slice(1).map(([a], i) => (merged[i][1] + a) / 2);
  }
  const colOf = (w: OcrWord) => {
    const x = (w.x0 + w.x1) / 2;
    return cuts.filter((c) => c < x).length;
  };
  return normalizeGrid(
    lines.map((l) => {
      const cells: string[] = Array.from({ length: cuts.length + 1 }, () => "");
      for (const w of l.words.sort((a, b) => a.x0 - b.x0)) {
        const c = colOf(w);
        cells[c] = cells[c] ? `${cells[c]} ${w.text}` : w.text;
      }
      return cells;
    }),
  );
}
