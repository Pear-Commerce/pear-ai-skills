// MV3 service worker: connects to the chrome-bridge host (opencode plugin or
// standalone daemon) at ws://127.0.0.1:<port>/extension?token=<token> and
// answers its JSON-RPC requests by driving Chrome APIs.
//
// The wire protocol is identical for both hosts — see src/ext-protocol.js.
// Pairing: open the extension popup and paste the token printed by
// `chrome-bridge token` (same token lives in ~/.opencode-chrome-bridge/config.json).

import {
  snapshotPage,
  preparePointAtRef,
  prepareTypeAtRef,
  viewportCenter,
  waitForInPage,
  evaluateInPage,
} from "./page-fns.js";

const DEFAULT_PORT = 8823;
const KEEPALIVE_ALARM = "chrome-bridge-keepalive";

let ws = null;
let reconnectDelay = 1_000;
let reconnectTimer = null;
let connecting = false;

// ---------------------------------------------------------------------------
// connection management
// ---------------------------------------------------------------------------

async function getSettings() {
  const stored = await chrome.storage.local.get(["token", "port"]);
  const port = Number.isInteger(stored.port) && stored.port > 0 ? stored.port : DEFAULT_PORT;
  return { token: typeof stored.token === "string" ? stored.token : "", port };
}

async function connect(reason) {
  if (connecting || (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING))) return;
  // Set the guard BEFORE any await: at SW boot the top-level connect() and
  // the onInstalled/onStartup handlers race through this function, and two
  // concurrent connects make the daemon replace-kill the first socket,
  // seeding a permanent 1s reconnect storm.
  connecting = true;
  let settings;
  try {
    settings = await getSettings();
  } catch {
    connecting = false;
    scheduleReconnect();
    return;
  }
  const { token, port } = settings;
  if (!token) {
    connecting = false;
    return; // not paired yet — popup will set the token and retrigger
  }
  let sock;
  try {
    sock = new WebSocket(`ws://127.0.0.1:${port}/extension?token=${encodeURIComponent(token)}`);
  } catch {
    connecting = false;
    scheduleReconnect();
    return;
  }
  ws = sock;
  // Stale-socket guard: events from a superseded socket (closed during a
  // settings-change reconnect) must not clobber the new connection or
  // schedule a duplicate one — that double-connect makes the daemon reject
  // the first socket mid-call ("extension connection replaced").
  const isCurrent = () => ws === sock;

  sock.onopen = () => {
    if (!isCurrent()) return;
    connecting = false;
    reconnectDelay = 1_000;
    console.log("[chrome-bridge] connected to host");
  };
  sock.onmessage = (event) => {
    if (!isCurrent()) return;
    handleMessage(String(event.data)).catch((err) => console.warn("[chrome-bridge] rpc error", err));
  };
  sock.onclose = (event) => {
    if (!isCurrent()) return;
    connecting = false;
    ws = null;
    console.log(`[chrome-bridge] disconnected (code ${event.code}${event.reason ? `: ${event.reason}` : ""})`);
    scheduleReconnect();
  };
  sock.onerror = () => {
    if (!isCurrent()) return;
    connecting = false;
    // onclose follows and schedules the reconnect
  };
}

function scheduleReconnect() {
  if (reconnectTimer !== null) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect("reconnect-timer");
  }, reconnectDelay);
  reconnectDelay = Math.min(reconnectDelay * 2, 10_000);
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (changes.token || changes.port)) {
    try {
      ws?.close(1000, "settings changed");
    } catch {
      // ignore
    }
    ws = null;
    connect("storage-changed");
  }
});

// MV3 service workers are event-driven; a periodic alarm keeps the worker
// (and its WebSocket) warm so the bridge stays reachable.
chrome.alarms.create(KEEPALIVE_ALARM, { periodInMinutes: 0.4 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === KEEPALIVE_ALARM && (!ws || ws.readyState !== WebSocket.OPEN)) connect("alarm");
});
// Outbound heartbeat: Chrome extends the service worker's idle lifetime on
// WebSocket activity the SW itself initiates — the daemon's inbound ping
// alone does not reliably reset it. 15s keeps us under the ~30s idle limit.
setInterval(() => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify({ hb: Date.now() }));
    } catch {
      // close handler will reconnect
    }
  }
}, 15_000);
chrome.runtime.onInstalled.addListener(() => connect("onInstalled"));
chrome.runtime.onStartup.addListener(() => connect("onStartup"));
connect("boot");

// ---------------------------------------------------------------------------
// RPC dispatch (host -> extension)
// ---------------------------------------------------------------------------

async function handleMessage(data) {
  let msg;
  try {
    msg = JSON.parse(data);
  } catch {
    return;
  }
  if (msg === null || typeof msg !== "object" || msg.id === undefined || typeof msg.method !== "string") return;
  const { id, method, params } = msg;
  try {
    const result = await dispatch(method, params ?? {});
    ws?.send(JSON.stringify({ id, result: result ?? null }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    ws?.send(JSON.stringify({ id, error: { message } }));
  }
}

async function dispatch(method, params) {
  switch (method) {
    case "ping":
      return {};
    case "listTabs":
      return listTabs();
    case "openTab":
      return openTab(params);
    case "closeTab":
      await chrome.tabs.remove(requireTabId(params));
      return { ok: true };
    case "navigate":
      return navigate(params);
    case "goBack":
      return goBack(params);
    case "snapshot":
      return runInTab(params, snapshotPage, [clampMaxChars(params.maxChars)]);
    case "screenshot":
      return screenshot(params);
    case "click":
      return click(params);
    case "type":
      return typeText(params);
    case "pressKey":
      return pressKey(params);
    case "scroll":
      return scroll(params);
    case "waitFor":
      return runInTab(params, waitForInPage, [
        { text: params.text ?? null, selector: params.selector ?? null, timeoutMs: params.timeoutMs ?? 30_000 },
      ]);
    case "evaluate":
      return runInTab({ ...params, world: "MAIN" }, evaluateInPage, [requireString(params.expression, "expression")]);
    case "readConsole":
      return readConsole(params);
    case "readNetwork":
      return readNetwork(params);
    default:
      throw new Error(`unknown method: ${method}`);
  }
}

function requireTabId(params) {
  const id = params?.tabId;
  if (!Number.isInteger(id) || id <= 0) throw new Error("params.tabId must be a positive integer");
  return id;
}

function requireString(value, name) {
  if (typeof value !== "string" || value === "") throw new Error(`params.${name} must be a non-empty string`);
  return value;
}

function clampMaxChars(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 12_000;
  return Math.min(50_000, Math.max(1_000, Math.trunc(n)));
}

async function listTabs() {
  const tabs = await chrome.tabs.query({});
  return Promise.all(
    tabs.map(async (tab) => {
      let groupTitle = null;
      if (typeof tab.groupId === "number" && tab.groupId >= 0 && chrome.tabGroups?.get) {
        try {
          const group = await chrome.tabGroups.get(tab.groupId);
          groupTitle = group?.title ?? null;
        } catch {
          groupTitle = null;
        }
      }
      return {
        id: tab.id,
        title: tab.title ?? "",
        url: tab.url ?? "",
        active: tab.active === true,
        groupTitle,
      };
    }),
  );
}

async function openTab(params) {
  const url = requireString(params.url, "url");
  const tab = await chrome.tabs.create({ url, active: true });
  return { tabId: tab.id, url: tab.url ?? url };
}

async function navigate(params) {
  const tabId = requireTabId(params);
  const url = requireString(params.url, "url");
  await chrome.tabs.update(tabId, { url });
  await waitForLoad(tabId, 35_000);
  const tab = await chrome.tabs.get(tabId);
  return { tabId, url: tab.url ?? url, title: tab.title ?? "" };
}

function waitForLoad(tabId, timeoutMs) {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (err) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      if (err) reject(err);
      else resolve();
    };
    const onUpdated = (id, info) => {
      if (id === tabId && info.status === "complete") finish();
    };
    const timer = setTimeout(() => finish(new Error(`page load timed out after ${timeoutMs}ms`)), timeoutMs);
    chrome.tabs.onUpdated.addListener(onUpdated);
    // If the tab was already complete (cached page), resolve immediately.
    chrome.tabs
      .get(tabId)
      .then((tab) => {
        if (tab.status === "complete") finish();
      })
      .catch(() => finish(new Error(`tab ${tabId} not found`)));
  });
}

async function goBack(params) {
  const tabId = requireTabId(params);
  try {
    await chrome.tabs.goBack(tabId);
  } catch {
    // chrome.tabs.goBack rejects when there is no history; fall back to the page
    await runInTab({ tabId, world: "MAIN" }, () => {
      window.history.back();
      return { ok: true };
    }, []);
  }
  return { ok: true, tabId };
}

/**
 * Run a page function inside a tab. Ref-dependent functions stay in the
 * ISOLATED world (where the ref registry lives); evaluate uses MAIN.
 */
async function runInTab(params, func, args) {
  const tabId = requireTabId(params);
  const target = { tabId };
  const inject = { target, func, args, world: params.world === "MAIN" ? "MAIN" : "ISOLATED" };
  let results;
  try {
    results = await chrome.scripting.executeScript(inject);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/cannot access|Cannot access|chrome:\/\/|The extensions gallery/i.test(message)) {
      throw new Error(`cannot run in tab ${tabId}: ${message} (chrome:// pages and the Web Store are off-limits to extensions)`);
    }
    throw new Error(`cannot run in tab ${tabId}: ${message}`);
  }
  const first = Array.isArray(results) ? results[0] : null;
  if (first?.error) throw new Error(String(first.error.message ?? first.error));
  // Chrome resolves a closure-broken or throwing injection with no result and
  // no error — surface that loudly instead of returning null (which tools
  // would format into a silent empty success).
  if (!first || first.result === undefined) {
    throw new Error(
      `injection into tab ${tabId} returned no result — the page function failed silently ` +
        `(privileged page, or a non-self-contained injected function); if the page is regular http(s), report this as a chrome-bridge bug`,
    );
  }
  return first.result;
}

async function screenshot(params) {
  const tabId = requireTabId(params);
  const result = await cdp(tabId, "Page.captureScreenshot", { format: "png" });
  return { mimeType: "image/png", data: typeof result?.data === "string" ? result.data : "" };
}

// ---------------------------------------------------------------------------
// CDP (chrome.debugger) — trusted input actuation + console/network capture
// ---------------------------------------------------------------------------
//
// One debugger session per tab, attached lazily on the first CDP-backed
// command and detached after 20s idle. While attached, Runtime and Network
// events feed per-tab ring buffers served by readConsole / readNetwork.

const DEBUGGER_VERSION = "1.3";
const IDLE_DETACH_MS = 20_000;
const CONSOLE_RING_MAX = 300;
const NETWORK_RING_MAX = 500;

// tabId -> { attached, attaching, detachTimer, consoleLog: [], networkLog: [] }
const tabStates = new Map();

function stateFor(tabId) {
  let st = tabStates.get(tabId);
  if (!st) {
    st = { attached: false, attaching: null, detachTimer: null, consoleLog: [], networkLog: [] };
    tabStates.set(tabId, st);
  }
  return st;
}

function markActivity(tabId) {
  const st = stateFor(tabId);
  if (st.detachTimer) clearTimeout(st.detachTimer);
  st.detachTimer = setTimeout(() => {
    detachTab(tabId).catch(() => {});
  }, IDLE_DETACH_MS);
}

async function ensureAttached(tabId) {
  const st = stateFor(tabId);
  if (st.attached) {
    markActivity(tabId);
    return;
  }
  if (st.attaching) return st.attaching;
  st.attaching = (async () => {
    try {
      await chrome.debugger.attach({ tabId }, DEBUGGER_VERSION);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/another debugger is already attached/i.test(msg)) {
        throw new Error(`cannot attach debugger to tab ${tabId}: another debugger is already attached (close DevTools on that tab first)`);
      }
      if (!/already attached/i.test(msg)) {
        throw new Error(`cannot attach debugger to tab ${tabId}: ${msg}`);
      }
      // "Already attached" (ourselves) — fall through and re-enable domains.
    }
    st.attached = true;
    try {
      await chrome.debugger.sendCommand({ tabId }, "Runtime.enable");
      await chrome.debugger.sendCommand({ tabId }, "Network.enable");
    } catch (err) {
      st.attached = false;
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`debugger domain setup failed on tab ${tabId}: ${msg}`);
    }
    markActivity(tabId);
  })();
  try {
    await st.attaching;
  } finally {
    st.attaching = null;
  }
}

async function detachTab(tabId) {
  const st = tabStates.get(tabId);
  if (!st) return;
  if (st.detachTimer) {
    clearTimeout(st.detachTimer);
    st.detachTimer = null;
  }
  if (st.attached) {
    st.attached = false;
    try {
      await chrome.debugger.detach({ tabId });
    } catch {
      // already detached
    }
  }
}

async function cdp(tabId, method, params) {
  await ensureAttached(tabId);
  markActivity(tabId);
  try {
    return await chrome.debugger.sendCommand({ tabId }, method, params ?? {});
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/not attached|no tab with id|cannot access/i.test(msg)) {
      const st = tabStates.get(tabId);
      if (st) st.attached = false;
    }
    throw new Error(`CDP ${method} failed on tab ${tabId}: ${msg}`);
  }
}

// User clicked Cancel on the "started debugging this browser" infobar (or the
// tab crashed): forget the attachment so the next action re-attaches.
chrome.debugger.onDetach.addListener((source) => {
  const tabId = source?.tabId;
  if (!Number.isInteger(tabId)) return;
  const st = tabStates.get(tabId);
  if (!st) return;
  st.attached = false;
  if (st.detachTimer) {
    clearTimeout(st.detachTimer);
    st.detachTimer = null;
  }
});

chrome.debugger.onEvent.addListener((source, method, params) => {
  const tabId = source?.tabId;
  if (!Number.isInteger(tabId)) return;
  const st = tabStates.get(tabId);
  if (!st) return;
  if (method === "Runtime.consoleAPICalled") {
    const args = Array.isArray(params?.args) ? params.args : [];
    pushRing(st.consoleLog, CONSOLE_RING_MAX, {
      level: typeof params?.type === "string" ? params.type : "log",
      text: args.map((a) => String(a?.value ?? a?.description ?? a?.type ?? "")).join(" "),
      time: Date.now(),
    });
  } else if (method === "Runtime.exceptionThrown") {
    const details = params?.exceptionDetails ?? {};
    pushRing(st.consoleLog, CONSOLE_RING_MAX, {
      level: "error",
      text: `${details.text ?? ""}${details.exception?.description ? ` ${details.exception.description}` : ""}`.trim(),
      time: Date.now(),
    });
  } else if (method === "Network.requestWillBeSent") {
    pushRing(st.networkLog, NETWORK_RING_MAX, {
      requestId: params?.requestId ?? "",
      method: params?.request?.method ?? "",
      url: params?.request?.url ?? "",
      type: params?.type ?? "",
      status: null,
      time: Date.now(),
    });
  } else if (method === "Network.responseReceived") {
    const requestId = params?.requestId;
    for (let i = st.networkLog.length - 1; i >= 0; i--) {
      if (st.networkLog[i].requestId === requestId) {
        st.networkLog[i].status = params?.response?.status ?? null;
        break;
      }
    }
  }
});

function pushRing(ring, max, entry) {
  ring.push(entry);
  if (ring.length > max) ring.splice(0, ring.length - max);
}

chrome.tabs.onRemoved.addListener((tabId) => {
  const st = tabStates.get(tabId);
  if (st?.detachTimer) clearTimeout(st.detachTimer);
  tabStates.delete(tabId);
});

// --- actuation via trusted CDP input events --------------------------------

async function click(params) {
  const tabId = requireTabId(params);
  const ref = requireString(params.ref, "ref");
  const prep = await runInTab({ tabId }, preparePointAtRef, [ref]);
  if (!prep || prep.ok !== true) throw new Error(`cannot click ${ref} in tab ${tabId}: element not measurable`);
  const { x, y } = prep;
  await cdp(tabId, "Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await cdp(tabId, "Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await cdp(tabId, "Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
  return { ok: true, ref, label: prep.label ?? "" };
}

async function typeText(params) {
  const tabId = requireTabId(params);
  const ref = requireString(params.ref, "ref");
  const text = String(params.text ?? "");
  await runInTab({ tabId }, prepareTypeAtRef, [ref]);
  if (text) await cdp(tabId, "Input.insertText", { text });
  if (params.submit === true) await dispatchKey(tabId, "Enter");
  return { ok: true, ref };
}

async function pressKey(params) {
  const tabId = requireTabId(params);
  const key = requireString(params.key, "key");
  await dispatchKey(tabId, key, params.modifiers);
  return { ok: true, key };
}

const CDP_KEYS = {
  Enter: { key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" },
  Tab: { key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 },
  Escape: { key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 },
  ArrowUp: { key: "ArrowUp", code: "ArrowUp", windowsVirtualKeyCode: 38 },
  ArrowDown: { key: "ArrowDown", code: "ArrowDown", windowsVirtualKeyCode: 40 },
  ArrowLeft: { key: "ArrowLeft", code: "ArrowLeft", windowsVirtualKeyCode: 37 },
  ArrowRight: { key: "ArrowRight", code: "ArrowRight", windowsVirtualKeyCode: 39 },
  Home: { key: "Home", code: "Home", windowsVirtualKeyCode: 36 },
  End: { key: "End", code: "End", windowsVirtualKeyCode: 35 },
  PageUp: { key: "PageUp", code: "PageUp", windowsVirtualKeyCode: 33 },
  PageDown: { key: "PageDown", code: "PageDown", windowsVirtualKeyCode: 34 },
  Backspace: { key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 },
  Delete: { key: "Delete", code: "Delete", windowsVirtualKeyCode: 46 },
  Space: { key: " ", code: "Space", windowsVirtualKeyCode: 32, text: " " },
  " ": { key: " ", code: "Space", windowsVirtualKeyCode: 32, text: " " },
};

function keyDefFor(key) {
  let def = CDP_KEYS[key];
  if (!def && typeof key === "string" && /^[a-z0-9]$/i.test(key)) {
    const upper = key.toUpperCase();
    def = {
      key,
      code: /[A-Z]/.test(upper) ? `Key${upper}` : `Digit${upper}`,
      windowsVirtualKeyCode: upper.charCodeAt(0),
      text: key,
    };
  }
  if (!def) {
    throw new Error(
      `unsupported key ${JSON.stringify(key)} — use Enter, Tab, Escape, ArrowUp/Down/Left/Right, Home, End, PageUp, PageDown, Backspace, Delete, Space, or a-z/0-9`,
    );
  }
  return def;
}

function modifiersMask(modifiers) {
  let mask = 0;
  if (Array.isArray(modifiers)) {
    for (const m of modifiers) {
      if (m === "alt") mask |= 1;
      else if (m === "ctrl") mask |= 2;
      else if (m === "meta") mask |= 4;
      else if (m === "shift") mask |= 8;
    }
  }
  return mask;
}

async function dispatchKey(tabId, key, modifiers) {
  const def = keyDefFor(key);
  const mask = modifiersMask(modifiers);
  const base = {
    key: def.key,
    code: def.code,
    windowsVirtualKeyCode: def.windowsVirtualKeyCode,
    nativeVirtualKeyCode: def.windowsVirtualKeyCode,
    modifiers: mask,
  };
  const downType = def.text && !mask ? "keyDown" : "rawKeyDown";
  const down = { ...base, type: downType };
  if (def.text) down.text = def.text;
  await cdp(tabId, "Input.dispatchKeyEvent", down);
  await cdp(tabId, "Input.dispatchKeyEvent", { ...base, type: "keyUp" });
}

async function scroll(params) {
  const tabId = requireTabId(params);
  const ref = typeof params.ref === "string" && params.ref ? params.ref : null;
  let x;
  let y;
  if (ref) {
    const prep = await runInTab({ tabId }, preparePointAtRef, [ref]);
    x = prep.x;
    y = prep.y;
  } else {
    const center = await runInTab({ tabId }, viewportCenter, []);
    x = center.x;
    y = center.y;
  }
  const deltaY = Number.isFinite(params.deltaY) ? params.deltaY : 700;
  await cdp(tabId, "Input.dispatchMouseEvent", { type: "mouseWheel", x, y, deltaX: 0, deltaY });
  return { ok: true, deltaY };
}

// --- console / network capture reads ----------------------------------------

function readConsole(params) {
  const tabId = requireTabId(params);
  const entries = tabStates.get(tabId)?.consoleLog ?? [];
  const level = typeof params.level === "string" && params.level ? params.level : null;
  const filtered = level ? entries.filter((e) => e.level === level) : entries;
  return filtered.slice(-50).map((e) => ({ ...e }));
}

function readNetwork(params) {
  const tabId = requireTabId(params);
  const entries = tabStates.get(tabId)?.networkLog ?? [];
  const filter = typeof params.filter === "string" && params.filter ? params.filter : null;
  let re = null;
  if (filter) {
    try {
      re = new RegExp(filter);
    } catch {
      re = null; // not a valid regex — fall back to substring matching
    }
  }
  const matches = (e) => !filter || (re ? re.test(e.url) : e.url.includes(filter));
  return entries
    .filter(matches)
    .slice(-50)
    .map((e) => ({ ...e }));
}
