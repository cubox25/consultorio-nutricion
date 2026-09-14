const { config } = require("./config");
const { logger } = require("./logger");
const { createSupabase, takeRemoteCommand, upsertServiceStatus } = require("./supabase");
const { createWhatsAppClient } = require("./client");
const { createPoller } = require("./poller");
const { startStatusServer } = require("./status-server");
const { getStatus } = require("./status-store");

async function main() {
  logger.info("Iniciando servicio WhatsApp (consultorio Pamela)...");
  if (config.cloudEnabled) {
    logger.warn(
      "WHATSAPP_CLOUD_ENABLED=true — este proceso NO enviará mensajes (Cloud API en Vercel)."
    );
  }
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

  async function runDisconnect() {
    if (disconnecting) {
      return { ok: false, error: "Ya hay una desconexión en curso" };
    }
    disconnecting = true;
    try {
      logger.warn("Desconectando WhatsApp…");
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
  }

  function runShowQr() {
    if (disconnecting) {
      return { ok: false, error: "Hay otra operación en curso" };
    }
    // No regenerar si ya se escaneó y está cerrando el vínculo
    if (runtime.wa.isPairing?.()) {
      logger.warn("show-qr omitido: vínculo en curso");
      return { ok: true, skipped: true, reason: "pairing" };
    }
    const snap = getStatus();
    if (snap.state === "READY") {
      return { ok: true, skipped: true, reason: "ready" };
    }
    if (snap.state === "CONNECTING") {
      logger.warn("show-qr omitido: conectando — no regenerar");
      return { ok: true, skipped: true, reason: "connecting" };
    }
    // Ya hay QR en pantalla: WhatsApp lo renueva solo con eventos "qr".
    // No hacer wipeAndReinit (eso hace que el QR “se actualice solo” cada rato).
    if (snap.state === "QR_REQUIRED" && snap.qrDataUrl) {
      logger.info("show-qr omitido: ya hay QR activo");
      return { ok: true, skipped: true, reason: "qr-active" };
    }
    disconnecting = true;
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
  }

  startStatusServer({
    getSupabase: () => supabase,
    onDisconnect: runDisconnect,
    onShowQr: async () => runShowQr(),
  });

  // El panel en Vercel (HTTPS) no puede hablar con 127.0.0.1: pide comandos por Supabase
  setInterval(() => {
    void (async () => {
      try {
        const command = await takeRemoteCommand(supabase);
        if (!command) return;
        logger.info(`Comando remoto del panel: ${command}`);
        if (command === "show-qr") runShowQr();
        else if (command === "disconnect") await runDisconnect();
      } catch (err) {
        logger.warn("Error leyendo comando remoto", err?.message || err);
      }
    })();
  }, 2000);

  runtime.poller.start();
  await runtime.wa.start();

  setInterval(() => {
    const snap = getStatus();
    if (!snap.qrDataUrl) return;
    void upsertServiceStatus(supabase, {
      state: snap.state,
      qr_required: snap.state === "QR_REQUIRED",
      details: { qrDataUrl: snap.qrDataUrl },
    });
  }, 3000);

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
