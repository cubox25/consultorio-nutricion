/** Redimensiona una imagen a cuadrado JPEG (data URL) para subir a Storage. */
export async function fileToAvatarDataUrl(
  file: File,
  size = 320,
  quality = 0.85
): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const mime = (file.type || "").toLowerCase();
  const looksLikeImage =
    mime.startsWith("image/") ||
    ["jpg", "jpeg", "png", "webp", "gif", "heic", "heif"].includes(ext);

  if (!looksLikeImage) {
    throw new Error("Seleccioná una imagen (JPG, PNG o WebP).");
  }
  if (mime.includes("heic") || mime.includes("heif") || ext === "heic" || ext === "heif") {
    throw new Error(
      "Este formato (HEIC) no es compatible. Guardá la foto como JPG o PNG e intentá de nuevo."
    );
  }
  if (file.size > 8 * 1024 * 1024) {
    throw new Error("La imagen no puede superar 8 MB.");
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(
      "No se pudo leer la imagen. Probá con JPG o PNG (máx. 8 MB)."
    );
  }

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("No se pudo procesar la imagen.");
  }

  const min = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - min) / 2;
  const sy = (bitmap.height - min) / 2;
  ctx.drawImage(bitmap, sx, sy, min, min, 0, 0, size, size);
  bitmap.close();

  return canvas.toDataURL("image/jpeg", quality);
}
