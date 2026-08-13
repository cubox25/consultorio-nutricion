/**
 * Normaliza teléfonos argentinos al formato WhatsApp (solo dígitos con código país).
 * No modifica el valor original en la base: solo transforma una copia para el envío.
 *
 * Resultado típico móvil: 549XXXXXXXXX (sin +)
 */
function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

function normalizeArgentinaWhatsApp(raw) {
  let d = digitsOnly(raw);
  if (!d) return null;

  // 00 internacional
  if (d.startsWith("00")) d = d.slice(2);

  // Ya viene como 549...
  if (d.startsWith("549") && d.length >= 12) {
    return d;
  }

  // 54 + resto (puede traer 9 o no)
  if (d.startsWith("54") && d.length >= 11) {
    d = d.slice(2);
  }

  // 0 nacional
  if (d.startsWith("0")) d = d.slice(1);

  // Ya tiene 9 de móvil (ej. 93815746495)
  if (d.startsWith("9") && d.length >= 11 && d.length <= 13) {
    return `54${d}`;
  }

  // Formato con 15 después del código de área: AAA15NNNNNNN
  // Solo con longitud suficiente para no confundir el "15" interno de un número
  // (ej. 3815746495 NO debe matchear como 38+15+746495).
  if (d.length >= 12) {
    const with15 = d.match(/^(\d{2,4})15(\d{6,8})$/);
    if (with15) {
      return `549${with15[1]}${with15[2]}`;
    }
  }

  // Empieza con 15 (sin área): 15NNNNNN
  if (d.startsWith("15") && d.length >= 8 && d.length <= 10) {
    return `549${d.slice(2)}`;
  }

  // Nacional sin 9: área + número (8–11 dígitos)
  if (d.length >= 8 && d.length <= 11) {
    return `549${d}`;
  }

  if (d.length >= 12) {
    return d.startsWith("54") ? d : `54${d}`;
  }

  return null;
}

function toWhatsAppId(rawPhone) {
  const normalized = normalizeArgentinaWhatsApp(rawPhone);
  if (!normalized || normalized.length < 11) return null;
  return `${normalized}@c.us`;
}

module.exports = {
  digitsOnly,
  normalizeArgentinaWhatsApp,
  toWhatsAppId,
};
