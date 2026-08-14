const fs = require("fs");
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
  let client = buildClient();
  let ready = false;
  let wiping = false;
  let recovering = false;
  let recoverTimer = null;

  function buildClient() {
    return new Client({
      authStrategy: new LocalAuth({
        dataPath: config.sessionPath,
        clientId: "consultorio-pamela",
      }),
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
  }

  async function syncDb(patch) {
    await upsertServiceStatus(supabase, patch);
  }

  function safeDestroy(c) {
    return Promise.resolve()
      .then(async () => {
        if (!c) return;
        try {
          // Evitar logout() tras LOGOUT remoto: Puppeteer ya tiene el Frame detached
          // y tira "Attempted to use detached Frame" (crashea el proceso).
          await c.destroy();
        } catch (err) {
          logger.warn("destroy():", err?.message || err);
        }
      })
      .catch((err) => {
        logger.warn("safeDestroy:", err?.message || err);
      });
  }

  function bindEvents(c) {
    c.on("qr", async (qr) => {
      if (wiping) return;
      ready = false;
      logger.info("Esperando QR...");
      logger.info("QR generado — escanealo con WhatsApp → Dispositivos vinculados");
      logger.info("También podés escanearlo desde Admin → WhatsApp");
      try {
        qrcodeTerminal.generate(qr, { small: true });
      } catch {
        // ignore terminal qr errors
      }

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

    c.on("loading_screen", (percent, message) => {
      logger.info(`Cargando WhatsApp Web… ${percent}% ${message || ""}`.trim());
    });

    c.on("authenticated", async () => {
      if (wiping) return;
      logger.info("Autenticado (LocalAuth)");
      setState(STATES.CONNECTING, { qrDataUrl: null });
      await syncDb({ state: STATES.CONNECTING, qr_required: false });
    });

    c.on("ready", async () => {
      if (wiping) return;
      ready = true;
      recovering = false;
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

    c.on("auth_failure", (msg) => {
      ready = false;
      logger.error("Fallo de autenticación", msg);
      setState(STATES.ERROR, { lastError: String(msg) });
      void syncDb({
        state: STATES.ERROR,
        last_error: String(msg).slice(0, 500),
      });
      scheduleRecover(`auth_failure`);
    });

    c.on("disconnected", (reason) => {
      if (wiping) return;
      ready = false;
      const reasonText = String(reason || "unknown");
      logger.warn(`Desconectado: ${reasonText}`);
      setState(STATES.DISCONNECTED, {
        lastError: `Desconectado: ${reasonText}`,
        qrDataUrl: null,
      });
      void syncDb({
        state: STATES.DISCONNECTED,
        qr_required: false,
        last_error: `Desconectado: ${reasonText}`.slice(0, 500),
      });
      scheduleRecover(reasonText);
    });
  }

  bindEvents(client);

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
        await safeDestroy(client);
        if (attempt < maxAttempts) {
          client = buildClient();
          bindEvents(client);
          await new Promise((r) => setTimeout(r, 3000 * attempt));
        }
      }
    }
    throw lastError;
  }

  async function wipeSessionFilesAsync() {
    const sessionDir = config.sessionPath;
    if (!fs.existsSync(sessionDir)) {
      logger.info("No había carpeta de sesión LocalAuth para borrar");
      return;
    }
    let lastErr = null;
    for (let i = 0; i < 6; i++) {
      try {
        fs.rmSync(sessionDir, { recursive: true, force: true });
        logger.info(`Sesión LocalAuth eliminada: ${sessionDir}`);
        return;
      } catch (err) {
        lastErr = err;
        await new Promise((r) => setTimeout(r, 500 * (i + 1)));
      }
    }
    throw lastErr || new Error("No se pudo borrar la sesión");
  }

  /**
   * @param {string} reasonLabel
   * @param {{ tryLogout?: boolean }} [opts]
   */
  async function wipeAndReinit(reasonLabel = "manual", opts = {}) {
    if (wiping) {
      logger.warn("wipeAndReinit ya en curso — se omite");
      return;
    }
    wiping = true;
    ready = false;
    const tryLogout = opts.tryLogout === true;

    logger.warn(`Limpiando sesión WhatsApp (${reasonLabel})…`);
    setState(STATES.CONNECTING, {
      lastError: null,
      qrDataUrl: null,
    });
    await syncDb({
      state: STATES.CONNECTING,
      qr_required: false,
      last_error: null,
    });

    const oldClient = client;

    // Solo intentar logout si el usuario lo pidió desde el panel y aún estaba connected.
    // Tras LOGOUT remoto, logout() rompe Puppeteer (detached Frame).
    if (tryLogout) {
      try {
        await Promise.race([
          oldClient.logout(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("logout timeout")), 8000)
          ),
        ]);
      } catch (err) {
        logger.warn("logout():", err?.message || err);
      }
    }

    await safeDestroy(oldClient);
    await new Promise((r) => setTimeout(r, 2000));

    try {
      await wipeSessionFilesAsync();
    } catch (err) {
      const message = err?.message || String(err);
      logger.error("No se pudo borrar la carpeta de sesión", message);
      setState(STATES.ERROR, { lastError: message });
      await syncDb({
        state: STATES.ERROR,
        last_error: `Error al borrar sesión: ${message}`.slice(0, 500),
      });
      wiping = false;
      recovering = false;
      throw err;
    }

    client = buildClient();
    bindEvents(client);
    wiping = false;

    logger.info("Sesión limpia — reiniciando para mostrar QR…");
    setState(STATES.CONNECTING, { qrDataUrl: null });
    await syncDb({ state: STATES.CONNECTING, qr_required: false });

    try {
      await initializeWithRetry(3);
    } catch (err) {
      recovering = false;
      throw err;
    }
  }

  function scheduleRecover(reasonText) {
    if (wiping || recovering) {
      logger.info("Recuperación ya programada/en curso — se omite duplicado");
      return;
    }
    recovering = true;
    if (recoverTimer) clearTimeout(recoverTimer);

    const delayMs = 2500;
    logger.info(
      `Recuperación automática en ${delayMs}ms (motivo: ${reasonText})…`
    );

    recoverTimer = setTimeout(() => {
      recoverTimer = null;
      void (async () => {
        try {
          // Nunca logout() en recover: la sesión ya está muerta
          await wipeAndReinit(`recover:${reasonText}`, { tryLogout: false });
        } catch (err) {
          logger.error(
            "Falló la recuperación automática",
            err?.message || err
          );
          recovering = false;
          setState(STATES.ERROR, {
            lastError: err?.message || String(err),
          });
        }
      })();
    }, delayMs);
  }

  return {
    get client() {
      return client;
    },
    isReady: () => ready && !wiping,
    async start() {
      logger.info("Iniciando...");
      setState(STATES.CONNECTING);
      await syncDb({ state: STATES.CONNECTING, qr_required: false });
      await initializeWithRetry(3);
    },
    async sendText(chatId, text) {
      if (!ready || wiping) throw new Error("WhatsApp no está listo");
      return client.sendMessage(chatId, text);
    },
    async disconnectAndWipe() {
      if (recoverTimer) {
        clearTimeout(recoverTimer);
        recoverTimer = null;
      }
      recovering = false;
      // Desde panel: intentar logout limpio, pero si falla igual wipe
      await wipeAndReinit("panel-disconnect", { tryLogout: true });
    },
    async forceShowQr() {
      if (recoverTimer) {
        clearTimeout(recoverTimer);
        recoverTimer = null;
      }
      recovering = false;
      await wipeAndReinit("force-qr", { tryLogout: false });
    },
  };
}

module.exports = { createWhatsAppClient };
