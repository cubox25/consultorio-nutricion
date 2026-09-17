function formatDateAR(isoDate) {
  if (!isoDate) return "—";
  const [y, m, d] = String(isoDate).slice(0, 10).split("-");
  if (!y || !m || !d) return String(isoDate);
  return `${d}/${m}/${y}`;
}

function formatTime(time) {
  if (!time) return "—";
  return String(time).slice(0, 5);
}

function patientFirstName(row) {
  // Identidad = DNI → nombre de la ficha del paciente (no el tipeado en el formulario).
  const patient = row.patient?.first_name?.trim();
  const guest = row.guest_first_name?.trim();
  return patient || guest || "hola";
}

function clinicLabel(row) {
  const name = row.clinic?.name?.trim();
  const address = row.clinic?.address?.trim();
  if (name && address) return `${name} — ${address}`;
  return address || name || "Consultorio";
}

const PAMELA_WA_LINK = "https://wa.me/5493816617606";

const PAMELA_SIGN_OFF = [
  "Si necesitás cancelar o modificar el turno, por favor escribime directamente a mi WhatsApp:",
  `📲 ${PAMELA_WA_LINK}`,
  "",
  "✨ ¡Gracias por elegirme y nos vemos pronto!",
  "",
  "Pamela Guerrero - Lic. En Nutrición",
  "MP 1626",
].join("\n");

const DEFAULT_CONFIRMATION = [
  "🌸 ¡Hola! Soy Pamela, Lic. en Nutrición.",
  "",
  "Te escribo para confirmarte que tu turno quedó reservado ✅✨",
  "",
  "📅 Fecha: {fecha}",
  "🕘 Hora: {hora} hs",
  "📍 Consultorio: {consultorio}",
  "",
  "Te espero para nuestra consulta 🍉",
  "",
  PAMELA_SIGN_OFF,
].join("\n");

const DEFAULT_REMINDER_24H = [
  "🌸 ¡Hola! Soy Pamela, Lic. en Nutrición.",
  "",
  "Te escribo para recordarte tu turno ✅✨",
  "",
  "📅 Fecha: {fecha}",
  "🕘 Hora: {hora} hs",
  "📍 Consultorio: {consultorio}",
  "",
  "Te espero para nuestra consulta 🍉",
  "",
  PAMELA_SIGN_OFF,
].join("\n");

const DEFAULT_REMINDER_2H = [
  "🌸 ¡Hola! Soy Pamela, Lic. en Nutrición.",
  "",
  "Te escribo para recordarte que tu turno es en aproximadamente 2 horas ✅✨",
  "",
  "📅 Fecha: {fecha}",
  "🕘 Hora: {hora} hs",
  "📍 Consultorio: {consultorio}",
  "",
  "Te espero para nuestra consulta 🍉",
  "",
  PAMELA_SIGN_OFF,
].join("\n");

function varsFromRow(row, professionalName) {
  return {
    nombre: patientFirstName(row),
    fecha: formatDateAR(row.appointment_date),
    hora: formatTime(row.start_time),
    consultorio: clinicLabel(row),
    profesional: professionalName || "Pamela, Lic. en Nutrición",
  };
}

function applyTemplate(template, vars) {
  let text = String(template || "");
  for (const [key, value] of Object.entries(vars)) {
    text = text.split(`{${key}}`).join(String(value ?? ""));
  }
  return text.trim();
}

function buildConfirmationMessage(row, professionalName, template) {
  return applyTemplate(
    template?.trim() || DEFAULT_CONFIRMATION,
    varsFromRow(row, professionalName)
  );
}

function buildReminderMessage(row, professionalName, template, kind = "24h") {
  const fallback =
    kind === "2h" ? DEFAULT_REMINDER_2H : DEFAULT_REMINDER_24H;
  return applyTemplate(
    template?.trim() || fallback,
    varsFromRow(row, professionalName)
  );
}

module.exports = {
  formatDateAR,
  formatTime,
  buildConfirmationMessage,
  buildReminderMessage,
  DEFAULT_CONFIRMATION,
  DEFAULT_REMINDER_24H,
  DEFAULT_REMINDER_2H,
  applyTemplate,
};
