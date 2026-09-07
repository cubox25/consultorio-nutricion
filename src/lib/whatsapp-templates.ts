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
