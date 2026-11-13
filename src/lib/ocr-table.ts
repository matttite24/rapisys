// Convierte el resultado del OCR de una tabla (ITEM, PART. NUM, DESCRIPCIÓN, CANTID., CPC)
// en filas para revisar. El OCR no es fiable al 100 %: toda fila sale a revisión humana.

export type OcrWord = { text: string; confidence: number; x0: number; y0: number; x1: number; y1: number };
// y0/y1: altura del renglón en la imagen (la usa la segunda pasada que lee las cantidades).
// x0: borde izquierdo del CPC del renglón, si se conoce.
export type OcrLine = { text: string; confidence: number; y0?: number; y1?: number; x0?: number };

export type ParsedRow = {
  part: string;
  description: string;
  quantity: string;
  cpc: string;
  // Precio total de la fila (P. TOTAL), si la tabla lo trae. Vacío si no.
  price: string;
  // Fila de ancho completo que separa listas (ej. nombre del equipo), si la tabla la trae.
  group?: string;
  // Texto tal como lo leyó el OCR, para compararlo al revisar.
  raw: string;
  // Altura del renglón en la imagen, si se conoce.
  y0?: number;
  y1?: number;
  x0?: number; // borde izquierdo del CPC
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
    const cpc = inOrder.find((w) => /^\d{6,12}$/.test(w.text));
    return {
      text: inOrder.map((w) => w.text).join(" "),
      confidence: inOrder.reduce((s, w) => s + w.confidence, 0) / inOrder.length,
      // La altura sale del CPC si lo hay: los símbolos sueltos estiran el recuadro del renglón.
      y0: cpc ? cpc.y0 : Math.min(...inOrder.map((w) => w.y0)),
      y1: cpc ? cpc.y1 : Math.max(...inOrder.map((w) => w.y1)),
      x0: cpc?.x0,
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
// ITEM  DESCRIPCIÓN  N° DE PARTE  CANTIDAD  importes (P.UNIT ... P. TOTAL).
const PART = "[A-Z0-9]+-[A-Z0-9]+";
const PRICED_HEAD = new RegExp(`^(\\d{1,3})\\s+(.+?)\\s+(${PART})\\s+(\\d+)$`, "i");
const PRICED_HEAD_NO_ITEM = new RegExp(`^(.+?)\\s+(${PART})\\s+(\\d+)$`, "i");
// Uno o más importes pegados al final; el símbolo ($) es opcional o puede venir como S/§.
const TAIL_AMOUNTS = /(?:\s+[$S§]?\s?\d+(?:[.,]\d{3})*[.,]\d{2})+$/;
const HEADER = /descrip|cantid|part\.?\s*num|n°\s*de\s*parte|proforma|presupuesto|p\.?\s*unit|p\.?\s*total/i;
const SECTION = /^[A-ZÁÉÍÑÓÚÜ][A-ZÁÉÍÑÓÚÜ0-9 .\-/()]{5,}$/;
const LOW_CONFIDENCE = 80;

export function parseTable(lines: OcrLine[]): { rows: ParsedRow[]; skipped: number } {
  const rows: ParsedRow[] = [];
  let skipped = 0;
  let group: string | undefined;
  const push = (row: ParsedRow, line: OcrLine) => rows.push({ ...row, group, y0: line.y0, y1: line.y1, x0: line.x0 });

  for (const line of lines) {
    const text = line.text.replace(CLEAN, " ").replace(/\s+/g, " ").trim();
    if (!text || HEADER.test(text)) {
      if (text) skipped++;
      continue;
    }
    // Fila de ancho completo: solo texto en mayúsculas, sin importes ni número de ítem al inicio.
    if (SECTION.test(text) && !/\$/.test(text)) {
      group = text;
      continue;
    }
    const low = line.confidence < LOW_CONFIDENCE;

    // Con importes al final: se separan primero (el $ puede venir mal leído o con espacios) y
    // lo que queda es ITEM DESCRIPCIÓN PARTE CANTIDAD. El P. TOTAL es el último importe.
    const tail = TAIL_AMOUNTS.exec(text);
    if (tail) {
      const head = text.slice(0, tail.index).trim();
      const amounts = tail[0].match(/\d{1,3}(?:[.,]\d{3})*[.,]\d{2}|\d+[.,]\d{2}/g)!;
      const last = amounts[amounts.length - 1];
      const price = last.slice(0, -3).replace(/[.,]/g, "") + "." + last.slice(-2);
      const withItem = PRICED_HEAD.exec(head);
      if (withItem) {
        push({ part: withItem[3], description: withItem[2], quantity: withItem[4], cpc: "", price, raw: text, review: low }, line);
        continue;
      }
      const noItem = PRICED_HEAD_NO_ITEM.exec(head);
      if (noItem) {
        push({ part: noItem[2], description: noItem[1], quantity: noItem[3], cpc: "", price, raw: text, review: true }, line);
        continue;
      }
    }
    let m: RegExpExecArray | null;
    m = FULL.exec(text);
    if (m) {
      push({ part: m[2], description: m[3], quantity: m[4].replace(",", "."), cpc: m[5], price: "", raw: text, review: low }, line);
      continue;
    }
    m = NO_CPC.exec(text);
    if (m) {
      push({ part: m[2], description: m[3], quantity: m[4].replace(",", "."), cpc: "", price: "", raw: text, review: true }, line);
      continue;
    }
    m = NO_ITEM.exec(text);
    if (m) {
      push({ part: m[1], description: m[2], quantity: m[3].replace(",", "."), cpc: m[4], price: "", raw: text, review: true }, line);
      continue;
    }
    m = NO_QTY.exec(text);
    if (m) {
      push({ part: m[1], description: m[2], quantity: "", cpc: m[3], price: "", raw: text, review: true }, line);
      continue;
    }
    // Parece una fila de la tabla (empieza con su número) pero no calzó: se deja para corregir a mano.
    const lead = /^(\d{1,3})\s+(.+)$/.exec(text);
    if (lead) {
      push({ part: "", description: lead[2], quantity: "1", cpc: "", price: "", raw: text, review: true }, line);
      continue;
    }
    skipped++;
  }
  return { rows, skipped };
}
