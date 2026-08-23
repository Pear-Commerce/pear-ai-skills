// MCP (Model Context Protocol) envelope around the 14 browser_* tools.
// Served by the standalone daemon at POST /mcp (Streamable HTTP style:
// plain JSON-RPC request -> JSON response; no SSE session state).
//
// tools/call results use MCP content blocks; screenshot returns an image
// block plus a short text note. Tool failures come back as
// { isError: true, content: [{ type: "text", text: "Error: ..." }] }.

import { getTool, TOOLS } from "./tools.js";

export const MCP_SERVER_INFO = { name: "chrome-bridge", version: "1.0.0" };
export const MCP_PROTOCOL_VERSION = "2024-11-05";

export function listTools() {
  return TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.argsSchema,
  }));
}

function toolResultContent(result) {
  if (result && typeof result === "object" && result.image) {
    const blocks = [
      { type: "image", data: result.image.data, mimeType: result.image.mimeType },
      { type: "text", text: result.text },
    ];
    return blocks;
  }
  return [{ type: "text", text: typeof result === "string" ? result : String(result ?? "") }];
}

export async function callTool(bridge, ctx, name, args) {
  const def = getTool(name);
  if (!def) {
    return {
      isError: true,
      content: [{ type: "text", text: `Error: unknown tool '${name}' — expected one of: ${TOOLS.map((t) => t.name).join(", ")}` }],
    };
  }
  try {
    const result = await def.run(bridge, args ?? {}, ctx);
    return { content: toolResultContent(result) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { isError: true, content: [{ type: "text", text: `Error: ${message}` }] };
  }
}

/**
 * Handle one JSON-RPC message. Returns the response object, or null for
 * notifications (which must not be answered).
 */
export async function handleRpc(bridge, ctx, msg) {
  if (msg === null || typeof msg !== "object" || Array.isArray(msg)) {
    return { jsonrpc: "2.0", id: null, error: { code: -32600, message: "invalid request" } };
  }
  const id = msg.id ?? null;
  const isNotification = msg.id === undefined;

  const fail = (code, message) => (isNotification ? null : { jsonrpc: "2.0", id, error: { code, message } });
  const ok = (result) => (isNotification ? null : { jsonrpc: "2.0", id, result });

  switch (msg.method) {
    case "initialize":
      return ok({
        protocolVersion:
          typeof msg.params?.protocolVersion === "string" ? msg.params.protocolVersion : MCP_PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: MCP_SERVER_INFO,
      });
    case "notifications/initialized":
    case "notifications/cancelled":
      return null;
    case "ping":
      return ok({});
    case "tools/list":
      return ok({ tools: listTools() });
    case "tools/call": {
      const name = msg.params?.name;
      if (typeof name !== "string") return fail(-32602, "tools/call requires params.name");
      const result = await callTool(bridge, ctx, name, msg.params?.arguments);
      return ok(result);
    }
    default:
      return fail(-32601, `method not found: ${String(msg.method)}`);
  }
}

/** POST /mcp handler for the daemon's http server. */
export async function handleHttp(req, res, bridge, ctx) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "method not allowed — POST JSON-RPC to /mcp" });
    return;
  }
  let body;
  try {
    body = await readBody(req, 1024 * 1024);
  } catch {
    sendJson(res, 413, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "request body too large" } });
    return;
  }
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    sendJson(res, 400, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } });
    return;
  }
  if (Array.isArray(parsed)) {
    const responses = [];
    for (const msg of parsed) {
      const r = await handleRpc(bridge, ctx, msg);
      if (r) responses.push(r);
    }
    // all-notification batch: acknowledge with 202 and no body
    if (responses.length === 0) {
      res.writeHead(202, { "content-type": "application/json" });
      res.end();
      return;
    }
    sendJson(res, 200, responses);
    return;
  }
  const response = await handleRpc(bridge, ctx, parsed);
  if (response === null) {
    res.writeHead(202, { "content-type": "application/json" });
    res.end();
    return;
  }
  sendJson(res, 200, response);
}

function sendJson(res, status, obj) {
  const text = JSON.stringify(obj);
  res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(text) });
  res.end(text);
}

function readBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}
