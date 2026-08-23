// Wire protocol shared by the bridge host (daemon or plugin) and the MV3
// extension. Both sides speak JSON-RPC-ish frames over a single WebSocket:
//
//   connect:  ws://127.0.0.1:<port>/extension?token=<token>
//             Origin header MUST start with "chrome-extension://"
//   request:  { "id": "c-1", "method": "navigate", "params": {...} }   host -> extension
//   success:  { "id": "c-1", "result": {...} }                         extension -> host
//   failure:  { "id": "c-1", "error": { "message": "..." } }           extension -> host
//
// Exactly one extension may be connected at a time; a new connection replaces
// the previous one. The host sends an application-level "ping" request every
// 20s and drops the connection if it goes unanswered.

export const WS_PATH = "/extension";
export const EXTENSION_ORIGIN_PREFIX = "chrome-extension://";

export const PING_INTERVAL_MS = 20_000;
export const DEFAULT_CMD_TIMEOUT_MS = 20_000;
export const LONG_CMD_TIMEOUT_MS = 40_000; // navigate / waitFor

// Active tab group name used for last-resort tab resolution.
export const OPENCODE_GROUP_TITLE = "opencode";

// Console / network capture reads. Default-timeout commands (20s).
export const READ_CONSOLE = "readConsole";
export const READ_NETWORK = "readNetwork";

// Methods the host may call on the extension.
export const EXT_METHODS = Object.freeze([
  "ping",
  "listTabs",
  "openTab",
  "closeTab",
  "navigate",
  "goBack",
  "snapshot",
  "screenshot",
  "click",
  "type",
  "pressKey",
  "scroll",
  "waitFor",
  "evaluate",
  READ_CONSOLE,
  READ_NETWORK,
]);

export function encodeRequest(id, method, params) {
  return JSON.stringify({ id, method, params: params ?? {} });
}

export function encodeResult(id, result) {
  return JSON.stringify({ id, result: result ?? null });
}

export function encodeError(id, message) {
  return JSON.stringify({ id, error: { message: String(message ?? "unknown error") } });
}

/** Parse one incoming text frame; returns null for non-object payloads. */
export function parseMessage(data) {
  let msg;
  try {
    msg = JSON.parse(typeof data === "string" ? data : data.toString("utf8"));
  } catch {
    return null;
  }
  if (msg === null || typeof msg !== "object" || Array.isArray(msg)) return null;
  if (typeof msg.id !== "string" && typeof msg.id !== "number") return null;
  return msg;
}
