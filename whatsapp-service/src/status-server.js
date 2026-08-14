const http = require("http");
const { config } = require("./config");
const { getStatus } = require("./status-store");
const { logger } = require("./logger");
const { countOutboundByStatus } = require("./supabase");

function isLocalDevOrigin(origin) {
  if (!origin) return false;
  try {
    const u = new URL(origin);
    const host = u.hostname.toLowerCase();
    return (
      (host === "localhost" || host === "127.0.0.1") &&
      (u.protocol === "http:" || u.protocol === "https:")
    );
  } catch {
    return false;
  }
}

function applyCors(req, res) {
  const origin = req.headers.origin;
  if (origin && isLocalDevOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  } else if (!origin) {
    // same-origin / herramientas locales sin Origin
    res.setHeader("Access-Control-Allow-Origin", "*");
  }
  // Si el Origin no es local, no abrimos CORS (el panel admin local sí funciona).
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

/**
 * @param {{
 *   onDisconnect?: () => Promise<{ ok: boolean, error?: string }>,
 *   onShowQr?: () => Promise<{ ok: boolean, error?: string }>,
 *   getSupabase?: () => import('@supabase/supabase-js').SupabaseClient | null,
 * }} [handlers]
 */
function startStatusServer(handlers = {}) {
  const server = http.createServer(async (req, res) => {
    applyCors(req, res);

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = req.url?.split("?")[0] || "";

    if (req.method === "GET" && (url === "/health" || url === "/status")) {
      let outbound = null;
      try {
        const supabase = handlers.getSupabase?.();
        if (supabase) outbound = await countOutboundByStatus(supabase);
      } catch {
        outbound = null;
      }

      const body = JSON.stringify({
        ok: true,
        service: "whatsapp-service",
        ...getStatus(),
        outbound,
      });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(body);
      return;
    }

    async function handleAction(handler, label) {
      if (!handler) {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: `${label} no disponible` }));
        return;
      }
      try {
        const result = await handler();
        const code = result?.ok ? 200 : 500;
        res.writeHead(code, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result || { ok: true }));
      } catch (err) {
        const message = err?.message || String(err);
        logger.error(`Error en ${label}`, message);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: message }));
      }
    }

    if (req.method === "POST" && url === "/disconnect") {
      await handleAction(handlers.onDisconnect, "/disconnect");
      return;
    }

    if (req.method === "POST" && (url === "/show-qr" || url === "/reconnect")) {
      await handleAction(
        handlers.onShowQr || handlers.onDisconnect,
        url
      );
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  });

  server.listen(config.statusPort, "127.0.0.1", () => {
    logger.info(
      `API de estado en http://127.0.0.1:${config.statusPort}/status`
    );
  });

  return server;
}

module.exports = { startStatusServer };
