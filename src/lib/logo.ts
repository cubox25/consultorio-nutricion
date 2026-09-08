/** Optimiza un logo horizontal (data URL) para subir a Storage. */
export async function fileToLogoDataUrl(
  file: File,
  maxWidth = 1000,
  quality = 0.92
): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Seleccioná una imagen (JPG, PNG o WebP).");
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("La imagen no puede superar 5 MB.");
  }

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxWidth / bitmap.width);
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo procesar la imagen.");

  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const mime = file.type === "image/jpeg" ? "image/jpeg" : "image/png";
  return canvas.toDataURL(mime, quality);
}
