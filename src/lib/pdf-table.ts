// Lectura de tablas desde un PDF con texto, en el navegador: se toma el texto con su posición (sin OCR, así los códigos
// salen exactos) y se arma la tabla con las mismas reglas que las capturas. Un PDF escaneado no tiene texto: ahí hace falta
// una captura (OCR).
import type { OcrWord } from "@/lib/ocr-table";
import { gridFromWords, looksLikeHeader, normalizeGrid, type Grid } from "@/lib/table-map";

export type PdfItem = { text: string; x: number; y: number; width: number; height: number };

const key = (row: string[]) => row.map((c) => c.toLowerCase().replace(/\s+/g, " ").trim()).join("|");

// Límites entre columnas: los huecos verticales que casi ningún renglón cruza. No se exige que estén libres en todos
// (un párrafo o un título que cruza la página no debe borrar las columnas de la tabla).
export function columnCuts(words: OcrWord[]): number[] {
  if (words.length < 4) return [];
  const heights = words.map((w) => w.y1 - w.y0).sort((a, b) => a - b);
  const medianH = heights[Math.floor(heights.length / 2)] || 8;
  const tol = Math.max(3, medianH * 0.6);
  const sorted = [...words].sort((a, b) => a.y0 + a.y1 - (b.y0 + b.y1));
  const lines: OcrWord[][] = [];
  let lastY = -Infinity;
  for (const w of sorted) {
    const yc = (w.y0 + w.y1) / 2;
    if (lines.length && Math.abs(yc - lastY) <= tol) lines[lines.length - 1].push(w);
    else lines.push([w]);
    lastY = yc;
  }
  const minX = Math.floor(Math.min(...words.map((w) => w.x0)));
  const maxX = Math.ceil(Math.max(...words.map((w) => w.x1)));
  const cover = new Array<number>(maxX - minX + 1).fill(0);
  for (const l of lines) {
    const seen = new Set<number>();
    for (const w of l) for (let x = Math.floor(w.x0); x <= Math.ceil(w.x1); x++) seen.add(x - minX);
    for (const x of seen) cover[x]++;
  }
  const free = Math.max(1, Math.floor(lines.length * 0.06));
  const minGap = Math.max(4, medianH * 0.7);
  const cuts: number[] = [];
  let start = -1;
  for (let x = 0; x <= cover.length; x++) {
    const isFree = x < cover.length && cover[x] <= free;
    if (isFree && start < 0) start = x;
    if (!isFree && start >= 0) {
      // Solo huecos entre texto: no el margen izquierdo ni el derecho.
      if (start > 0 && x < cover.length && x - start >= minGap) cuts.push(minX + (start + x) / 2);
      start = -1;
    }
  }
  return cuts;
}

// Textos de varias páginas → tabla. `y` crece hacia arriba en un PDF; se invierte y se apilan las páginas una bajo otra.
// Los encabezados que se repiten en cada página se quitan.
export function gridFromPdfItems(pages: { height: number; items: PdfItem[] }[]): Grid {
  const words: OcrWord[] = [];
  let offset = 0;
  for (const page of pages) {
    for (const it of page.items) {
      if (!it.text.trim()) continue;
      const h = it.height || 8;
      const top = offset + page.height - it.y - h;
      words.push({ text: it.text.trim(), x0: it.x, x1: it.x + it.width, y0: top, y1: top + h } as OcrWord);
    }
    offset += page.height + 40;
  }
  const grid = gridFromWords(words, columnCuts(words));
  if (grid.length < 2) return grid;
  // Los encabezados repetidos en cada página se quitan (se conserva el primero).
  const seen = new Set<string>();
  const body = grid.filter((row) => {
    if (!looksLikeHeader(row)) return true;
    const k = key(row);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return normalizeGrid(body);
}

// "1-3, 8, 10-12" → [1, 2, 3, 8, 10, 11, 12], sin repetidos y dentro de 1..max. Null si el texto no es un rango válido.
export function parsePageRange(text: string, max: number): number[] | null {
  const out = new Set<number>();
  for (const part of text.split(",").map((x) => x.trim()).filter(Boolean)) {
    const m = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(part);
    if (!m) return null;
    const from = Number(m[1]);
    const to = m[2] ? Number(m[2]) : from;
    if (from < 1 || to < from || to > max) return null;
    for (let n = from; n <= to; n++) out.add(n);
  }
  return out.size ? [...out].sort((x, y) => x - y) : null;
}

// Una página parece de lista si trae encabezados de una tabla de ítems (descripción y cantidad).
export function looksLikeListPage(text: string): boolean {
  const t = text.toLowerCase();
  return /descrip/.test(t) && /cantid/.test(t);
}

export type PdfHandle = {
  numPages: number;
  // Páginas con encabezados de lista (para preseleccionarlas) y si el PDF tiene texto.
  listPages: number[];
  hasText: boolean;
  thumbnail: (page: number) => Promise<string>;
  read: (pages: number[], onProgress: (p: number) => void) => Promise<Grid>;
  close: () => Promise<void>;
};

export async function openPdf(file: File): Promise<PdfHandle> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const doc = await task.promise;

  const itemsOf = async (n: number) => {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    const items: PdfItem[] = [];
    for (const it of content.items) {
      if (!("str" in it) || !it.str.trim()) continue;
      items.push({ text: it.str, x: it.transform[4], y: it.transform[5], width: it.width, height: it.height });
    }
    return { height: page.getViewport({ scale: 1 }).height, items };
  };

  // Un vistazo al texto de todas las páginas para saber cuáles parecen listas.
  const listPages: number[] = [];
  let hasText = false;
  for (let n = 1; n <= doc.numPages; n++) {
    const { items } = await itemsOf(n);
    if (items.length) hasText = true;
    if (looksLikeListPage(items.map((i) => i.text).join(" "))) listPages.push(n);
  }

  return {
    numPages: doc.numPages,
    listPages,
    hasText,
    async thumbnail(n) {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: 260 / base.width });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      await page.render({ canvasContext: canvas.getContext("2d")!, viewport, canvas }).promise;
      return canvas.toDataURL("image/jpeg", 0.7);
    },
    async read(pages, onProgress) {
      const chosen: { height: number; items: PdfItem[] }[] = [];
      for (let i = 0; i < pages.length; i++) {
        chosen.push(await itemsOf(pages[i]));
        onProgress((i + 1) / pages.length);
      }
      if (!chosen.some((p) => p.items.length)) {
        throw new Error("Las páginas elegidas no tienen texto (parecen un escaneo). Sube una captura de la tabla para leerla con OCR.");
      }
      return gridFromPdfItems(chosen);
    },
    close: () => task.destroy(),
  };
}
