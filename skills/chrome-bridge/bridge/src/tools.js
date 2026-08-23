// The 16 browser_* tools — single source of truth.
//
// src/mcp-server.js wraps these in the MCP envelope (tools/list, tools/call);
// plugin/chrome-bridge.plugin.js carries an inline copy and exposes them as
// native opencode plugin tools. Keep names, descriptions, arg shapes, result
// text, and error behavior identical across both hosts.
//
// Core loop the descriptions teach: browser_snapshot -> pick a ref_N ->
// browser_click / browser_type with that ref -> browser_snapshot again.
//
// Handler contract: run(bridge, args, ctx) resolves to a string, or to
// { text, image: { mimeType, data } } for screenshots. Throw Error with a
// clean, actionable message on failure — hosts prefix it with "Error: ".
// Optional numeric args treat 0 / -1 / null as "not provided" so hosts whose
// schema marks every property required (opencode's legacy JSON-schema plugin
// path) can still express "auto".

import { LONG_CMD_TIMEOUT_MS } from "./ext-protocol.js";

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

export const TOOLS = [
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
    timeoutMs: LONG_CMD_TIMEOUT_MS,
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
    timeoutMs: LONG_CMD_TIMEOUT_MS,
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

export const TOOL_NAMES = TOOLS.map((t) => t.name);

export function getTool(name) {
  return TOOLS.find((t) => t.name === name) ?? null;
}
