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
  const guest = row.guest_first_name?.trim();
  const patient = row.patient?.first_name?.trim();
  return guest || patient || "hola";
}

function clinicLabel(row) {
  const name = row.clinic?.name?.trim();
  const address = row.clinic?.address?.trim();
  if (name && address) return `${name} — ${address}`;
  return address || name || "Consultorio";
}

const DEFAULT_CONFIRMATION = [
  "Hola {nombre} 👋",
  "",
  "Tu turno con {profesional} fue confirmado.",
  "",
  "📅 Fecha: {fecha}",
  "🕐 Hora: {hora}",
  "",
  "📍 Consultorio: {consultorio}",
  "",
  "Si necesitás cancelar o modificar tu turno, por favor comunicate con nosotros.",
  "",
  "¡Te esperamos! 💚",
].join("\n");

const DEFAULT_REMINDER_24H = [
  "Hola {nombre} 👋",
  "",
  "Te recordamos tu turno con {profesional} para mañana.",
  "",
  "📅 Fecha: {fecha}",
  "🕐 Hora: {hora}",
  "",
  "📍 Consultorio: {consultorio}",
  "",
  "¡Te esperamos! 💚",
].join("\n");

const DEFAULT_REMINDER_2H = [
  "Hola {nombre} 👋",
  "",
  "Te recordamos tu turno con {profesional} en aproximadamente 2 horas.",
  "",
  "📅 Fecha: {fecha}",
  "🕐 Hora: {hora}",
  "",
  "📍 Consultorio: {consultorio}",
  "",
  "¡Te esperamos! 💚",
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
