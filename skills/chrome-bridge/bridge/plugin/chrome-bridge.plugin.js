// chrome-bridge — opencode plugin (self-contained, zero npm imports).
//
// Runs INSIDE the opencode server process (Bun runtime) and registers the 16
// native browser_* tools while hosting the extension-facing WebSocket server
// itself via Bun.serve({ websocket }). Speaks the exact same wire protocol to
// the MV3 extension as the standalone daemon (src/ext-protocol.js):
//
//   ws://127.0.0.1:<port>/extension?token=<token>   Origin: chrome-extension://*
//   {id, method, params} -> {id, result} | {id, error: {message}}
//
// Shares the daemon's config: $CHROME_BRIDGE_DATA_DIR or
// ~/.opencode-chrome-bridge/config.json (token generated + persisted on first
// use). Port: $CHROME_BRIDGE_PORT -> config.port -> 8823.
//
// Tool shape matches opencode's plugin API (verified against
// packages/opencode/src/tool/registry.ts `fromPlugin`):
//   { description, args: <per-property JSON Schema map>, execute(args, ctx) }
// `execute` returns a string (or never throws — failures return clean
// "Error: ..." text). A `executes` alias is provided for hosts that look up
// the plural key. With non-Zod args opencode builds the LLM-facing schema via
// its legacy JSON-schema path, which marks every listed property required —
// so optional args are typed ["<t>","null"] and handlers treat
// null/""/0/-1 as "not provided".

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

// ---------------------------------------------------------------------------
// config (inline port of src/config.js — keep behavior identical)
// ---------------------------------------------------------------------------

const DEFAULT_PORT = 8823;
const PLUGIN_VERSION = "1.0.0";

function getDataDir() {
  const override = process.env.CHROME_BRIDGE_DATA_DIR;
  if (override && override.trim()) return path.resolve(override);
  return path.join(os.homedir(), ".opencode-chrome-bridge");
}

function getConfigPath() {
  return path.join(getDataDir(), "config.json");
}

function isValidPort(value) {
  return Number.isInteger(value) && value > 0 && value <= 65535;
}

function loadConfig() {
  const file = getConfigPath();
  let cfg = {};
  let parsed = false;
  try {
    cfg = JSON.parse(fs.readFileSync(file, "utf8"));
    parsed = true;
  } catch {
    cfg = {};
  }
  if (cfg === null || typeof cfg !== "object" || Array.isArray(cfg)) cfg = {};

  let changed = !parsed;
  if (typeof cfg.token !== "string" || cfg.token.length < 16) {
    cfg.token = crypto.randomBytes(24).toString("base64url");
    changed = true;
  }
  if (cfg.port !== undefined && !isValidPort(cfg.port)) {
    delete cfg.port;
    changed = true;
  }
  if (changed) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + "\n", { mode: 0o600 });
  }
  return cfg;
}

function resolvePort(cfg) {
  const env = process.env.CHROME_BRIDGE_PORT;
  if (env && /^\d+$/.test(env.trim())) {
    const n = Number(env.trim());
    if (isValidPort(n)) return n;
  }
  if (cfg && isValidPort(cfg.port)) return cfg.port;
  return DEFAULT_PORT;
}

// ---------------------------------------------------------------------------
// protocol constants (mirror src/ext-protocol.js)
// ---------------------------------------------------------------------------

const WS_PATH = "/extension";
const EXTENSION_ORIGIN_PREFIX = "chrome-extension://";
const PING_INTERVAL_MS = 20_000;
const DEFAULT_CMD_TIMEOUT_MS = 20_000;
const LONG_CMD_TIMEOUT_MS = 40_000;
const OPENCODE_GROUP_TITLE = "opencode";
const NOT_CONNECTED_ERROR =
  "not connected to the Chrome extension — open Chrome with the chrome-bridge extension installed and paired (same token/port)";

// How long callRaw waits for a suspended service worker to reconnect.
const RECONNECT_WAIT_MS = 25_000;

function encodeRequest(id, method, params) {
  return JSON.stringify({ id, method, params: params ?? {} });
}

function parseMessage(data) {
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

// ---------------------------------------------------------------------------
// bridge (inline port of src/bridge-core.js, adapted to Bun ServerWebSocket)
// ---------------------------------------------------------------------------

class PluginBridge {
  constructor() {
    this._ext = null; // { ws, connectedAt }
    this._pending = new Map(); // id -> { resolve, reject, timer, method }
    this._nextId = 1;
    this._tabQueues = new Map();
    this._pingTimer = null;
    this._pingInFlight = false;
    this.lastUsedTabId = null;
  }

  get connected() {
    return this._ext !== null;
  }

  get connectedAt() {
    return this._ext?.connectedAt ?? null;
  }

  /** Called from the Bun websocket `open` handler. New replaces old. */
  attachSocket(ws) {
    if (this._ext) {
      const old = this._ext.ws;
      this._ext = null;
      this._stopPing();
      // MV3 service workers die and reconnect routinely. Calls in flight on
      // the old socket are re-dispatched on the new one (same id) instead of
      // being rejected — a restart becomes a latency blip, not an error.
      this._redispatchPending();
      try {
        old.close(1000, "replaced by new extension connection");
      } catch {
        // already gone
      }
    }
    this._ext = { ws, connectedAt: Date.now() };
    this._startPing();
  }

  _redispatchPending() {
    for (const [id, p] of this._pending) {
      clearTimeout(p.timer);
      p.timer = setTimeout(() => {
        this._pending.delete(id);
        p.reject(new Error(`extension command '${p.method}' timed out after ${p.timeoutMs}ms`));
      }, p.timeoutMs);
      try {
        this._ext?.ws.send(encodeRequest(id, p.method, p.params));
      } catch (err) {
        this._pending.delete(id);
        p.reject(err);
      }
    }
  }

  /** Called from the Bun websocket `message` handler. */
  handleMessage(ws, data) {
    if (!this._ext || this._ext.ws !== ws) return;
    const msg = parseMessage(data);
    if (!msg) return;
    const id = String(msg.id);
    const p = this._pending.get(id);
    if (!p) return;
    this._pending.delete(id);
    clearTimeout(p.timer);
    if (msg.error) {
      const raw = msg.error && typeof msg.error === "object" ? msg.error.message : msg.error;
      p.reject(new Error(`extension '${p.method}' failed: ${raw ?? "unknown error"}`));
    } else {
      p.resolve(msg.result);
    }
  }

  /** Called from the Bun websocket `close` handler. */
  handleClose(ws) {
    if (!this._ext || this._ext.ws !== ws) return;
    this._ext = null;
    this._stopPing();
    // Pending calls are NOT rejected here: a suspended service worker
    // typically reconnects within seconds and attachSocket() re-dispatches
    // them; each call's own timeout is the failure path.
  }

  _rejectAllPending(err) {
    for (const [, p] of this._pending) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    this._pending.clear();
  }

  _startPing() {
    this._stopPing();
    this._pingTimer = setInterval(() => {
      if (!this.connected || this._pingInFlight) return;
      this._pingInFlight = true;
      this.callRaw("ping", {}, DEFAULT_CMD_TIMEOUT_MS)
        .catch(() => {
          try {
            this._ext?.ws.close(1001, "ping timeout");
          } catch {
            // already gone
          }
        })
        .finally(() => {
          this._pingInFlight = false;
        });
    }, PING_INTERVAL_MS);
    this._pingTimer.unref?.();
  }

  _stopPing() {
    if (this._pingTimer) {
      clearInterval(this._pingTimer);
      this._pingTimer = null;
    }
    this._pingInFlight = false;
  }

  async callRaw(method, params = {}, timeoutMs = DEFAULT_CMD_TIMEOUT_MS) {
    // Tolerate the gap while a suspended service worker restarts and
    // reconnects (alarm-driven, normally <30s) instead of failing fast.
    const deadline = Date.now() + RECONNECT_WAIT_MS;
    while (!this._ext) {
      if (Date.now() >= deadline) throw new Error(NOT_CONNECTED_ERROR);
      await new Promise((r) => setTimeout(r, 100));
    }
    const id = `c-${this._nextId++}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pending.delete(id);
        reject(new Error(`extension command '${method}' timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      timer.unref?.();
      this._pending.set(id, { resolve, reject, timer, method, params, timeoutMs });
      try {
        this._ext.ws.send(encodeRequest(id, method, params));
      } catch (err) {
        clearTimeout(timer);
        this._pending.delete(id);
        reject(err);
      }
    });
  }

  call(method, params = {}, { timeoutMs = DEFAULT_CMD_TIMEOUT_MS } = {}) {
    const tabId = params?.tabId;
    if (Number.isInteger(tabId) && tabId > 0) {
      return this._enqueueTab(tabId, () => this.callRaw(method, params, timeoutMs));
    }
    return this.callRaw(method, params, timeoutMs);
  }

  _enqueueTab(tabId, fn) {
    const prev = this._tabQueues.get(tabId) ?? Promise.resolve();
    const run = prev.catch(() => {}).then(fn);
    this._tabQueues.set(tabId, run);
    run
      .finally(() => {
        if (this._tabQueues.get(tabId) === run) this._tabQueues.delete(tabId);
      })
      .catch(() => {});
    return run;
  }

  markUsed(tabId) {
    if (Number.isInteger(tabId) && tabId > 0) this.lastUsedTabId = tabId;
  }

  clearUsed(tabId) {
    if (this.lastUsedTabId === tabId) this.lastUsedTabId = null;
  }

  async resolveTabId(explicit) {
    if (Number.isInteger(explicit) && explicit > 0) return explicit;
    if (!this.connected) throw new Error(NOT_CONNECTED_ERROR);
    const tabs = await this.callRaw("listTabs", {});
    const list = Array.isArray(tabs) ? tabs : [];
    if (this.lastUsedTabId !== null && list.some((t) => t?.id === this.lastUsedTabId)) {
      return this.lastUsedTabId;
    }
    const active = list.find((t) => t?.active && t?.groupTitle === OPENCODE_GROUP_TITLE);
    if (active) return active.id;
    throw new Error(
      `no target tab — pass tabId, run any tab command first (sets the last-used tab), ` +
        `or activate a tab in the "${OPENCODE_GROUP_TITLE}" tab group`,
    );
  }
}

// ---------------------------------------------------------------------------
// tools (inline 1:1 copy of src/tools.js — same 16 tools, names, JSON-schema
// args, teaching descriptions, result text, and clean-error behavior)
// ---------------------------------------------------------------------------

const TAB_ID = {
  type: ["integer", "null"],
  description:
    "Target tab id. Optional: pass null (or omit where the host allows) to use the last-used tab, else the active tab in the \"opencode\" tab group.",
};

function optTabId(args) {
  const n = args?.tabId;
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

function needString(value, name, hint) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${name} is required — ${hint}`);
  }
  return value;
}

function clampInt(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

async function resolveTab(bridge, args) {
  return bridge.resolveTabId(optTabId(args));
}

const TOOLS = [
  {
    name: "browser_status",
    description:
      "Report chrome-bridge connection state: whether the Chrome extension is connected, the tab count, and the last-used tab. Cheap and safe — call this first if a browser tool fails with a connection error.",
    argsSchema: { type: "object", properties: {}, additionalProperties: false },
    run: async (bridge, _args, ctx) => {
      const out = { connected: bridge.connected, mode: ctx.mode, port: ctx.port };
      if (bridge.connected) {
        try {
          const tabs = await bridge.callRaw("listTabs", {});
          out.tabCount = Array.isArray(tabs) ? tabs.length : 0;
          const active = (tabs ?? []).find((t) => t?.active);
          if (active) out.activeTabId = active.id;
        } catch {
          out.tabCount = null;
        }
        out.lastUsedTabId = bridge.lastUsedTabId;
      }
      return JSON.stringify(out);
    },
  },
  {
    name: "browser_list_tabs",
    description:
      "List every open browser tab: id, title, url, active flag, and tab group. Use the ids with other browser_* tools' tabId argument when you need to target a specific tab.",
    argsSchema: { type: "object", properties: {}, additionalProperties: false },
    run: async (bridge) => {
      const tabs = await bridge.callRaw("listTabs", {});
      return JSON.stringify(tabs ?? [], null, 2);
    },
  },
  {
    name: "browser_open_tab",
    description: "Open a new browser tab on the given URL and make it the last-used tab. Returns the new tabId.",
    argsSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "Absolute URL to open, including https://." },
      },
      required: ["url"],
      additionalProperties: false,
    },
    run: async (bridge, args) => {
      const url = needString(args?.url, "url", "pass an absolute URL like https://example.com/");
      const r = await bridge.call("openTab", { url });
      if (Number.isInteger(r?.tabId)) bridge.markUsed(r.tabId);
      return JSON.stringify(r ?? { url });
    },
  },
  {
    name: "browser_close_tab",
    description: "Close a browser tab. Without tabId, closes the last-used / active \"opencode\"-group tab.",
    argsSchema: { type: "object", properties: { tabId: TAB_ID }, additionalProperties: false },
    run: async (bridge, args) => {
      const tabId = await resolveTab(bridge, args);
      await bridge.call("closeTab", { tabId });
      bridge.clearUsed(tabId);
      return `closed tab ${tabId}`;
    },
  },
  {
    name: "browser_navigate",
    description:
      "Navigate a tab to a URL. Waits for page load (up to 40s). After navigating, ALWAYS take a fresh browser_snapshot before acting — old refs are invalid.",
    argsSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "Absolute URL to load, including https://." },
        tabId: TAB_ID,
      },
      required: ["url"],
      additionalProperties: false,
    },
    run: async (bridge, args) => {
      const url = needString(args?.url, "url", "pass an absolute URL like https://example.com/");
      const tabId = await resolveTab(bridge, args);
      const r = await bridge.call("navigate", { tabId, url }, { timeoutMs: LONG_CMD_TIMEOUT_MS });
      bridge.markUsed(tabId);
      return JSON.stringify(r ?? { tabId, url });
    },
  },
  {
    name: "browser_back",
    description: "Go back one step in the tab's history. Take a fresh browser_snapshot afterwards before acting.",
    argsSchema: { type: "object", properties: { tabId: TAB_ID }, additionalProperties: false },
    run: async (bridge, args) => {
      const tabId = await resolveTab(bridge, args);
      await bridge.call("goBack", { tabId });
      bridge.markUsed(tabId);
      return `navigated back in tab ${tabId}`;
    },
  },
  {
    name: "browser_snapshot",
    description:
      "PRIMARY WAY to see the page. Returns a compact text tree of the current page; every interactive element carries a stable ref like ref_12. Workflow: browser_snapshot -> choose the ref of the element you want -> browser_click/browser_type with that ref -> browser_snapshot again to verify. Prefer this over browser_screenshot for reading and acting.",
    argsSchema: {
      type: "object",
      properties: {
        tabId: TAB_ID,
        maxChars: {
          type: ["integer", "null"],
          description: "Maximum characters of tree text to return (default 12000, max 50000). Large pages are truncated with a marker.",
        },
      },
      additionalProperties: false,
    },
    run: async (bridge, args) => {
      const tabId = await resolveTab(bridge, args);
      const maxChars = clampInt(args?.maxChars, 12_000, 1_000, 50_000);
      const r = await bridge.call("snapshot", { tabId, maxChars });
      bridge.markUsed(tabId);
      if (r === null || typeof r !== "object") return String(r ?? "");
      const header = `Page: ${r.title ?? ""} — ${r.url ?? ""}`;
      return `${header}\n\n${r.tree ?? ""}`;
    },
  },
  {
    name: "browser_screenshot",
    description:
      "Capture a PNG screenshot of the visible viewport. Use for visual verification (layout, images, charts); use browser_snapshot for reading text and for anything you want to click or type into.",
    argsSchema: { type: "object", properties: { tabId: TAB_ID }, additionalProperties: false },
    run: async (bridge, args) => {
      const tabId = await resolveTab(bridge, args);
      const r = await bridge.call("screenshot", { tabId });
      bridge.markUsed(tabId);
      const mimeType = r?.mimeType ?? "image/png";
      const data = typeof r?.data === "string" ? r.data : "";
      const bytes = Math.floor((data.length * 3) / 4);
      return {
        text: `screenshot of tab ${tabId} (${bytes} bytes, ${mimeType})`,
        image: { mimeType, data },
      };
    },
  },
  {
    name: "browser_click",
    description:
      "Click an element by its ref from browser_snapshot (e.g. ref_12). Refs come from the MOST RECENT snapshot of that tab; after navigation or big DOM changes take a fresh snapshot first.",
    argsSchema: {
      type: "object",
      properties: {
        ref: { type: "string", description: "Element ref from the latest browser_snapshot, e.g. \"ref_12\"." },
        tabId: TAB_ID,
      },
      required: ["ref"],
      additionalProperties: false,
    },
    run: async (bridge, args) => {
      const ref = needString(args?.ref, "ref", "run browser_snapshot first and pass one of its ref_N ids");
      const tabId = await resolveTab(bridge, args);
      const r = await bridge.call("click", { tabId, ref });
      bridge.markUsed(tabId);
      const label = r && typeof r.label === "string" && r.label ? ` (${JSON.stringify(r.label)})` : "";
      return `clicked ${ref} in tab ${tabId}${label}`;
    },
  },
  {
    name: "browser_type",
    description:
      "Type text into an input element by its ref from browser_snapshot. Set submit=true to also submit the enclosing form / press Enter afterwards.",
    argsSchema: {
      type: "object",
      properties: {
        ref: { type: "string", description: "Input element ref from the latest browser_snapshot." },
        text: { type: "string", description: "Text to type." },
        submit: { type: ["boolean", "null"], description: "If true, press Enter / submit the form after typing." },
        tabId: TAB_ID,
      },
      required: ["ref", "text"],
      additionalProperties: false,
    },
    run: async (bridge, args) => {
      const ref = needString(args?.ref, "ref", "run browser_snapshot first and pass one of its ref_N ids");
      const text = needString(args?.text, "text", "pass the text to type (may be multiline)");
      const tabId = await resolveTab(bridge, args);
      await bridge.call("type", { tabId, ref, text, submit: args?.submit === true });
      bridge.markUsed(tabId);
      return `typed ${text.length} chars into ${ref} in tab ${tabId}`;
    },
  },
  {
    name: "browser_press_key",
    description:
      "Press a single key on the focused element: Enter, Tab, Escape, Backspace, Delete, ArrowUp/Down/Left/Right, or a printable character like \"a\".",
    argsSchema: {
      type: "object",
      properties: {
        key: { type: "string", description: "Key name, e.g. \"Enter\", \"Tab\", \"Escape\", \"a\"." },
        tabId: TAB_ID,
      },
      required: ["key"],
      additionalProperties: false,
    },
    run: async (bridge, args) => {
      const key = needString(args?.key, "key", "pass a key name like Enter, Tab, Escape, or a single character");
      const tabId = await resolveTab(bridge, args);
      await bridge.call("pressKey", { tabId, key });
      bridge.markUsed(tabId);
      return `pressed ${key} in tab ${tabId}`;
    },
  },
  {
    name: "browser_scroll",
    description:
      "Scroll the page. Pass deltaY (pixels, positive = down) or a ref to scroll that element into view. Take a fresh browser_snapshot afterwards — newly visible content may carry new refs.",
    argsSchema: {
      type: "object",
      properties: {
        deltaY: { type: ["integer", "null"], description: "Pixels to scroll vertically (positive = down, negative = up). Default 700." },
        ref: { type: ["string", "null"], description: "Element ref to scroll into view (takes precedence over deltaY)." },
        tabId: TAB_ID,
      },
      additionalProperties: false,
    },
    run: async (bridge, args) => {
      const tabId = await resolveTab(bridge, args);
      const ref = typeof args?.ref === "string" && args.ref.trim() ? args.ref : undefined;
      const deltaY = Number.isInteger(args?.deltaY) && args.deltaY !== 0 ? args.deltaY : 700;
      await bridge.call("scroll", ref ? { tabId, ref } : { tabId, deltaY });
      bridge.markUsed(tabId);
      return ref ? `scrolled ${ref} into view in tab ${tabId}` : `scrolled ${deltaY}px in tab ${tabId}`;
    },
  },
  {
    name: "browser_wait_for",
    description:
      "Wait until text or a CSS selector is present on the page (polls, up to timeoutMs / 40s max). Use after clicks or navigation that trigger async loads.",
    argsSchema: {
      type: "object",
      properties: {
        text: { type: ["string", "null"], description: "Visible text to wait for (case-insensitive substring)." },
        selector: { type: ["string", "null"], description: "CSS selector to wait for." },
        timeoutMs: { type: ["integer", "null"], description: "Max wait in ms (default 30000, max 40000)." },
        tabId: TAB_ID,
      },
      additionalProperties: false,
    },
    run: async (bridge, args) => {
      const text = typeof args?.text === "string" && args.text.trim() ? args.text : undefined;
      const selector = typeof args?.selector === "string" && args.selector.trim() ? args.selector : undefined;
      if (!text && !selector) throw new Error("text or selector is required — pass one of them to wait for");
      const tabId = await resolveTab(bridge, args);
      const timeoutMs = clampInt(args?.timeoutMs, 30_000, 250, LONG_CMD_TIMEOUT_MS);
      await bridge.call("waitFor", { tabId, text, selector, timeoutMs }, { timeoutMs: LONG_CMD_TIMEOUT_MS });
      bridge.markUsed(tabId);
      return `condition met in tab ${tabId} (${text ? `text ${JSON.stringify(text)}` : `selector ${JSON.stringify(selector)}`})`;
    },
  },
  {
    name: "browser_evaluate",
    description:
      "Evaluate a JavaScript expression in the page and return its JSON-serialized value. Example: \"document.title\" or \"document.querySelectorAll('a').length\". Prefer snapshot/click/type for interaction; use this for data extraction.",
    argsSchema: {
      type: "object",
      properties: {
        expression: { type: "string", description: "JavaScript expression evaluated against the page." },
        tabId: TAB_ID,
      },
      required: ["expression"],
      additionalProperties: false,
    },
    run: async (bridge, args) => {
      const expression = needString(args?.expression, "expression", "pass a JS expression like document.title");
      const tabId = await resolveTab(bridge, args);
      const r = await bridge.call("evaluate", { tabId, expression });
      bridge.markUsed(tabId);
      return JSON.stringify(r && "value" in r ? r.value : r ?? null);
    },
  },
  {
    name: "browser_console",
    description:
      "Read recent console messages from a tab: level (log/info/warning/error/debug), text, and timestamp. Captured while the debugger bridge is attached (from the first action on the tab, kept after it idles). Debugging use: after an action fails or a page misbehaves, check here for JavaScript errors and warnings the page logged in response.",
    argsSchema: {
      type: "object",
      properties: {
        level: { type: ["string", "null"], description: "Only return entries of this exact level, e.g. \"error\". Omit for all levels." },
        tabId: TAB_ID,
      },
      additionalProperties: false,
    },
    run: async (bridge, args) => {
      const tabId = await resolveTab(bridge, args);
      const level = typeof args?.level === "string" && args.level.trim() ? args.level : undefined;
      const r = await bridge.call("readConsole", { tabId, level });
      bridge.markUsed(tabId);
      const entries = Array.isArray(r) ? r : [];
      if (entries.length === 0) {
        return `no console entries captured in tab ${tabId}${level ? ` at level ${JSON.stringify(level)}` : ""} — capture starts with the first browser action on that tab`;
      }
      return entries.map((e) => `[${e.level}] ${e.text}`).join("\n");
    },
  },
  {
    name: "browser_network",
    description:
      "Read recent network requests from a tab: method, url, HTTP status, and resource type. Captured while the debugger bridge is attached. Debugging use: after an action that should have triggered an API call, verify the request fired and check its status (e.g. 4xx/5xx explain a UI that never updated). filter matches URLs by substring, or as a regex like \"api/.*users\".",
    argsSchema: {
      type: "object",
      properties: {
        filter: { type: ["string", "null"], description: "Only return requests whose URL matches — substring, or regex if it compiles." },
        tabId: TAB_ID,
      },
      additionalProperties: false,
    },
    run: async (bridge, args) => {
      const tabId = await resolveTab(bridge, args);
      const filter = typeof args?.filter === "string" && args.filter.trim() ? args.filter : undefined;
      const r = await bridge.call("readNetwork", { tabId, filter });
      bridge.markUsed(tabId);
      const entries = Array.isArray(r) ? r : [];
      if (entries.length === 0) {
        return `no network entries captured in tab ${tabId}${filter ? ` matching ${JSON.stringify(filter)}` : ""} — capture starts with the first browser action on that tab`;
      }
      return entries
        .map((e) => `[${e.status ?? "pending"}] ${e.method} ${e.url}${e.type ? ` (${e.type})` : ""}`)
        .join("\n");
    },
  },
];

// ---------------------------------------------------------------------------
// opencode tool adapter
// ---------------------------------------------------------------------------

function formatToolResult(result) {
  if (result && typeof result === "object" && result.image) {
    // opencode plugin tools return strings; embed the image as base64 JSON.
    return JSON.stringify({
      note: result.text,
      mimeType: result.image.mimeType,
      bytes: Math.floor((result.image.data.length * 3) / 4),
      data: result.image.data,
    });
  }
  return typeof result === "string" ? result : String(result ?? "");
}

function buildToolMap(state) {
  const map = {};
  for (const def of TOOLS) {
    const execute = async (args, _context) => {
      if (state.unavailable) return `Error: ${state.unavailable}`;
      try {
        const result = await def.run(state.bridge, args ?? {}, state.ctx);
        return formatToolResult(result);
      } catch (err) {
        return `Error: ${err instanceof Error ? err.message : String(err)}`;
      }
    };
    map[def.name] = {
      description: def.description,
      // Per-property JSON Schema map. opencode's registry detects non-Zod
      // values and feeds this through its legacy JSON-schema path.
      args: def.argsSchema.properties ?? {},
      execute,
      executes: execute, // alias for hosts that use the plural key
    };
  }
  return map;
}

// ---------------------------------------------------------------------------
// server startup + plugin entry
// ---------------------------------------------------------------------------

function makeLogger(input) {
  const log = input?.client?.app?.log;
  if (typeof log === "function") {
    return (level, message, extra) =>
      log
        .call(input.client.app, { body: { service: "chrome-bridge", level, message, extra } })
        .catch(() => {});
  }
  return (level, message, extra) => {
    const suffix = extra ? ` ${JSON.stringify(extra)}` : "";
    if (level === "error") console.error(`chrome-bridge: ${message}${suffix}`);
    else if (level === "warn") console.warn(`chrome-bridge: ${message}${suffix}`);
    else console.log(`chrome-bridge: ${message}${suffix}`);
  };
}

function isAddrInUse(err) {
  return (
    err &&
    (err.code === "EADDRINUSE" ||
      /address already in use|is port \d+ in use|port .* in use|EADDRINUSE/i.test(String(err.message ?? err)))
  );
}

// opencode invokes the plugin export more than once per bootstrap (observed
// twice), and the same file may be registered twice (config entry +
// auto-discovery). Module-level singleton: ONE bridge, ONE Bun.serve — a
// second bind would EADDRINUSE and yield a degraded tool map that could
// shadow the live one.
const SHARED_STATE = {
  bridge: new PluginBridge(),
  ctx: { port: DEFAULT_PORT, mode: "plugin" },
  unavailable: null,
  server: null,
};
let initPromise = null;

async function initPlugin(input) {
  const state = SHARED_STATE;
  const log = makeLogger(input);

  try {
    if (typeof Bun === "undefined" || typeof Bun.serve !== "function") {
      state.unavailable = "bridge unavailable: plugin requires the Bun runtime (opencode) to host its WebSocket server";
      log("error", state.unavailable);
      return;
    }

    const config = loadConfig();
    const port = resolvePort(config);
    const token = config.token;
    state.ctx = { port, mode: "plugin" };
    const startedAt = Date.now();
    const bridge = state.bridge;

    let server;
    try {
      server = Bun.serve({
        port,
        hostname: "127.0.0.1",
        fetch(req, srv) {
          let url;
          try {
            url = new URL(req.url);
          } catch {
            return new Response("bad request", { status: 400 });
          }
          if (req.method === "GET" && url.pathname === "/health") {
            return Response.json({
              ok: true,
              service: "chrome-bridge",
              mode: "plugin",
              version: PLUGIN_VERSION,
              port,
              connected: bridge.connected,
              uptimeMs: Date.now() - startedAt,
            });
          }
          if (url.pathname === WS_PATH) {
            if (url.searchParams.get("token") !== token) {
              return new Response("unauthorized: bad token", { status: 401 });
            }
            const origin = req.headers.get("origin") ?? "";
            if (!origin.startsWith(EXTENSION_ORIGIN_PREFIX)) {
              return new Response("forbidden: extension origin required", { status: 403 });
            }
            if (srv.upgrade(req)) return undefined;
            return new Response("websocket upgrade failed", { status: 500 });
          }
          return new Response("not found", { status: 404 });
        },
        websocket: {
          open(ws) {
            bridge.attachSocket(ws);
            log("info", "extension connected");
          },
          message(ws, message) {
            bridge.handleMessage(ws, message);
          },
          close(ws, code, reason) {
            bridge.handleClose(ws);
            log("info", "extension disconnected", { code, reason });
          },
        },
      });
    } catch (err) {
      if (!isAddrInUse(err)) throw err;
      // Port already owned: figure out by whom, degrade gracefully, never crash.
      let probed = null;
      try {
        const res = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(2_000) });
        probed = await res.json();
      } catch {
        probed = null;
      }
      const isBridge = probed && probed.ok === true && typeof probed.service === "string" && probed.service.includes("chrome-bridge");
      if (isBridge && probed.mode === "daemon") {
        log(
          "warn",
          `standalone daemon detected on port ${port}; plugin tools will proxy over WS to the extension only if free — stop the daemon or set CHROME_BRIDGE_PORT`,
        );
        state.unavailable = `bridge unavailable: port ${port} in use by standalone daemon`;
      } else if (isBridge) {
        log("error", `another chrome-bridge plugin server already owns port ${port} — this instance's bridge is disabled`);
        state.unavailable = `bridge unavailable: port ${port} already served by another chrome-bridge plugin instance`;
      } else {
        log("error", `port ${port} is in use by another process — chrome-bridge plugin server not started`);
        state.unavailable = `bridge unavailable: port ${port} in use by another process`;
      }
      return;
    }

    state.server = server;
    log("info", `extension WebSocket listening on ws://127.0.0.1:${port}${WS_PATH} (GET /health is open)`, {
      config: getConfigPath(),
    });
  } catch (err) {
    state.unavailable = `bridge unavailable: ${err instanceof Error ? err.message : String(err)}`;
    log("error", `failed to start: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export default async function chromeBridgePlugin(input) {
  if (!initPromise) initPromise = initPlugin(input);
  await initPromise;
  return { tool: buildToolMap(SHARED_STATE) };
}
