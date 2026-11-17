// Compresión de fotos en el navegador antes de subirlas: se achican a un lado mayor de `maxSide` px y se guardan como JPG.
// Una foto de celular de 5–10 MB queda en unos cientos de KB. Si el navegador no puede abrirla (HEIC, por ejemplo) o el
// resultado no pesa menos, se sube la original.

// Tamaño que cabe en `max` px por su lado mayor, sin agrandar.
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export async function compressImage(file: File, maxSide = 1920, quality = 0.8): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const { width, height } = fitWithin(bitmap.width, bitmap.height, maxSide);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    // Fondo blanco: un PNG con transparencia pasaría a negro al guardarse como JPG.
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob || blob.size >= file.size) return file;
    const name = file.name.replace(/\.[^.]+$/, "") || "foto";
    return new File([blob], `${name}.jpg`, { type: "image/jpeg", lastModified: file.lastModified });
  } catch {
    return file;
  }
}
