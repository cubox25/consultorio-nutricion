import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { LANDING_PHOTO_BUCKET } from "@/lib/landing-photo";

export const BRAND_ASSETS_BUCKET = LANDING_PHOTO_BUCKET;

export function profileAvatarPath(userId: string) {
  return `avatars/${userId}.jpg`;
}

export function logoStoragePath() {
  return "logo.jpg";
}

export function patientPhotoPath(patientId: string) {
  return `patients/${patientId}.jpg`;
}

export function getBrandAssetPublicUrl(
  path: string,
  cacheKey?: string | number | null
) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  const url = `${base}/storage/v1/object/public/${BRAND_ASSETS_BUCKET}/${path}`;
  if (cacheKey == null || cacheKey === "") return url;
  return `${url}?v=${encodeURIComponent(String(cacheKey))}`;
}

export function parseImageDataUrl(dataUrl: string): {
  mime: string;
  contentType: string;
  buffer: Buffer;
} {
  const match =
    /^data:(image\/(jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/i.exec(
      dataUrl
    );
  if (!match) {
    throw new Error("Formato de imagen inválido.");
  }
  const mime = match[1].toLowerCase().replace("image/jpg", "image/jpeg");
  const buffer = Buffer.from(match[3].replace(/\s/g, ""), "base64");
  if (buffer.length > 5 * 1024 * 1024) {
    throw new Error("La imagen no puede superar 5 MB.");
  }
  const contentType =
    mime === "image/png"
      ? "image/png"
      : mime === "image/webp"
        ? "image/webp"
        : "image/jpeg";
  return { mime, contentType, buffer };
}

/** Extrae el path dentro del bucket desde una URL pública de brand-assets. */
export function brandAssetPathFromUrl(url: string | null | undefined): string | null {
  if (!url || url.startsWith("data:")) return null;
  const marker = `/storage/v1/object/public/${BRAND_ASSETS_BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  const path = url.slice(idx + marker.length).split("?")[0];
  return path || null;
}

export async function ensureBrandAssetsBucket(service: SupabaseClient) {
  try {
    const { data: buckets, error } = await service.storage.listBuckets();
    if (!error) {
      const exists = (buckets ?? []).some((b) => b.name === BRAND_ASSETS_BUCKET);
      if (exists) return;
    }
  } catch {
    // Seguimos e intentamos create / upload.
  }

  const { error } = await service.storage.createBucket(BRAND_ASSETS_BUCKET, {
    public: true,
    fileSizeLimit: 5 * 1024 * 1024,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
  });
  if (
    error &&
    !/already exists|duplicate|The resource already exists/i.test(error.message)
  ) {
    // El bucket puede existir aunque listBuckets haya fallado.
    console.warn("[brand-image] createBucket:", error.message);
  }
}

/** Sube (upsert) y borra el archivo anterior si estaba en otra ruta del mismo bucket. */
export async function replaceBrandAsset(opts: {
  service: SupabaseClient;
  path: string;
  buffer: Buffer;
  contentType: string;
  previousUrl?: string | null;
  /** Si false, no intenta crear el bucket (útil con cliente staff). */
  ensureBucket?: boolean;
}) {
  if (opts.ensureBucket !== false) {
    await ensureBrandAssetsBucket(opts.service);
  }

  const previousPath = brandAssetPathFromUrl(opts.previousUrl);
  if (previousPath && previousPath !== opts.path) {
    const { error: removeError } = await opts.service.storage
      .from(BRAND_ASSETS_BUCKET)
      .remove([previousPath]);
    if (removeError) {
      console.warn("[brand-image] remove previous", removeError.message);
    }
  }

  const { error } = await opts.service.storage
    .from(BRAND_ASSETS_BUCKET)
    .upload(opts.path, opts.buffer, {
      contentType: opts.contentType,
      upsert: true,
      cacheControl: "3600",
    });
  if (error) throw error;

  return getBrandAssetPublicUrl(opts.path, Date.now());
}

export async function removeBrandAsset(opts: {
  service: SupabaseClient;
  path: string;
  previousUrl?: string | null;
}) {
  const paths = new Set<string>([opts.path]);
  const previousPath = brandAssetPathFromUrl(opts.previousUrl);
  if (previousPath) paths.add(previousPath);
  await opts.service.storage.from(BRAND_ASSETS_BUCKET).remove([...paths]);
}
