// Archivos del proceso: límites y utilidades compartidas entre el servidor y el navegador (sin dependencias de servidor).
export const FILES_BUCKET = "contract-files";
export const MAX_FILE_BYTES = 15 * 1024 * 1024;

export type FileSource = "contract" | "purchase" | "expense";
export const SOURCE_LABEL: Record<FileSource, string> = { contract: "Contrato", purchase: "Compra", expense: "Gasto" };

// Tipos permitidos (los mismos que acepta el bucket). El navegador a veces no informa el tipo de un .xml o un .csv:
// por eso se completa con la extensión.
const BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  heic: "image/heic",
  xml: "application/xml",
  csv: "text/csv",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};
const ALLOWED = new Set([...Object.values(BY_EXT), "text/xml"]);

export const FILE_ACCEPT = Object.keys(BY_EXT).map((e) => `.${e}`).join(",");

// Tipo efectivo de un archivo: el que informa el navegador si es válido; si no, el que corresponde a su extensión.
export function resolveMime(name: string, reported: string): string | null {
  if (reported && ALLOWED.has(reported)) return reported;
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return BY_EXT[ext] ?? null;
}

// Nombre apto para una ruta de almacenamiento: sin acentos, espacios ni caracteres raros.
export function safeFileName(name: string): string {
  const clean = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^[._]+/, "")
    .slice(-100);
  return clean || "archivo";
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

export type FileKind = "pdf" | "image" | "sheet" | "doc" | "xml" | "other";
export function fileKind(mime: string): FileKind {
  if (mime === "application/pdf") return "pdf";
  if (mime.startsWith("image/")) return "image";
  if (mime.includes("spreadsheet") || mime === "application/vnd.ms-excel" || mime === "text/csv") return "sheet";
  if (mime.includes("word") || mime.includes("presentation") || mime === "application/vnd.ms-powerpoint") return "doc";
  if (mime.includes("xml")) return "xml";
  return "other";
}
