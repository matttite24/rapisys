// Lectura de capturas de tablas, en el navegador: prepara la imagen, la lee con Tesseract, ubica
// las líneas de la tabla y recupera las cantidades. No sabe nada de pantallas ni de React;
// la interfaz de la carga masiva (components/bulk-import) solo la usa.
import { groupWords, parseTable, type OcrLine, type OcrWord, type ParsedRow } from "@/lib/ocr-table";
import { gridFromWords, type Grid } from "@/lib/table-map";

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
  return withOcr(file, onProgress, async (ocr) => {
    const reading = await ocr.read((r) => r.words.length > 0);
    const lines = groupWords(reading.words);
    const mid = lines[Math.floor(lines.length / 2)];
    const borders = mid && mid.y0 !== undefined && mid.y1 !== undefined ? ocr.bordersAt(mid.y0 - 4, mid.y1 + 4) : [];
    return { grid: gridFromWords(reading.words, borders), raw: reading.lines.map((l) => l.text.trim()).filter(Boolean).join("\n") };
  });
}
