// Standalone daemon host: one Node process that serves
//   ws://127.0.0.1:<port>/extension   (extension WebSocket, token+origin auth)
//   http://127.0.0.1:<port>/health     (open health check)
//   http://127.0.0.1:<port>/mcp        (MCP JSON-RPC endpoint for opencode)
//
// The opencode plugin (plugin/chrome-bridge.plugin.js) hosts the SAME
// /extension + /health endpoints inside the opencode process via Bun.serve.
// Only one host can own the port at a time.

import http from "node:http";
import { ExtensionBridge } from "./bridge-core.js";
import { loadConfig, resolvePort } from "./config.js";
import { EXTENSION_ORIGIN_PREFIX, WS_PATH } from "./ext-protocol.js";
import * as mcp from "./mcp-server.js";
import { acceptWebSocket, rejectUpgrade } from "./ws.js";

export const DAEMON_VERSION = "1.0.0";

export async function startDaemon({ port, token, logger = console.error } = {}) {
  const config = loadConfig();
  const resolvedPort = port ?? resolvePort(config);
  const resolvedToken = token ?? config.token;
  const bridge = new ExtensionBridge();
  const startedAt = Date.now();
  const ctx = { port: resolvedPort, mode: "daemon" };

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (req.method === "GET" && url.pathname === "/health") {
      const body = JSON.stringify({
        ok: true,
        service: "chrome-bridge",
        mode: "daemon",
        version: DAEMON_VERSION,
        port: resolvedPort,
        connected: bridge.connected,
        uptimeMs: Date.now() - startedAt,
      });
      res.writeHead(200, { "content-type": "application/json", "content-length": Buffer.byteLength(body) });
      res.end(body);
      return;
    }
    if (url.pathname === "/mcp") {
      mcp.handleHttp(req, res, bridge, ctx).catch((err) => {
        logger(`chrome-bridge: /mcp handler error: ${err?.message ?? err}`);
        if (!res.headersSent) {
          res.writeHead(500, { "content-type": "application/json" });
        }
        res.end(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32603, message: "internal error" } }));
      });
      return;
    }
    const body = JSON.stringify({ error: "not found" });
    res.writeHead(404, { "content-type": "application/json", "content-length": Buffer.byteLength(body) });
    res.end(body);
  });

  server.on("upgrade", (req, socket, head) => {
    let url;
    try {
      url = new URL(req.url ?? "/", "http://127.0.0.1");
    } catch {
      rejectUpgrade(socket, 400, "Bad Request");
      return;
    }
    if (url.pathname !== WS_PATH) {
      rejectUpgrade(socket, 404, "Not Found");
      return;
    }
    if (url.searchParams.get("token") !== resolvedToken) {
      rejectUpgrade(socket, 401, "Unauthorized");
      return;
    }
    const origin = req.headers.origin ?? "";
    if (!origin.startsWith(EXTENSION_ORIGIN_PREFIX)) {
      rejectUpgrade(socket, 403, "Forbidden");
      return;
    }
    const conn = acceptWebSocket(req, socket, head);
    if (!conn) return;
    logger(
      `chrome-bridge: extension connected from ${req.socket.remoteAddress}:${req.socket.remotePort} ` +
        `origin=${req.headers.origin ?? "(none)"} ua=${(req.headers["user-agent"] ?? "(none)").slice(0, 80)}`,
    );
    bridge.attach(conn);
    conn.on("close", (code, reason) => logger(`chrome-bridge: extension disconnected (${code}${reason ? ` ${reason}` : ""})`));
  });

  await new Promise((resolve, reject) => {
    server.once("error", (err) => {
      if (err && err.code === "EADDRINUSE") {
        reject(
          new Error(
            `port ${resolvedPort} is already in use — is another chrome-bridge host (daemon or opencode plugin) ` +
              `already running? Stop it, or set CHROME_BRIDGE_PORT to a free port.`,
          ),
        );
      } else {
        reject(err);
      }
    });
    server.listen(resolvedPort, "127.0.0.1", resolve);
  });

  return {
    server,
    bridge,
    port: resolvedPort,
    token: resolvedToken,
    mode: "daemon",
    close() {
      bridge.dispose();
      return new Promise((resolve) => server.close(() => resolve()));
    },
  };
}
