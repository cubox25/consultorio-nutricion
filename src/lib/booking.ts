import type { BookingServiceType, SystemSettings } from "@/types";
import { BOOKING_SERVICE_LABELS } from "@/types";
import { resolveSettingsPrices } from "@/lib/price-settings";

export function consultationPrice(settings: SystemSettings | null) {
  return resolveSettingsPrices(settings).consultation_price;
}

export function anthropometryPrice(settings: SystemSettings | null) {
  return resolveSettingsPrices(settings).anthropometry_price;
}

export function bookingShowCombined(settings: SystemSettings | null) {
  return resolveSettingsPrices(settings).show_combined;
}

export function bookingServicePrice(
  settings: SystemSettings | null,
  service: BookingServiceType
) {
  const prices = resolveSettingsPrices(settings);
  return service === "consulta_antropometria"
    ? prices.consultation_price + prices.anthropometry_price
    : prices.consultation_price;
}

export function bookingServiceLabel(
  service: BookingServiceType,
  settings?: SystemSettings | null
) {
  if (!settings) return BOOKING_SERVICE_LABELS[service];
  const prices = resolveSettingsPrices(settings);
  if (service === "consulta_antropometria") return prices.combo_label;
  return prices.consultation_label;
}
