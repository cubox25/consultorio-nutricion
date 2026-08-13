/**
 * Cierra la sesión LocalAuth (desvincula el dispositivo).
 * Uso: npm run logout
 */
const fs = require("fs");
const path = require("path");
const { config } = require("./config");
const { logger } = require("./logger");

const sessionDir = config.sessionPath;

if (!fs.existsSync(sessionDir)) {
  logger.info("No hay carpeta de sesión para borrar.");
  process.exit(0);
}

fs.rmSync(sessionDir, { recursive: true, force: true });
logger.info(`Sesión eliminada: ${sessionDir}`);
logger.info("La próxima vez que inicies el servicio deberás escanear el QR de nuevo.");
