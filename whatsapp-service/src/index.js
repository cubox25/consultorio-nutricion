const { config } = require("./config");
const { logger } = require("./logger");
const { createSupabase } = require("./supabase");
const { createWhatsAppClient } = require("./client");
const { createPoller } = require("./poller");
const { startStatusServer } = require("./status-server");

async function main() {
  logger.info("Iniciando servicio WhatsApp (consultorio Pamela)...");
  logger.info(`Sesión LocalAuth en: ${config.sessionPath}`);

  // Evitar que errores internos de Puppeteer/whatsapp-web.js maten el proceso
  process.on("unhandledRejection", (reason) => {
    const message = reason?.message || String(reason);
    logger.error("unhandledRejection (no se cierra el servicio)", message);
  });
  process.on("uncaughtException", (err) => {
    const message = err?.message || String(err);
    // detached Frame / Target closed: recuperar sin morir
    if (
      /detached Frame/i.test(message) ||
      /Target closed/i.test(message) ||
      /Session closed/i.test(message)
    ) {
      logger.error("Excepción Puppeteer recuperable", message);
      return;
    }
    logger.error("uncaughtException", message);
  });

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
    async onShowQr() {
      if (disconnecting) {
        return { ok: false, error: "Hay otra operación en curso" };
      }
      disconnecting = true;
      // Responder ya: el QR aparece por polling, sin bloquear el panel
      void (async () => {
        try {
          logger.warn("Regenerando QR para el panel…");
          runtime.poller.stop();
          await runtime.wa.forceShowQr();
          runtime.poller = createPoller({ supabase, wa: runtime.wa });
          runtime.poller.start();
        } catch (err) {
          logger.error("No se pudo regenerar QR", err?.message || err);
        } finally {
          disconnecting = false;
        }
      })();
      return { ok: true, started: true };
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
