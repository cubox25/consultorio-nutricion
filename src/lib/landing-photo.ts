/**
 * Helpers públicos de la foto de inicio (seguros para importar desde cualquier lado).
 * La lógica con service role vive en landing-photo.server.ts
 */
export const LANDING_PHOTO_BUCKET = "brand-assets";
export const LANDING_PHOTO_PATH = "landing-photo.jpg";

export function getLandingPhotoPublicUrl(cacheKey?: string | number | null) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  const url = `${base}/storage/v1/object/public/${LANDING_PHOTO_BUCKET}/${LANDING_PHOTO_PATH}`;
  if (cacheKey == null || cacheKey === "") return url;
  return `${url}?v=${encodeURIComponent(String(cacheKey))}`;
}
