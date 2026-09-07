/**
 * Traduce errores técnicos de WhatsApp Web / Puppeteer a texto claro en español.
 * @param {unknown} err
 * @returns {string}
 */
function friendlyWhatsAppError(err) {
  const raw =
    err && typeof err === "object" && "message" in err
      ? String(/** @type {{ message?: unknown }} */ (err).message || "")
      : String(err ?? "");
  const text = raw.trim();
  const lower = text.toLowerCase();

  if (!text) {
    return "No se pudo enviar el mensaje. Probá de nuevo en unos minutos.";
  }

  // Casos ya en español del propio servicio
  if (
    /sin número|teléfono|turno cancelado|tipo de mensaje|omitido|no normalizable/i.test(
      text
    )
  ) {
    return text;
  }

  if (
    /not.*registered|no.*lid|is not on whatsapp|phone number.*not/i.test(lower)
  ) {
    return "Ese número no tiene WhatsApp o no se pudo encontrar en WhatsApp. Revisá el teléfono del paciente.";
  }

  if (/invalid.*(wid|chat|number)|wid error/i.test(lower)) {
    return "El teléfono del paciente no es válido para WhatsApp. Revisá el formato (con código de área).";
  }

  if (
    /evaluation failed|execution context|protocol error|target closed|session closed|detached frame|browser.*closed|page\.|puppeteer/i.test(
      lower
    )
  ) {
    return "WhatsApp Web se desconectó o se reinició mientras se enviaba. Reconectá WhatsApp y reintentá el envío.";
  }

  if (/timeout|timed out|navigation timeout/i.test(lower)) {
    return "WhatsApp tardó demasiado en responder. Revisá la conexión a internet de la PC y reintentá.";
  }

  if (/rate|too many|429|flood/i.test(lower)) {
    return "WhatsApp limitó el envío por muchos mensajes seguidos. Esperá unos minutos y reintentá.";
  }

  if (/qr|auth_failure|not authenticated|unpaired|logged out|logout/i.test(lower)) {
    return "La sesión de WhatsApp no está vinculada. Escaneá el código QR de nuevo en Admin → WhatsApp.";
  }

  if (/already running|userdata|user data dir/i.test(lower)) {
    return "Hay otra ventana de WhatsApp abierta en esta PC. Cerrá el servicio duplicado y reiniciá WhatsApp.";
  }

  if (/econnrefused|enotfound|network|fetch failed|socket/i.test(lower)) {
    return "Hubo un problema de red al hablar con WhatsApp o Supabase. Revisá internet y reintentá.";
  }

  if (/forbidden|unauthorized|401|403/i.test(lower)) {
    return "No hay permiso para completar la operación. Revisá la sesión de WhatsApp o las claves de Supabase del servicio.";
  }

  // Fallback: mensaje claro + detalle corto sin stack
  const short = text.replace(/\s+/g, " ").slice(0, 180);
  return `No se pudo enviar el WhatsApp. Motivo técnico: ${short}`;
}

module.exports = { friendlyWhatsAppError };
