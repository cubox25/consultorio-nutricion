/** Plantillas por defecto — placeholders: {fecha} {hora} {consultorio} */

export const PAMELA_WHATSAPP_DISPLAY = "3816617606";
export const PAMELA_WHATSAPP_LINK = "https://wa.me/5493816617606";

const PAMELA_SIGN_OFF = [
  `Si necesitás cancelar o modificar el turno, por favor escribime directamente a mi WhatsApp:`,
  `📲 ${PAMELA_WHATSAPP_LINK}`,
  "",
  "✨ ¡Gracias por elegirme y nos vemos pronto!",
  "",
  "Pamela Guerrero - Lic. En Nutrición",
  "MP 1626",
].join("\n");

export const DEFAULT_WA_CONFIRMATION = [
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

export const DEFAULT_WA_REMINDER_24H = [
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

export const DEFAULT_WA_REMINDER_2H = [
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

const META_SIGN_OFF = [
  "Si necesitás cancelar o modificar el turno, por favor escribime directamente a mi WhatsApp:",
  `📲 ${PAMELA_WHATSAPP_LINK}`,
  "",
  "✨ ¡Gracias por elegirme y nos vemos pronto!",
  "",
  "Pamela Guerrero - Lic. En Nutrición",
  "MP 1626",
].join("\n");

/** Cuerpos para WhatsApp Manager. Variables: {{1}} fecha, {{2}} hora, {{3}} consultorio. */
export const META_TEMPLATE_BODIES = {
  turno_confirmado: [
    "🌸 ¡Hola! Soy Pamela, Lic. en Nutrición.",
    "",
    "Te escribo para confirmarte que tu turno quedó reservado ✅✨",
    "",
    "📅 Fecha: {{1}}",
    "🕘 Hora: {{2}} hs",
    "📍 Consultorio: {{3}}",
    "",
    "Te espero para nuestra consulta 🍉",
    "",
    META_SIGN_OFF,
  ].join("\n"),
  recordatorio_24h: [
    "🌸 ¡Hola! Soy Pamela, Lic. en Nutrición.",
    "",
    "Te escribo para recordarte tu turno ✅✨",
    "",
    "📅 Fecha: {{1}}",
    "🕘 Hora: {{2}} hs",
    "📍 Consultorio: {{3}}",
    "",
    "Te espero para nuestra consulta 🍉",
    "",
    META_SIGN_OFF,
  ].join("\n"),
  recordatorio_2h: [
    "🌸 ¡Hola! Soy Pamela, Lic. en Nutrición.",
    "",
    "Te escribo para recordarte que tu turno es en aproximadamente 2 horas ✅✨",
    "",
    "📅 Fecha: {{1}}",
    "🕘 Hora: {{2}} hs",
    "📍 Consultorio: {{3}}",
    "",
    "Te espero para nuestra consulta 🍉",
    "",
    META_SIGN_OFF,
  ].join("\n"),
} as const;
