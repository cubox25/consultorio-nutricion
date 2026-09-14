/** Plantillas por defecto — placeholders: {nombre} {fecha} {hora} {consultorio} {profesional} */

export const DEFAULT_WA_CONFIRMATION = [
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

export const DEFAULT_WA_REMINDER_24H = [
  "Hola {nombre} 👋",
  "",
  "Te recordamos tu turno con {profesional}.",
  "",
  "📅 Fecha: {fecha}",
  "🕐 Hora: {hora}",
  "",
  "📍 Consultorio: {consultorio}",
  "",
  "¡Te esperamos! 💚",
].join("\n");

export const DEFAULT_WA_REMINDER_2H = [
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

/** Cuerpos sugeridos para Message Templates de Meta (variables {{1}}…{{5}}). */
export const META_TEMPLATE_BODIES = {
  turno_confirmado: [
    "Hola {{1}}",
    "",
    "Tu turno con {{2}} fue confirmado.",
    "",
    "Fecha: {{3}}",
    "Hora: {{4}}",
    "Consultorio: {{5}}",
    "",
    "Si necesitás cancelar o modificar tu turno, por favor comunicate con nosotros.",
    "",
    "Te esperamos.",
  ].join("\n"),
  recordatorio_24h: [
    "Hola {{1}}",
    "",
    "Te recordamos tu turno con {{2}}.",
    "",
    "Fecha: {{3}}",
    "Hora: {{4}}",
    "Consultorio: {{5}}",
    "",
    "Te esperamos.",
  ].join("\n"),
  recordatorio_2h: [
    "Hola {{1}}",
    "",
    "Te recordamos tu turno con {{2}} en aproximadamente 2 horas.",
    "",
    "Fecha: {{3}}",
    "Hora: {{4}}",
    "Consultorio: {{5}}",
    "",
    "Te esperamos.",
  ].join("\n"),
} as const;
