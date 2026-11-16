"use server";

import ExcelJS from "exceljs";
import { requireUser } from "@/lib/auth";

const MAX_BYTES = 4 * 1024 * 1024;
const MAX_ROWS = 2000;

// Texto de una celda de Excel: valor, resultado de fórmula, texto con formato o fecha.
function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if ("result" in v) return cellText(v.result as ExcelJS.CellValue);
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    if ("text" in v) return String(v.text);
    return "";
  }
  return String(v);
}

// Lee la primera hoja de un .xlsx y la devuelve como filas de texto. Solo lee: no guarda nada.
export async function readSheet(formData: FormData): Promise<{ rows?: string[][]; error?: string }> {
  await requireUser();
  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "No se recibió el archivo." };
  if (file.size > MAX_BYTES) return { error: "El archivo pasa de 4 MB." };
  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    const ws = wb.worksheets[0];
    if (!ws) return { error: "El archivo no tiene hojas." };
    const rows: string[][] = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      if (rows.length >= MAX_ROWS) return;
      const cells: string[] = [];
      for (let c = 1; c <= row.cellCount; c++) cells.push(cellText(row.getCell(c).value));
      rows.push(cells);
    });
    return { rows };
  } catch {
    return { error: "No se pudo leer el archivo. Verifica que sea un Excel (.xlsx)." };
  }
}
