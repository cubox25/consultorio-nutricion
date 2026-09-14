/**
 * Normaliza teléfonos argentinos al formato WhatsApp Cloud API (solo dígitos con país).
 * Resultado típico móvil: 549XXXXXXXXX (sin +)
 */
export function digitsOnly(value: string | null | undefined): string {
  return String(value || "").replace(/\D/g, "");
}

export function normalizeArgentinaWhatsApp(
  raw: string | null | undefined
): string | null {
  let d = digitsOnly(raw);
  if (!d) return null;

  if (d.startsWith("00")) d = d.slice(2);

  if (d.startsWith("549") && d.length >= 12) {
    return d;
  }

  if (d.startsWith("54") && d.length >= 11) {
    d = d.slice(2);
  }

  if (d.startsWith("0")) d = d.slice(1);

  if (d.startsWith("9") && d.length >= 11 && d.length <= 13) {
    return `54${d}`;
  }

  if (d.length >= 12) {
    const with15 = d.match(/^(\d{2,4})15(\d{6,8})$/);
    if (with15) {
      return `549${with15[1]}${with15[2]}`;
    }
  }

  if (d.startsWith("15") && d.length >= 8 && d.length <= 10) {
    return `549${d.slice(2)}`;
  }

  if (d.length >= 8 && d.length <= 11) {
    return `549${d}`;
  }

  if (d.length >= 12) {
    return d.startsWith("54") ? d : `54${d}`;
  }

  return null;
}
