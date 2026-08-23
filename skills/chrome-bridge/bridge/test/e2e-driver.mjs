// End-to-end driver: real Chromium + real MV3 extension + real daemon.
// Seeds the pairing token into the extension via CDP (storage.onChanged
// triggers connect), then drives the full MCP tool loop and asserts real
// page effects. Requires bun (global WebSocket + fetch).
const TOKEN = "6qyPcPYwRd0KE6xiB6FJbPJSkS1HswZl";
const CDP = "http://127.0.0.1:9224";
const MCP = "http://127.0.0.1:8823/mcp";
const HEALTH = "http://127.0.0.1:8823/health";
const PAGE = "http://127.0.0.1:8890/";

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`PASS ${name}`); }
  else { fail++; console.log(`FAIL ${name}${detail ? " — " + detail : ""}`); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getSwTarget() {
  for (let i = 0; i < 20; i++) {
    const targets = await (await fetch(`${CDP}/json/list`)).json();
    const sw = targets.find((t) => t.type === "service_worker" && t.url.includes("background.js"));
    if (sw) return sw;
    await sleep(500);
  }
  throw new Error("extension service worker not found on CDP");
}
function cdpEval(ws, expression) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1e6);
    const timer = setTimeout(() => { ws.removeEventListener("message", on); reject(new Error("cdp timeout")); }, 10000);
    const on = (ev) => {
      let msg; try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.id !== id) return;
      clearTimeout(timer); ws.removeEventListener("message", on); resolve(msg);
    };
    ws.addEventListener("message", on);
    ws.send(JSON.stringify({ id, method: "Runtime.evaluate", params: { expression, awaitPromise: true, returnByValue: true } }));
  });
}

let mid = 0;
async function mcp(method, params) {
  const res = await fetch(MCP, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json, text/event-stream", "Authorization": `Bearer ${TOKEN}` },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++mid, method, params }),
  });
  if (!res.ok) throw new Error(`${method} -> HTTP ${res.status}`);
  const body = await res.json();
  if (body.error) throw new Error(`${method} -> ${JSON.stringify(body.error)}`);
  return body.result;
}
async function tool(name, args = {}) {
  const r = await mcp("tools/call", { name, arguments: args });
  if (r?.isError) throw new Error(`${name}: ${r?.content?.[0]?.text ?? ""}`);
  return r;
}
const textOf = (r) => r?.content?.[0]?.text ?? "";

// --- pair extension -> daemon ---
const sw = await getSwTarget();
check("extension service worker visible on CDP", true);
const ws = new WebSocket(sw.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.addEventListener("open", res, { once: true }); ws.addEventListener("error", rej, { once: true }); });
const seed = await cdpEval(ws, `chrome.storage.local.set({token:'${TOKEN}', port:8823}).then(()=>'stored')`);
check("token seeded into extension storage", seed?.result?.result?.value === "stored");
ws.close();

let health = null;
for (let i = 0; i < 30; i++) {
  try { health = await (await fetch(HEALTH)).json(); } catch {}
  if (health?.connected) break;
  await sleep(500);
}
check("daemon reports extension connected", health?.connected === true, JSON.stringify(health));

// --- mcp session ---
await mcp("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "e2e-driver", version: "1.0.0" } });
const names = (await mcp("tools/list", {})).tools.map((t) => t.name);
check("tools/list has 16 tools", names.length === 16, names.join(","));

const status = JSON.parse(textOf(await tool("browser_status")));
check("browser_status connected", status.connected === true, JSON.stringify(status));

const nav = textOf(await tool("browser_open_tab", { url: PAGE }));
check("browser_open_tab", /tabId/.test(nav), nav);
const ren = textOf(await tool("browser_navigate", { url: PAGE }));
check("browser_navigate (last-used tab)", /tabId/.test(ren), ren);

// --- snapshot with refs ---
let snap = "";
for (let i = 0; i < 10 && !snap; i++) {
  try { snap = textOf(await tool("browser_snapshot")); } catch (e) { console.log(`  (snapshot retry: ${e.message})`); await sleep(500); }
}
check("browser_snapshot produced tree", /\[ref_\d+\]/.test(snap), snap.slice(0, 300));
console.log("--- snapshot ---\n" + snap.split("\n").slice(0, 12).join("\n") + "\n----------------");
const btnRef = (snap.match(/\[(ref_\d+)\][^\n]*<button>[^\n]*"Go"/) || [])[1];
const inpRef = (snap.match(/\[(ref_\d+)\][^\n]*<input>/) || [])[1];
check("snapshot has button + input refs", !!btnRef && !!inpRef, `btn=${btnRef} inp=${inpRef}`);

// --- act via CDP ---
const typed = textOf(await tool("browser_type", { ref: inpRef, text: "hello bridge" }));
check("browser_type ok", /typed \d+ chars/i.test(typed), typed);
const clicked = textOf(await tool("browser_click", { ref: btnRef }));
check("browser_click ok", /clicked ref_/i.test(clicked), clicked);

const out = textOf(await tool("browser_evaluate", { expression: "document.getElementById('out').textContent" }));
check("click effect visible via evaluate", /clicked hello bridge/.test(out), out);

// --- console + network capture (debugger attached by now) ---
await tool("browser_evaluate", { expression: "fetch('/').then(r=>r.status)" });
const cons = textOf(await tool("browser_console", {}));
check("browser_console captured click log", /button clicked/.test(cons), cons.slice(0, 200));
const net = textOf(await tool("browser_network", {}));
check("browser_network captured fetch", /8890/.test(net), net.slice(0, 200));

// --- screenshot (raw image content) ---
const shot = await tool("browser_screenshot");
const img = shot?.content?.find((c) => c.type === "image");
check("browser_screenshot returns image", !!img && /^iVBOR/.test(img.data ?? ""), JSON.stringify(shot?.content?.[0] ?? "").slice(0, 120));

// --- misc tools ---
const pk = textOf(await tool("browser_press_key", { key: "Enter" })); check("browser_press_key ok", !/Error:/.test(pk) && pk.length > 0, pk);
const sc = textOf(await tool("browser_scroll", { deltaY: 300 })); check("browser_scroll ok", !/Error:/.test(sc) && sc.length > 0, sc);
check("browser_wait_for ok", /condition met|found/i.test(textOf(await tool("browser_wait_for", { text: "clicked hello bridge" }))));

const tabs = JSON.parse(textOf(await tool("browser_list_tabs")));
const mine = Array.isArray(tabs) ? tabs.find((t) => String(t.url).includes("8890")) : null;
check("browser_list_tabs shows test page", !!mine, JSON.stringify(tabs).slice(0, 200));
if (mine?.id ?? mine?.tabId) {
  const ct = textOf(await tool("browser_close_tab", { tabId: mine.id ?? mine.tabId })); check("browser_close_tab ok", !/Error:/.test(ct) && ct.length > 0, ct);
}

console.log(`\nE2E RESULT: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
