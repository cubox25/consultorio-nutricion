import type { ServiceItem } from "@/types";

export const PRICE_CONSULTA_MARKER = "__price_consulta__";
export const PRICE_ANTHRO_MARKER = "__price_antropometria__";
export const PRICE_CONSULTA_LABEL_MARKER = "__label_consulta__";
export const PRICE_ANTHRO_LABEL_MARKER = "__label_antropometria__";
export const PRICE_COMBO_LABEL_MARKER = "__label_combo__";
export const PRICE_SHOW_COMBO_MARKER = "__show_combo__";

export const PRICE_SYSTEM_MARKERS = new Set([
  PRICE_CONSULTA_MARKER,
  PRICE_ANTHRO_MARKER,
  PRICE_CONSULTA_LABEL_MARKER,
  PRICE_ANTHRO_LABEL_MARKER,
  PRICE_COMBO_LABEL_MARKER,
  PRICE_SHOW_COMBO_MARKER,
]);

export const DEFAULT_CONSULTATION_LABEL = "Consulta nutricional";
export const DEFAULT_ANTHROPOMETRY_LABEL = "Antropometría";
export const DEFAULT_COMBO_LABEL = "Consulta + antropometría";

export type ResolvedPriceSettings = {
  consultation_price: number;
  anthropometry_price: number;
  consultation_label: string;
  anthropometry_label: string;
  combo_label: string;
  show_combined: boolean;
};

function readMarkedPrice(services: ServiceItem[] | null | undefined, marker: string) {
  if (!Array.isArray(services)) return 0;
  const item = services.find((s) => s.title === marker);
  const n = Number(item?.description);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function readMarkedText(
  services: ServiceItem[] | null | undefined,
  marker: string,
  fallback: string
) {
  if (!Array.isArray(services)) return fallback;
  const item = services.find((s) => s.title === marker);
  const text = (item?.description ?? "").trim();
  return text || fallback;
}

function readMarkedBool(
  services: ServiceItem[] | null | undefined,
  marker: string,
  fallback: boolean
) {
  if (!Array.isArray(services)) return fallback;
  const item = services.find((s) => s.title === marker);
  if (!item) return fallback;
  const v = String(item.description ?? "").trim().toLowerCase();
  if (v === "1" || v === "true" || v === "si" || v === "sí") return true;
  if (v === "0" || v === "false" || v === "no") return false;
  return fallback;
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
  anthropometryPrice: number,
  opts?: {
    consultation_label?: string;
    anthropometry_label?: string;
    combo_label?: string;
    show_combined?: boolean;
  }
): ServiceItem[] {
  const base = Array.isArray(services)
    ? services.filter((s) => !PRICE_SYSTEM_MARKERS.has(s.title))
    : [];
  const consultation_label =
    (opts?.consultation_label ?? "").trim() || DEFAULT_CONSULTATION_LABEL;
  const anthropometry_label =
    (opts?.anthropometry_label ?? "").trim() || DEFAULT_ANTHROPOMETRY_LABEL;
  const combo_label = (opts?.combo_label ?? "").trim() || DEFAULT_COMBO_LABEL;
  const show_combined = opts?.show_combined ?? true;

  return [
    ...base,
    { title: PRICE_CONSULTA_MARKER, description: String(consultationPrice) },
    { title: PRICE_ANTHRO_MARKER, description: String(anthropometryPrice) },
    { title: PRICE_CONSULTA_LABEL_MARKER, description: consultation_label },
    { title: PRICE_ANTHRO_LABEL_MARKER, description: anthropometry_label },
    { title: PRICE_COMBO_LABEL_MARKER, description: combo_label },
    {
      title: PRICE_SHOW_COMBO_MARKER,
      description: show_combined ? "1" : "0",
    },
  ];
}

export function resolveSettingsPrices(settings: {
  consultation_price?: number | null;
  anthropometry_price?: number | null;
  consultation_price_label?: string | null;
  anthropometry_price_label?: string | null;
  booking_combo_label?: string | null;
  booking_show_combined?: boolean | null;
  services_json?: ServiceItem[] | null;
} | null): ResolvedPriceSettings {
  const stored = extractStoredPrices(settings?.services_json);
  const colConsulta = Number(settings?.consultation_price);
  const colAnthro = Number(settings?.anthropometry_price);

  const fromColConsulta = (settings?.consultation_price_label ?? "").trim();
  const fromColAnthro = (settings?.anthropometry_price_label ?? "").trim();
  const fromColCombo = (settings?.booking_combo_label ?? "").trim();

  return {
    consultation_price:
      Number.isFinite(colConsulta) && colConsulta > 0
        ? colConsulta
        : stored.consultation_price,
    anthropometry_price:
      Number.isFinite(colAnthro) && colAnthro > 0
        ? colAnthro
        : stored.anthropometry_price,
    consultation_label:
      fromColConsulta ||
      readMarkedText(
        settings?.services_json,
        PRICE_CONSULTA_LABEL_MARKER,
        DEFAULT_CONSULTATION_LABEL
      ),
    anthropometry_label:
      fromColAnthro ||
      readMarkedText(
        settings?.services_json,
        PRICE_ANTHRO_LABEL_MARKER,
        DEFAULT_ANTHROPOMETRY_LABEL
      ),
    combo_label:
      fromColCombo ||
      readMarkedText(
        settings?.services_json,
        PRICE_COMBO_LABEL_MARKER,
        DEFAULT_COMBO_LABEL
      ),
    show_combined:
      typeof settings?.booking_show_combined === "boolean"
        ? settings.booking_show_combined
        : readMarkedBool(settings?.services_json, PRICE_SHOW_COMBO_MARKER, true),
  };
}
