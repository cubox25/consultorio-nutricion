const path = require("path");
const fs = require("fs");
const os = require("os");
const dotenv = require("dotenv");

// Cargar .env del servicio; si falta, intentar .env.local del proyecto raíz
const serviceEnv = path.join(__dirname, "..", ".env");
const rootEnvLocal = path.join(__dirname, "..", "..", ".env.local");
const rootEnv = path.join(__dirname, "..", "..", ".env");

if (fs.existsSync(serviceEnv)) {
  dotenv.config({ path: serviceEnv });
} else if (fs.existsSync(rootEnvLocal)) {
  dotenv.config({ path: rootEnvLocal });
} else if (fs.existsSync(rootEnv)) {
  dotenv.config({ path: rootEnv });
} else {
  dotenv.config();
}

function bool(value, fallback = false) {
  if (value == null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function int(value, fallback) {
  const n = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) ? n : fallback;
}

// Evitar OneDrive: Chromium/LocalAuth fallan con sincronización de archivos
const defaultSessionPath = path.join(
  process.env.LOCALAPPDATA || os.homedir(),
  "consultorio-pamela-whatsapp-session"
);

const config = {
  supabaseUrl:
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "",
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  confirmationEnabled: bool(process.env.WHATSAPP_CONFIRMATION_ENABLED, true),
  reminder24hEnabled: bool(process.env.WHATSAPP_REMINDER_24H_ENABLED, true),
  reminder2hEnabled: bool(process.env.WHATSAPP_REMINDER_2H_ENABLED, false),
  pollIntervalMs: int(process.env.WHATSAPP_POLL_INTERVAL, 60_000),
  reminderWindowMinutes: int(process.env.WHATSAPP_REMINDER_WINDOW_MINUTES, 30),
  statusPort: int(process.env.WHATSAPP_STATUS_PORT, 3100),
  timezone: process.env.WHATSAPP_TIMEZONE || "America/Argentina/Buenos_Aires",
  professionalName:
    process.env.WHATSAPP_PROFESSIONAL_NAME || "Pamela, Lic. en Nutrición",
  sessionPath: process.env.WHATSAPP_SESSION_PATH || defaultSessionPath,
};

module.exports = { config };
