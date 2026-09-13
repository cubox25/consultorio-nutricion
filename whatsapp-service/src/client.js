const fs = require("fs");
const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcodeTerminal = require("qrcode-terminal");
const QRCode = require("qrcode");
const { config } = require("./config");
const { logger } = require("./logger");
const { STATES, setState } = require("./status-store");
const { upsertServiceStatus } = require("./supabase");
const { friendlyWhatsAppError } = require("./friendly-error");

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
function createWhatsAppClient(supabase) {
  let client = buildClient();
  let ready = false;
  let wiping = false;
  let recovering = false;
  /** true entre "authenticated" y "ready": no regenerar QR ni wipe rápido */
  let pairing = false;
  let recoverTimer = null;

  function buildClient() {
    return new Client({
      authStrategy: new LocalAuth({
        dataPath: config.sessionPath,
        clientId: "consultorio-pamela",
      }),
      puppeteer: {
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-gpu",
          "--disable-dev-shm-usage",
          "--disable-extensions",
        ],
        ...(process.env.PUPPETEER_EXECUTABLE_PATH
          ? { executablePath: process.env.PUPPETEER_EXECUTABLE_PATH }
          : {}),
      },
      webVersionCache: {
        type: "none",
      },
      authTimeoutMs: 120000,
      qrMaxRetries: 12,
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
      pairing = false;
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

      const qrGeneratedAt = new Date().toISOString();
      setState(STATES.QR_REQUIRED, {
        lastError: null,
        qrDataUrl,
        details: { qrGeneratedAt },
      });
      await syncDb({
        state: STATES.QR_REQUIRED,
        qr_required: true,
        last_error: null,
        details: { qrDataUrl, qrGeneratedAt },
      });
    });

    c.on("loading_screen", (percent, message) => {
      logger.info(`Cargando WhatsApp Web… ${percent}% ${message || ""}`.trim());
    });

    c.on("authenticated", async () => {
      if (wiping) return;
      // Crítico: no borrar el QR en el panel hasta READY.
      // Si el panel ve CONNECTING sin QR, regenera y corta el emparejado.
      pairing = true;
      logger.info("Autenticado (LocalAuth) — finalizando vínculo…");
      setState(STATES.CONNECTING, { lastError: null });
      await syncDb({
        state: STATES.CONNECTING,
        qr_required: false,
        last_error: null,
      });
    });

    c.on("ready", async () => {
      if (wiping) return;
      ready = true;
      pairing = false;
      recovering = false;
      const connectedAt = new Date().toISOString();
      logger.info("WhatsApp conectado");
      setState(STATES.READY, {
        lastConnectedAt: connectedAt,
        lastError: null,
        qrDataUrl: null,
        details: { qrGeneratedAt: null },
      });
      await syncDb({
        state: STATES.READY,
        qr_required: false,
        last_connected_at: connectedAt,
        last_error: null,
        details: { qrDataUrl: null, qrGeneratedAt: null },
      });
    });

    c.on("auth_failure", (msg) => {
      ready = false;
      pairing = false;
      logger.error("Fallo de autenticación", msg);
      const friendly = friendlyWhatsAppError(msg);
      setState(STATES.ERROR, { lastError: friendly, qrDataUrl: null });
      void syncDb({
        state: STATES.ERROR,
        last_error: friendly.slice(0, 500),
      });
      scheduleRecover(`auth_failure`);
    });

    c.on("disconnected", (reason) => {
      if (wiping) return;
      ready = false;
      const reasonText = String(reason || "unknown");
      logger.warn(`Desconectado: ${reasonText}`);

      // Durante el vínculo (post-QR) WhatsApp a veces emite un "disconnected"
      // transitorio. No borrar la sesión al instante: deja terminar el ready.
      if (pairing) {
        logger.warn(
          "Desconexión durante emparejado — se espera antes de recuperar"
        );
        pairing = false;
        const friendly = friendlyWhatsAppError(`Desconectado: ${reasonText}`);
        setState(STATES.DISCONNECTED, {
          lastError: friendly,
        });
        void syncDb({
          state: STATES.DISCONNECTED,
          qr_required: false,
          last_error: friendly.slice(0, 500),
        });
        scheduleRecover(reasonText, 8000);
        return;
      }

      pairing = false;
      const friendly = friendlyWhatsAppError(`Desconectado: ${reasonText}`);
      setState(STATES.DISCONNECTED, {
        lastError: friendly,
        qrDataUrl: null,
      });
      void syncDb({
        state: STATES.DISCONNECTED,
        qr_required: false,
        last_error: friendly.slice(0, 500),
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
        const friendly = friendlyWhatsAppError(message);
        setState(STATES.ERROR, { lastError: friendly });
        await syncDb({
          state: STATES.ERROR,
          last_error: friendly.slice(0, 500),
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
    pairing = false;
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

  function scheduleRecover(reasonText, delayMs = 2500) {
    if (wiping || recovering) {
      logger.info("Recuperación ya programada/en curso — se omite duplicado");
      return;
    }
    recovering = true;
    if (recoverTimer) clearTimeout(recoverTimer);

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
    isPairing: () => pairing,
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
      pairing = false;
      // Desde panel: intentar logout limpio, pero si falla igual wipe
      await wipeAndReinit("panel-disconnect", { tryLogout: true });
    },
    async forceShowQr() {
      // Si ya se escaneó y está cerrando el vínculo, no regenerar (corta el login).
      if (pairing || wiping) {
        logger.warn("forceShowQr omitido: hay un vínculo en curso");
        return { ok: true, skipped: true, reason: "pairing" };
      }
      const snap = require("./status-store").getStatus();
      if (snap.state === STATES.READY) {
        logger.warn("forceShowQr omitido: ya está READY");
        return { ok: true, skipped: true, reason: "ready" };
      }
      if (snap.state === STATES.CONNECTING && snap.qrDataUrl) {
        logger.warn(
          "forceShowQr omitido: conectando con QR reciente — esperá el READY"
        );
        return { ok: true, skipped: true, reason: "connecting" };
      }
      if (recoverTimer) {
        clearTimeout(recoverTimer);
        recoverTimer = null;
      }
      recovering = false;
      await wipeAndReinit("force-qr", { tryLogout: false });
      return { ok: true };
    },
  };
}

module.exports = { createWhatsAppClient };
