// Convierte el resultado del OCR de una tabla (ITEM, PART. NUM, DESCRIPCIÓN, CANTID., CPC)
// en filas para revisar. El OCR no es fiable al 100 %: toda fila sale a revisión humana.

export type OcrWord = { text: string; confidence: number; x0: number; y0: number; x1: number; y1: number };
// y0/y1: altura del renglón en la imagen (la usa la segunda pasada que lee las cantidades).
export type OcrLine = { text: string; confidence: number; y0?: number; y1?: number };

export type ParsedRow = {
  part: string;
  description: string;
  quantity: string;
  cpc: string;
  // Texto tal como lo leyó el OCR, para compararlo al revisar.
  raw: string;
  // Altura del renglón en la imagen, si se conoce.
  y0?: number;
  y1?: number;
  // La fila necesita ojo humano: poca confianza o no calzó con el formato.
  review: boolean;
};

// Agrupa palabras en renglones por su posición vertical (más robusto que las líneas del OCR
// cuando la tabla tiene bordes y celdas).
export function groupWords(words: OcrWord[]): OcrLine[] {
  const ws = words.filter((w) => w.text.trim());
  if (!ws.length) return [];
  const heights = ws.map((w) => w.y1 - w.y0).sort((a, b) => a - b);
  const tolerance = Math.max(4, heights[Math.floor(heights.length / 2)] * 0.6);

  const sorted = [...ws].sort((a, b) => a.y0 + a.y1 - (b.y0 + b.y1));
  const rows: { yc: number; words: OcrWord[] }[] = [];
  for (const w of sorted) {
    const yc = (w.y0 + w.y1) / 2;
    const row = rows[rows.length - 1];
    if (row && Math.abs(yc - row.yc) <= tolerance) {
      row.words.push(w);
      row.yc = row.words.reduce((s, x) => s + (x.y0 + x.y1) / 2, 0) / row.words.length;
    } else {
      rows.push({ yc, words: [w] });
    }
  }

  return rows.map((r) => {
    const inOrder = r.words.sort((a, b) => a.x0 - b.x0);
    return {
      text: inOrder.map((w) => w.text).join(" "),
      confidence: inOrder.reduce((s, w) => s + w.confidence, 0) / inOrder.length,
      y0: Math.min(...inOrder.map((w) => w.y0)),
      y1: Math.max(...inOrder.map((w) => w.y1)),
    };
  });
}

const CLEAN = /[|¦\[\]{}_=~—–«»]/g;
// ITEM  PART.NUM  DESCRIPCIÓN  CANTIDAD  CPC
const FULL = /^(\d{1,3})\s+(\S*\d\S*)\s+(.+?)\s+(\d+(?:[.,]\d{1,2})?)\s+(\d{6,12})$/;
// Sin la columna ITEM (el OCR a veces la pierde)
const NO_ITEM = /^(\S*\d\S*)\s+(.+?)\s+(\d+(?:[.,]\d{1,2})?)\s+(\d{6,12})$/;
// Sin CPC
const NO_CPC = /^(\d{1,3})\s+(\S*\d\S*)\s+(.+?)\s+(\d+(?:[.,]\d{1,2})?)$/;
// Sin cantidad (el OCR a veces pierde los números sueltos): la cantidad queda vacía, a completar.
const NO_QTY = /^(?:\d{1,3}\s+)?(\S*\d\S*)\s+(.+?)\s+(\d{6,12})$/;
const HEADER = /descrip|cantid|part\.?\s*num/i;
const LOW_CONFIDENCE = 80;

export function parseTable(lines: OcrLine[]): { rows: ParsedRow[]; skipped: number } {
  const rows: ParsedRow[] = [];
  let skipped = 0;
  const push = (row: ParsedRow, line: OcrLine) => rows.push({ ...row, y0: line.y0, y1: line.y1 });

  for (const line of lines) {
    const text = line.text.replace(CLEAN, " ").replace(/\s+/g, " ").trim();
    if (!text || HEADER.test(text)) {
      if (text) skipped++;
      continue;
    }
    const low = line.confidence < LOW_CONFIDENCE;

    let m = FULL.exec(text);
    if (m) {
      push({ part: m[2], description: m[3], quantity: m[4].replace(",", "."), cpc: m[5], raw: text, review: low }, line);
      continue;
    }
    m = NO_CPC.exec(text);
    if (m) {
      push({ part: m[2], description: m[3], quantity: m[4].replace(",", "."), cpc: "", raw: text, review: true }, line);
      continue;
    }
    m = NO_ITEM.exec(text);
    if (m) {
      push({ part: m[1], description: m[2], quantity: m[3].replace(",", "."), cpc: m[4], raw: text, review: true }, line);
      continue;
    }
    m = NO_QTY.exec(text);
    if (m) {
      push({ part: m[1], description: m[2], quantity: "", cpc: m[3], raw: text, review: true }, line);
      continue;
    }
    // Parece una fila de la tabla (empieza con su número) pero no calzó: se deja para corregir a mano.
    const lead = /^(\d{1,3})\s+(.+)$/.exec(text);
    if (lead) {
      push({ part: "", description: lead[2], quantity: "1", cpc: "", raw: text, review: true }, line);
      continue;
    }
    skipped++;
  }
  return { rows, skipped };
}
