import type { ServiceItem } from "@/types";

export const LANDING_PHOTO_MARKER = "__landing_photo__";

export function extractLandingPhoto(
  services: ServiceItem[] | null | undefined
): string | null {
  if (!Array.isArray(services)) return null;
  const item = services.find((s) => s.title === LANDING_PHOTO_MARKER);
  const value = item?.description?.trim();
  return value ? value : null;
}

export function withLandingPhoto(
  services: ServiceItem[] | null | undefined,
  photoDataUrl: string | null
): ServiceItem[] {
  const base = Array.isArray(services)
    ? services.filter((s) => s.title !== LANDING_PHOTO_MARKER)
    : [];
  if (!photoDataUrl) return base;
  return [
    ...base,
    { title: LANDING_PHOTO_MARKER, description: photoDataUrl },
  ];
}

export function publicServices(
  services: ServiceItem[] | null | undefined
): ServiceItem[] {
  if (!Array.isArray(services)) return [];
  return services.filter((s) => s.title !== LANDING_PHOTO_MARKER);
}
