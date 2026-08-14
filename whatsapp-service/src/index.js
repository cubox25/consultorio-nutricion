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

  /** @type {{ wa: ReturnType<typeof createWhatsAppClient>, poller: ReturnType<typeof createPoller> }} */
  const runtime = {
    wa: createWhatsAppClient(supabase),
    poller: null,
  };
  runtime.poller = createPoller({ supabase, wa: runtime.wa });

  let disconnecting = false;

  startStatusServer({
    getSupabase: () => supabase,
    async onDisconnect() {
      if (disconnecting) {
        return { ok: false, error: "Ya hay una desconexión en curso" };
      }
      disconnecting = true;
      try {
        logger.warn("Solicitud de desconexión desde el panel admin");
        runtime.poller.stop();
        await runtime.wa.disconnectAndWipe();
        // Tras wipe el mismo wrapper reinició el client; recreamos poller ligado al wa actual
        runtime.poller = createPoller({ supabase, wa: runtime.wa });
        runtime.poller.start();
        return { ok: true };
      } catch (err) {
        const message = err?.message || String(err);
        try {
          runtime.poller = createPoller({ supabase, wa: runtime.wa });
          runtime.poller.start();
        } catch {
          // ignore
        }
        return { ok: false, error: message };
      } finally {
        disconnecting = false;
      }
    },
  });

  runtime.poller.start();
  await runtime.wa.start();

  const shutdown = async (signal) => {
    logger.warn(`Señal ${signal} — cerrando...`);
    runtime.poller.stop();
    try {
      await runtime.wa.client.destroy();
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
