import type { ServiceItem } from "@/types";

export const PRICE_CONSULTA_MARKER = "__price_consulta__";
export const PRICE_ANTHRO_MARKER = "__price_antropometria__";

function readMarkedPrice(services: ServiceItem[] | null | undefined, marker: string) {
  if (!Array.isArray(services)) return 0;
  const item = services.find((s) => s.title === marker);
  const n = Number(item?.description);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function extractStoredPrices(services: ServiceItem[] | null | undefined) {
  return {
    consultation_price: readMarkedPrice(services, PRICE_CONSULTA_MARKER),
    anthropometry_price: readMarkedPrice(services, PRICE_ANTHRO_MARKER),
  };
}

export function withStoredPrices(
  services: ServiceItem[] | null | undefined,
  consultationPrice: number,
  anthropometryPrice: number
): ServiceItem[] {
  const base = Array.isArray(services)
    ? services.filter(
        (s) => s.title !== PRICE_CONSULTA_MARKER && s.title !== PRICE_ANTHRO_MARKER
      )
    : [];
  return [
    ...base,
    { title: PRICE_CONSULTA_MARKER, description: String(consultationPrice) },
    { title: PRICE_ANTHRO_MARKER, description: String(anthropometryPrice) },
  ];
}

export function resolveSettingsPrices(settings: {
  consultation_price?: number | null;
  anthropometry_price?: number | null;
  services_json?: ServiceItem[] | null;
} | null) {
  const stored = extractStoredPrices(settings?.services_json);
  const colConsulta = Number(settings?.consultation_price);
  const colAnthro = Number(settings?.anthropometry_price);
  return {
    consultation_price:
      Number.isFinite(colConsulta) && colConsulta > 0
        ? colConsulta
        : stored.consultation_price,
    anthropometry_price:
      Number.isFinite(colAnthro) && colAnthro > 0
        ? colAnthro
        : stored.anthropometry_price,
  };
}
