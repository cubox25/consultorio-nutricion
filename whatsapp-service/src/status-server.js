const http = require("http");
const { config } = require("./config");
const { getStatus } = require("./status-store");
const { logger } = require("./logger");

function startStatusServer() {
  const server = http.createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "http://localhost:3000");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.url === "/health" || req.url === "/status") {
      const body = JSON.stringify({
        ok: true,
        service: "whatsapp-service",
        ...getStatus(),
      });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(body);
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
