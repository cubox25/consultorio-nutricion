import "server-only";

import { createServiceClient } from "@/lib/supabase/admin";
import {
  LANDING_PHOTO_BUCKET,
  LANDING_PHOTO_PATH,
  getLandingPhotoPublicUrl,
} from "@/lib/landing-photo";

export {
  LANDING_PHOTO_BUCKET,
  LANDING_PHOTO_PATH,
  getLandingPhotoPublicUrl,
} from "@/lib/landing-photo";

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

export { createServiceClient };
