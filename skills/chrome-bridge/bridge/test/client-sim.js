// Fake chrome-bridge extension for tests: a zero-dependency WebSocket client
// that speaks the exact extension protocol (src/ext-protocol.js) and answers
// every RPC with deterministic canned data.
//
//   node test/client-sim.js --port 8823 --token <token>
//
// Flags win over env (CHROME_BRIDGE_PORT / CHROME_BRIDGE_TOKEN); with neither,
// the token is read from the standard config file. Prints one line per event
// so parent processes can synchronize on stdout:
//   SIM connected        -> handshake done, ready for RPC
//   SIM method <name>    -> one RPC handled
//   SIM closed <code>    -> socket closed (process then exits 0)
//
// Used by test/smoke.mjs (daemon) and test/plugin-smoke.mjs (opencode plugin).

import { loadConfig } from "../src/config.js";
import { encodeError, encodeResult, parseMessage } from "../src/ext-protocol.js";
import { connectWebSocket } from "../src/ws.js";

const PNG_1PX =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i !== -1 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

const port = Number(argValue("--port") ?? process.env.CHROME_BRIDGE_PORT ?? 8823);
const token = argValue("--token") ?? process.env.CHROME_BRIDGE_TOKEN ?? loadConfig().token;

// --- fake browser state -----------------------------------------------------

let nextTabId = 200;
const tabs = [
  { id: 101, title: "Example Domain", url: "https://example.com/", active: true, groupTitle: "opencode" },
  { id: 102, title: "Other", url: "https://other.test/", active: false, groupTitle: null },
];

function findTab(id) {
  const tab = tabs.find((t) => t.id === id);
  if (!tab) throw new Error(`tab ${id} not found`);
  return tab;
}

function checkRef(ref) {
  if (typeof ref !== "string" || !/^ref_\d+$/.test(ref)) {
    throw new Error(`${String(ref)} is stale or missing — take a fresh browser_snapshot and use a ref from it`);
  }
}

function snapshotTree(tab) {
  return [
    `[ref_1] <a> "Home" href="https://example.com/"`,
    `[ref_2] <button> "Submit"`,
    `[ref_3] <input> (type=text name=q placeholder="Search")`,
    `[ref_4] <a> "More information" href="https://example.com/more"`,
  ].join("\n");
}

async function handle(method, params) {
  switch (method) {
    case "ping":
      return {};
    case "listTabs":
      return tabs.map((t) => ({ ...t }));
    case "openTab": {
      const tab = { id: nextTabId++, title: "Sim Page", url: String(params.url ?? "about:blank"), active: false, groupTitle: null };
      tabs.push(tab);
      return { tabId: tab.id, url: tab.url };
    }
    case "closeTab": {
      const tab = findTab(params.tabId);
      tabs.splice(tabs.indexOf(tab), 1);
      return { ok: true };
    }
    case "navigate": {
      const tab = findTab(params.tabId);
      tab.url = String(params.url ?? "about:blank");
      tab.title = "Sim Page";
      return { tabId: tab.id, url: tab.url, title: tab.title };
    }
    case "goBack":
      return { ok: true, tabId: findTab(params.tabId).id };
    case "snapshot": {
      const tab = findTab(params.tabId);
      return { url: tab.url, title: tab.title, tree: snapshotTree(tab) };
    }
    case "screenshot":
      findTab(params.tabId);
      return { mimeType: "image/png", data: PNG_1PX };
    case "click": {
      findTab(params.tabId);
      checkRef(params.ref);
      return { ok: true, ref: params.ref, label: params.ref === "ref_2" ? "Submit" : "" };
    }
    case "type": {
      findTab(params.tabId);
      checkRef(params.ref);
      if (typeof params.text !== "string") throw new Error("params.text must be a string");
      return { ok: true, ref: params.ref };
    }
    case "pressKey":
      findTab(params.tabId);
      return { ok: true, key: String(params.key ?? "") };
    case "scroll":
      findTab(params.tabId);
      if (params.ref != null) checkRef(params.ref);
      return { ok: true, y: 700 };
    case "waitFor":
      findTab(params.tabId);
      return { found: true };
    case "evaluate":
      findTab(params.tabId);
      return { value: "sim-result" };
    case "readConsole":
      findTab(params.tabId);
      return [{ level: "info", text: "sim console", time: Date.now() }];
    case "readNetwork":
      findTab(params.tabId);
      return [{ requestId: "sim-1", method: "GET", url: "https://example.com/api", status: 200, type: "Fetch", time: Date.now() }];
    default:
      throw new Error(`unknown method: ${method}`);
  }
}

// --- connection -------------------------------------------------------------

const url = `ws://127.0.0.1:${port}/extension?token=${encodeURIComponent(token)}`;
let connectedOnce = false;
let ws;

try {
  ws = await connectWebSocket(url, {
    headers: { Origin: "chrome-extension://chrome-bridge-client-sim" },
  });
} catch (err) {
  console.log(`SIM connect failed: ${err?.message ?? err}`);
  process.exit(1);
}

connectedOnce = true;
console.log("SIM connected");

ws.on("message", async (data) => {
  const msg = parseMessage(data);
  if (!msg || typeof msg.method !== "string") return;
  console.log(`SIM method ${msg.method}`);
  try {
    const result = await handle(msg.method, msg.params ?? {});
    ws.send(encodeResult(msg.id, result));
  } catch (err) {
    ws.send(encodeError(msg.id, err instanceof Error ? err.message : String(err)));
  }
});

ws.on("close", (code, reason) => {
  console.log(`SIM closed ${code}${reason ? ` ${reason}` : ""}`);
  process.exit(connectedOnce ? 0 : 1);
});

ws.on("error", () => {});

process.on("SIGTERM", () => {
  try {
    ws.close(1000, "sim terminated");
  } catch {
    process.exit(0);
  }
});
process.on("SIGINT", () => process.kill(process.pid, "SIGTERM"));
