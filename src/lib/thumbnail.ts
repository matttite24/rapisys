// Miniatura de una imagen, hecha en el navegador: lado mayor de 240 px, webp. Devuelve null si no se puede (formato que el
// navegador no abre, por ejemplo HEIC); entonces el archivo se sube igual, sin miniatura.
export async function makeThumbnail(file: File, side = 240): Promise<Blob | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.7));
  } catch {
    return null;
  }
}
