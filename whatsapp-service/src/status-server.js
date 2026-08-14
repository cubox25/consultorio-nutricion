const http = require("http");
const { config } = require("./config");
const { getStatus } = require("./status-store");
const { logger } = require("./logger");
const { countOutboundByStatus } = require("./supabase");

/**
 * @param {{
 *   onDisconnect?: () => Promise<{ ok: boolean, error?: string }>,
 *   getSupabase?: () => import('@supabase/supabase-js').SupabaseClient | null,
 * }} [handlers]
 */
function startStatusServer(handlers = {}) {
  const server = http.createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "http://localhost:3000");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

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

    if (req.method === "POST" && url === "/disconnect") {
      if (!handlers.onDisconnect) {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "Desconexión no disponible" }));
        return;
      }
      try {
        const result = await handlers.onDisconnect();
        const code = result?.ok ? 200 : 500;
        res.writeHead(code, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result || { ok: true }));
      } catch (err) {
        const message = err?.message || String(err);
        logger.error("Error en /disconnect", message);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: message }));
      }
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
