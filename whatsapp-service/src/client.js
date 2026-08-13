const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcodeTerminal = require("qrcode-terminal");
const QRCode = require("qrcode");
const { config } = require("./config");
const { logger } = require("./logger");
const { STATES, setState } = require("./status-store");
const { upsertServiceStatus } = require("./supabase");

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
function createWhatsAppClient(supabase) {
  const client = new Client({
    authStrategy: new LocalAuth({
      dataPath: config.sessionPath,
      clientId: "consultorio-pamela",
    }),
    // Pocos flags: flags de más suelen romper el init en Windows
    puppeteer: {
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
      ...(process.env.PUPPETEER_EXECUTABLE_PATH
        ? { executablePath: process.env.PUPPETEER_EXECUTABLE_PATH }
        : {}),
    },
    webVersionCache: {
      type: "none",
    },
    authTimeoutMs: 120000,
    qrMaxRetries: 8,
  });

  let ready = false;

  async function syncDb(patch) {
    await upsertServiceStatus(supabase, patch);
  }

  client.on("qr", async (qr) => {
    ready = false;
    logger.info("Esperando QR...");
    logger.info("QR generado — escanealo con WhatsApp → Dispositivos vinculados");
    logger.info("También podés escanearlo desde Admin → WhatsApp");
    qrcodeTerminal.generate(qr, { small: true });

    let qrDataUrl = null;
    try {
      qrDataUrl = await QRCode.toDataURL(qr, {
        margin: 2,
        width: 320,
        errorCorrectionLevel: "M",
      });
    } catch (err) {
      logger.warn("No se pudo generar imagen QR para el panel", err?.message);
    }

    setState(STATES.QR_REQUIRED, { lastError: null, qrDataUrl });
    await syncDb({
      state: STATES.QR_REQUIRED,
      qr_required: true,
      last_error: null,
    });
  });

  client.on("loading_screen", (percent, message) => {
    logger.info(`Cargando WhatsApp Web… ${percent}% ${message || ""}`.trim());
  });

  client.on("authenticated", async () => {
    logger.info("Autenticado (LocalAuth)");
    setState(STATES.CONNECTING, { qrDataUrl: null });
    await syncDb({ state: STATES.CONNECTING, qr_required: false });
  });

  client.on("ready", async () => {
    ready = true;
    const connectedAt = new Date().toISOString();
    logger.info("WhatsApp conectado");
    setState(STATES.READY, {
      lastConnectedAt: connectedAt,
      lastError: null,
      qrDataUrl: null,
    });
    await syncDb({
      state: STATES.READY,
      qr_required: false,
      last_connected_at: connectedAt,
      last_error: null,
    });
  });

  client.on("auth_failure", async (msg) => {
    ready = false;
    logger.error("Fallo de autenticación", msg);
    setState(STATES.ERROR, { lastError: String(msg) });
    await syncDb({
      state: STATES.ERROR,
      last_error: String(msg).slice(0, 500),
    });
  });

  client.on("disconnected", async (reason) => {
    ready = false;
    logger.warn(`Desconectado: ${reason}`);
    setState(STATES.DISCONNECTED, {
      lastError: `Desconectado: ${reason}`,
      qrDataUrl: null,
    });
    await syncDb({
      state: STATES.DISCONNECTED,
      qr_required: false,
      last_error: `Desconectado: ${reason}`.slice(0, 500),
    });
  });

  async function initializeWithRetry(maxAttempts = 3) {
    let lastError = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        logger.info(
          attempt === 1
            ? "Iniciando WhatsApp Web…"
            : `Reintento ${attempt}/${maxAttempts}…`
        );
        await client.initialize();
        return;
      } catch (err) {
        lastError = err;
        const message = err?.message || String(err);
        logger.error(`Error al iniciar (intento ${attempt})`, message);
        setState(STATES.ERROR, { lastError: message });
        await syncDb({
          state: STATES.ERROR,
          last_error: message.slice(0, 500),
        });
        try {
          await client.destroy();
        } catch {
          // ignore
        }
        if (attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, 3000 * attempt));
        }
      }
    }
    throw lastError;
  }

  return {
    client,
    isReady: () => ready,
    async start() {
      logger.info("Iniciando...");
      setState(STATES.CONNECTING);
      await syncDb({ state: STATES.CONNECTING, qr_required: false });
      await initializeWithRetry(3);
    },
    async sendText(chatId, text) {
      if (!ready) throw new Error("WhatsApp no está listo");
      return client.sendMessage(chatId, text);
    },
  };
}

module.exports = { createWhatsAppClient };
