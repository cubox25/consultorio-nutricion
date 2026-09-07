import type { BookingServiceType, SystemSettings } from "@/types";
import { BOOKING_SERVICE_LABELS } from "@/types";
import { resolveSettingsPrices } from "@/lib/price-settings";

export function consultationPrice(settings: SystemSettings | null) {
  return resolveSettingsPrices(settings).consultation_price;
}

export function anthropometryPrice(settings: SystemSettings | null) {
  return resolveSettingsPrices(settings).anthropometry_price;
}

export function bookingServicePrice(
  settings: SystemSettings | null,
  service: BookingServiceType
) {
  const consulta = consultationPrice(settings);
  const anthro = anthropometryPrice(settings);
  return service === "consulta_antropometria" ? consulta + anthro : consulta;
}

export function bookingServiceLabel(service: BookingServiceType) {
  return BOOKING_SERVICE_LABELS[service];
}
