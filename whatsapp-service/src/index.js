const { config } = require("./config");
const { logger } = require("./logger");
const { createSupabase } = require("./supabase");
const { createWhatsAppClient } = require("./client");
const { createPoller } = require("./poller");
const { startStatusServer } = require("./status-server");

async function main() {
  logger.info("Iniciando servicio WhatsApp (consultorio Pamela)...");
  logger.info(`Sesión LocalAuth en: ${config.sessionPath}`);

  const supabase = createSupabase();
  startStatusServer();

  const wa = createWhatsAppClient(supabase);
  const poller = createPoller({ supabase, wa });

  // Arrancar poller cuando esté listo; también corre cada ciclo y se auto-omite si no READY
  poller.start();
  await wa.start();

  const shutdown = async (signal) => {
    logger.warn(`Señal ${signal} — cerrando...`);
    poller.stop();
    try {
      await wa.client.destroy();
    } catch {
      // ignore
    }
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.error("Error fatal al iniciar", err?.message || err);
  process.exit(1);
});
