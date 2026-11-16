// Lectura de capturas de tablas, en el navegador: prepara la imagen, la lee con Tesseract, ubica
// las líneas de la tabla y recupera las cantidades. No sabe nada de pantallas ni de React;
// la interfaz de la carga masiva (components/bulk-import) solo la usa.
import { groupWords, parseTable, type OcrLine, type OcrWord, type ParsedRow } from "@/lib/ocr-table";
import { gridFromWords, normalizeGrid, type Grid } from "@/lib/table-map";

// Agranda la captura si es chica y la apoya sobre fondo blanco (una imagen con transparencia se
// lee como negro). No se le aplican filtros de contraste: en pruebas hacían que el OCR perdiera
// los números chicos (ítem y cantidad). Devuelve también los píxeles, para ubicar los bordes de la tabla.
async function prepare(file: Blob): Promise<{ blob: Blob; pixels: ImageData | null }> {
  const bmp = await createImageBitmap(file);
  const scale = bmp.width < 1600 ? Math.min(2, 2000 / bmp.width) : 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return { blob: file, pixels: null };
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b ?? file), "image/png"));
  return { blob, pixels };
}

// Posiciones (x) de las líneas verticales de la tabla en la franja de un renglón: las columnas
// cuyo trazo oscuro cubre casi toda la franja. Los caracteres sueltos nunca la cubren.
function verticalBorders(img: ImageData, y0: number, y1: number): number[] {
  const top = Math.max(0, Math.floor(y0));
  const bottom = Math.min(img.height, Math.ceil(y1));
  const height = bottom - top;
  if (height <= 0) return [];
  const xs: number[] = [];
  for (let x = 0; x < img.width; x++) {
    let dark = 0;
    for (let y = top; y < bottom; y++) {
      const i = (y * img.width + x) * 4;
      if (img.data[i] * 0.299 + img.data[i + 1] * 0.587 + img.data[i + 2] * 0.114 < 140) dark++;
    }
    if (dark / height >= 0.8) xs.push(x);
  }
  // Un trazo grueso ocupa varias columnas contiguas: se queda con su centro.
  const centers: number[] = [];
  let group: number[] = [];
  for (const x of xs) {
    if (group.length && x - group[group.length - 1] > 3) {
      centers.push(Math.round(group.reduce((s, v) => s + v, 0) / group.length));
      group = [];
    }
    group.push(x);
  }
  if (group.length) centers.push(Math.round(group.reduce((s, v) => s + v, 0) / group.length));
  return centers;
}

// Líneas horizontales de la tabla: renglones de píxeles donde un trazo oscuro cubre buena parte del ancho. Devuelve sus
// posiciones (y) y de dónde a dónde llega la tabla (x). Si no hay al menos dos, la imagen no tiene una tabla con bordes.
function horizontalBorders(img: ImageData): { ys: number[]; x0: number; x1: number } | null {
  const minRun = img.width * 0.4;
  const hits: { y: number; start: number; end: number }[] = [];
  for (let y = 0; y < img.height; y++) {
    let best = 0, bestStart = 0, run = 0, start = 0;
    for (let x = 0; x < img.width; x++) {
      const i = (y * img.width + x) * 4;
      const dark = img.data[i] * 0.299 + img.data[i + 1] * 0.587 + img.data[i + 2] * 0.114 < 140;
      if (dark) {
        if (run === 0) start = x;
        run++;
        if (run > best) { best = run; bestStart = start; }
      } else run = 0;
    }
    if (best >= minRun) hits.push({ y, start: bestStart, end: bestStart + best });
  }
  // Un trazo grueso ocupa varios renglones seguidos: se queda con su centro.
  const ys: number[] = [];
  let group: number[] = [];
  for (const h of hits) {
    if (group.length && h.y - group[group.length - 1] > 3) {
      ys.push(Math.round(group.reduce((a, v) => a + v, 0) / group.length));
      group = [];
    }
    group.push(h.y);
  }
  if (group.length) ys.push(Math.round(group.reduce((a, v) => a + v, 0) / group.length));
  if (ys.length < 2) return null;
  const starts = hits.map((h) => h.start).sort((a, b) => a - b);
  const ends = hits.map((h) => h.end).sort((a, b) => a - b);
  return { ys, x0: starts[Math.floor(starts.length / 2)], x1: ends[Math.floor(ends.length / 2)] };
}

export type Reading = { lines: OcrLine[]; words: OcrWord[] };
type Rect = { left: number; top: number; width: number; height: number };

// Modos de lectura de Tesseract que se prueban en orden hasta que uno devuelva filas.
// "4" = una columna: en pruebas con tablas de contrato conserva los números chicos (ítem y
// cantidad) que el modo de texto disperso ("11") descarta. "3" = automático. "6" = un bloque.
const MODES = ["4", "3", "6"];

export type Ocr = {
  read: (enough: (r: Reading) => boolean) => Promise<Reading>;
  // Lee solo dígitos dentro de un recuadro de la imagen.
  digitsAt: (rect: Rect) => Promise<string>;
  // Líneas verticales de la tabla en una franja de la imagen.
  bordersAt: (y0: number, y1: number) => number[];
  // Tabla con bordes: cada celda se lee por separado (null si la imagen no tiene una tabla con bordes).
  cells: (onProgress: (p: number) => void) => Promise<string[][] | null>;
};

// Abre Tesseract en el navegador (la captura no sale de tu equipo; los datos de idioma se
// descargan una vez, unos MB) y lo cierra al terminar `run`.
export async function withOcr<T>(file: Blob, onProgress: (p: number) => void, run: (ocr: Ocr) => Promise<T>): Promise<T> {
  // La imagen se prepara mientras se descarga el lector.
  const [{ blob: image, pixels }, mod] = await Promise.all([prepare(file), import("tesseract.js")]);
  const { createWorker } = (mod as unknown as { default?: typeof mod }).default ?? mod;
  const worker = await createWorker(["eng", "spa"], 1, {
    logger: (m) => {
      if (m.status === "recognizing text") onProgress(m.progress);
    },
  });

  const ocr: Ocr = {
    async read(enough) {
      let first: Reading | undefined;
      for (const mode of MODES) {
        await worker.setParameters({ tessedit_pageseg_mode: mode as never });
        const { data } = await worker.recognize(image, {}, { blocks: true });
        const result: Reading = { lines: [], words: [] };
        for (const b of data.blocks ?? [])
          for (const p of b.paragraphs)
            for (const l of p.lines) {
              const words: OcrWord[] = l.words.map((w) => ({
                text: w.text,
                confidence: w.confidence,
                x0: w.bbox.x0,
                y0: w.bbox.y0,
                x1: w.bbox.x1,
                y1: w.bbox.y1,
              }));
              result.words.push(...words);
              // Altura del renglón: la del CPC si lo hay (los símbolos sueltos estiran el recuadro del renglón).
              const anchor = words.find((w) => /^\d{6,12}$/.test(w.text));
              result.lines.push({
                text: l.text,
                confidence: l.confidence,
                y0: anchor?.y0 ?? l.bbox.y0,
                y1: anchor?.y1 ?? l.bbox.y1,
                x0: anchor?.x0,
              });
            }
        first ??= result;
        if (enough(result)) return result;
      }
      // Ningún modo dio filas: se muestra lo del primero (el mejor para tablas), no el último.
      return first ?? { lines: [], words: [] };
    },
    async digitsAt(rect) {
      await worker.setParameters({ tessedit_pageseg_mode: "7" as never, tessedit_char_whitelist: "0123456789" });
      const { data } = await worker.recognize(image, { rectangle: rect });
      return data.text.trim();
    },
    bordersAt: (y0, y1) => (pixels ? verticalBorders(pixels, y0, y1) : []),
    async cells(report) {
      if (!pixels) return null;
      const h = horizontalBorders(pixels);
      if (!h) return null;
      const top = h.ys[0], bottom = h.ys[h.ys.length - 1];
      const xs = verticalBorders(pixels, top + 4, bottom - 4).filter((x) => x >= h.x0 - 6 && x <= h.x1 + 6);
      if (xs.length < 2) return null;
      // Celdas entre dos líneas seguidas, sin el trazo de la línea (inset) y sin renglones demasiado finos.
      const inset = 3;
      const rows = h.ys.slice(1).map((y, i) => [h.ys[i], y] as const).filter(([a, b]) => b - a >= 12);
      const cols = xs.slice(1).map((x, i) => [xs[i], x] as const).filter(([a, b]) => b - a >= 12);
      if (rows.length < 2 || cols.length < 2) return null;
      const grid: string[][] = rows.map(() => cols.map(() => ""));
      const total = rows.length * cols.length;
      let done = 0;
      const rect = (r: number, c: number) => ({ left: cols[c][0] + inset, top: rows[r][0] + inset, width: cols[c][1] - cols[c][0] - inset * 2, height: rows[r][1] - rows[r][0] - inset * 2 });

      // 1.ª pasada: cada celda como un bloque de texto (admite descripciones de dos renglones).
      await worker.setParameters({ tessedit_pageseg_mode: "6" as never, tessedit_char_whitelist: "" });
      for (let r = 0; r < rows.length; r++)
        for (let c = 0; c < cols.length; c++) {
          const { data } = await worker.recognize(image, { rectangle: rect(r, c) });
          grid[r][c] = data.text.replace(/\s+/g, " ").trim();
          report(++done / total);
        }
      // 2.ª pasada: lo que quedó vacío suele ser un número suelto (ítem, cantidad); se relee solo con dígitos.
      for (let r = 0; r < rows.length; r++)
        for (let c = 0; c < cols.length; c++) {
          if (grid[r][c]) continue;
          for (const mode of ["7", "10"]) {
            await worker.setParameters({ tessedit_pageseg_mode: mode as never, tessedit_char_whitelist: "0123456789" });
            const { data } = await worker.recognize(image, { rectangle: rect(r, c) });
            const text = data.text.trim();
            if (/^\d{1,12}$/.test(text)) { grid[r][c] = text; break; }
          }
        }
      return grid;
    },
  };

  try {
    return await run(ocr);
  } finally {
    await worker.terminate();
  }
}

// Filas de la tabla: primero los renglones que detecta el OCR; si no hay, se reagrupan las palabras por altura.
export function tableFrom(r: Reading) {
  const byLines = parseTable(r.lines);
  return byLines.rows.length ? byLines : parseTable(groupWords(r.words));
}

// Los números sueltos (la cantidad) son lo que el OCR más pierde. Las filas sin cantidad se
// releen en su celda, leyendo solo dígitos. La celda es la que queda justo a la izquierda de la
// del CPC, entre dos líneas verticales de la tabla; si no se encuentran, se usa el encabezado CANTID.
export async function fillQuantities(rows: ParsedRow[], words: OcrWord[], ocr: Ocr) {
  const head = words.find((w) => /^cantid/i.test(w.text));
  const pad = 10;
  for (const r of rows) {
    if (r.quantity || r.y0 === undefined || r.y1 === undefined) continue;
    const top = Math.max(0, Math.round(r.y0 - pad));
    const height = Math.round(r.y1 - r.y0 + pad * 2);

    let left: number | undefined;
    let width: number | undefined;
    if (r.x0 !== undefined) {
      const borders = ocr.bordersAt(r.y0 - pad, r.y1 + pad).filter((b) => b < r.x0!);
      if (borders.length >= 2) {
        left = borders[borders.length - 2] + 4;
        width = borders[borders.length - 1] - 4 - left;
      }
    }
    if (left === undefined && head) {
      const half = (head.x1 - head.x0) / 2 + 10;
      left = Math.max(0, Math.round((head.x0 + head.x1) / 2 - half));
      width = Math.round(half * 2);
    }
    if (left === undefined || !width || width < 10) continue;

    const text = await ocr.digitsAt({ left, top, width, height });
    if (/^\d{1,4}$/.test(text)) r.quantity = text;
  }
}

// La captura como tabla de celdas (filas × columnas), sin interpretar qué es cada columna: eso lo elige la persona.
// Las columnas salen de las líneas verticales de la tabla (o, sin ellas, de los huecos en blanco).
export async function gridFromImage(file: Blob, onProgress: (p: number) => void): Promise<{ grid: Grid; raw: string }> {
  // El progreso del lector se ignora: se informa por celda leída (tabla con bordes) o el del lector (sin bordes).
  let cellMode = false;
  return withOcr(file, (p) => { if (!cellMode) onProgress(p); }, async (ocr) => {
    cellMode = true;
    const cells = await ocr.cells(onProgress);
    cellMode = false;
    if (cells) {
      const grid = normalizeGrid(cells);
      return { grid, raw: grid.map((r) => r.join(" | ")).join("\n") };
    }
    // Sin bordes: se leen las palabras con su posición y las columnas salen de los huecos en blanco.
    const reading = await ocr.read((r) => r.words.length > 0);
    const lines = groupWords(reading.words);
    const mid = lines[Math.floor(lines.length / 2)];
    const borders = mid && mid.y0 !== undefined && mid.y1 !== undefined ? ocr.bordersAt(mid.y0 - 4, mid.y1 + 4) : [];
    return { grid: gridFromWords(reading.words, borders), raw: reading.lines.map((l) => l.text.trim()).filter(Boolean).join("\n") };
  });
}
