import { createClient } from "@supabase/supabase-js";

export const LANDING_PHOTO_BUCKET = "brand-assets";
export const LANDING_PHOTO_PATH = "landing-photo.jpg";

export function getLandingPhotoPublicUrl(cacheKey?: string | number | null) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  const url = `${base}/storage/v1/object/public/${LANDING_PHOTO_BUCKET}/${LANDING_PHOTO_PATH}`;
  if (cacheKey == null || cacheKey === "") return url;
  return `${url}?v=${encodeURIComponent(String(cacheKey))}`;
}

export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Faltan variables de Supabase (URL o SERVICE_ROLE_KEY).");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Devuelve version (updated_at) si existe el archivo; null si no hay foto. */
export async function getLandingPhotoVersion(): Promise<string | null> {
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase.storage
      .from(LANDING_PHOTO_BUCKET)
      .list("", { search: "landing-photo" });
    if (error) return null;
    const file = (data ?? []).find((f) => f.name === LANDING_PHOTO_PATH);
    return file?.updated_at ?? (file ? "1" : null);
  } catch {
    return null;
  }
}
