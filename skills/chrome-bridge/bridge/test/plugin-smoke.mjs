// Plugin-mode end-to-end smoke test (Bun).
//
//   bun test/plugin-smoke.mjs
//
// Simulates opencode's plugin host: imports plugin/chrome-bridge.plugin.js,
// invokes the default export with a stub input, waits for its Bun.serve WS
// server, connects the fake extension (test/client-sim.js, spawned under
// Node), drives the registered tool handlers, and verifies clean errors
// after disconnect. Prints PASS lines and exits 0 on success.
//
// Uses a scratch data dir + port so the real ~/.opencode-chrome-bridge is
// never touched.

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8898;
const BASE = `http://127.0.0.1:${PORT}`;

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "chrome-bridge-plugin-smoke-"));
process.env.CHROME_BRIDGE_DATA_DIR = dataDir;
process.env.CHROME_BRIDGE_PORT = String(PORT);

const { default: chromeBridgePlugin } = await import("../plugin/chrome-bridge.plugin.js");
const { TOOL_NAMES } = await import("../src/tools.js");

let failures = 0;
function pass(name) {
  console.log(`PASS ${name}`);
}
function fail(name, detail) {
  failures += 1;
  console.error(`FAIL ${name}${detail ? ` — ${detail}` : ""}`);
}
function assert(cond, name, detail) {
  if (cond) pass(name);
  else fail(name, detail);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function poll(fn, { timeoutMs = 8_000, everyMs = 100 } = {}) {
  const start = Date.now();
  let lastErr;
  for (;;) {
    try {
      const v = await fn();
      if (v) return v;
    } catch (err) {
      lastErr = err;
    }
    if (Date.now() - start > timeoutMs) throw lastErr ?? new Error("poll timed out");
    await sleep(everyMs);
  }
}

function spawnLogged(command, args, env, tag) {
  const child = spawn(command, args, { env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  const waiters = [];
  child.stdout.on("data", (d) => {
    stdout += d.toString();
    for (const line of d.toString().split("\n")) if (line.trim()) console.log(`  [${tag}] ${line}`);
    for (const w of [...waiters]) w.check(stdout);
  });
  child.stderr.on("data", (d) => {
    for (const line of d.toString().split("\n")) if (line.trim()) console.log(`  [${tag}!] ${line}`);
  });
  const waitForLine = (needle, timeoutMs = 8_000) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${tag}: never saw '${needle}'`)), timeoutMs);
      waiters.push({
        check: (text) => {
          if (text.includes(needle)) {
            clearTimeout(timer);
            resolve();
          }
        },
      });
    });
  const waitForExit = (timeoutMs = 8_000) =>
    new Promise((resolve, reject) => {
      if (child.exitCode !== null) return resolve(child.exitCode);
      const timer = setTimeout(() => reject(new Error(`${tag}: never exited`)), timeoutMs);
      child.once("exit", (code) => {
        clearTimeout(timer);
        resolve(code);
      });
    });
  return { child, waitForLine, waitForExit, getStdout: () => stdout };
}

const children = [];
const watchdog = setTimeout(() => {
  console.error("FAIL watchdog timeout");
  process.exit(1);
}, 60_000);

try {
  // --- plugin load (simulated opencode host: stub input, nothing present) ---
  const hooks = await chromeBridgePlugin({});
  assert(hooks && typeof hooks === "object" && hooks.tool && typeof hooks.tool === "object", "plugin returns hooks.tool map");

  const names = Object.keys(hooks.tool).sort();
  assert(
    names.length === 16 &&
      TOOL_NAMES.every((n) => names.includes(n)) &&
      names.includes("browser_console") &&
      names.includes("browser_network"),
    "exactly the 16 browser_* tools are registered",
    names.join(","),
  );

  const shapeOk = TOOL_NAMES.every((n) => {
    const t = hooks.tool[n];
    return (
      typeof t?.description === "string" &&
      t.description.length > 10 &&
      t.args !== null &&
      typeof t.args === "object" &&
      typeof t.execute === "function" &&
      t.executes === t.execute
    );
  });
  assert(shapeOk, "every tool has description + args map + execute/executes alias");

  // --- server up ---
  const health = await poll(async () => {
    const res = await fetch(`${BASE}/health`);
    return res.ok ? res.json() : null;
  });
  assert(health.ok === true && health.mode === "plugin" && health.service === "chrome-bridge", "health shape", JSON.stringify(health));
  assert(health.connected === false, "health starts disconnected");

  const token = JSON.parse(fs.readFileSync(path.join(dataDir, "config.json"), "utf8")).token;
  assert(typeof token === "string" && token.length >= 16, "token generated in scratch config (daemon-compatible file)");

  // --- WS auth at the HTTP layer (fetch never upgrades) ---
  const badToken = await fetch(`${BASE}/extension?token=wrong-token-value`, { headers: { Origin: "chrome-extension://x" } });
  assert(badToken.status === 401, "WS bad token rejected 401", `status=${badToken.status}`);
  const badOrigin = await fetch(`${BASE}/extension?token=${encodeURIComponent(token)}`, { headers: { Origin: "https://evil.example" } });
  assert(badOrigin.status === 403, "WS non-extension origin rejected 403", `status=${badOrigin.status}`);
  const notFound = await fetch(`${BASE}/nope`);
  assert(notFound.status === 404, "unknown path -> 404");

  // --- disconnected state returns clean errors, never throws ---
  const deadStatus = await hooks.tool.browser_status.execute({}, {});
  assert(deadStatus.includes('"connected":false'), "browser_status while disconnected", deadStatus);
  const deadNav = await hooks.tool.browser_navigate.execute({ url: "https://example.com/" }, {});
  assert(deadNav.startsWith("Error:") && deadNav.includes("not connected"), "browser_navigate while disconnected -> clean error", deadNav);

  // --- connect fake extension ---
  const sim = spawnLogged("node", [path.join(ROOT, "test", "client-sim.js"), "--port", String(PORT), "--token", token], {}, "sim");
  children.push(sim);
  await sim.waitForLine("SIM connected");
  pass("client-sim connected to plugin WS");

  const status = await poll(async () => {
    const s = await hooks.tool.browser_status.execute({}, {});
    return s.includes('"connected":true') ? s : null;
  });
  assert(status.includes('"mode":"plugin"'), "browser_status connected:true mode:plugin", status);

  const snap = await hooks.tool.browser_snapshot.execute({}, {});
  assert(snap.includes("ref_") && snap.includes("Page:"), "browser_snapshot contains refs + page header", snap.slice(0, 120));

  const nav = await hooks.tool.browser_navigate.execute({ url: "https://example.com/docs" }, {});
  assert(nav.includes("https://example.com/docs"), "browser_navigate navigates (auto tab resolution)", nav);

  const navExplicit = await hooks.tool.browser_navigate.execute({ url: "https://example.com/explicit", tabId: 102 }, {});
  assert(navExplicit.includes('"tabId":102'), "browser_navigate with explicit tabId", navExplicit);

  const click = await hooks.tool.browser_click.execute({ ref: "ref_2" }, {});
  assert(click.startsWith("clicked ref_2"), "browser_click via last-used tab", click);

  const evalResult = await hooks.tool.browser_evaluate.execute({ expression: "document.title" }, {});
  assert(evalResult.includes("sim-result"), "browser_evaluate returns JSON value", evalResult);

  const shot = await hooks.tool.browser_screenshot.execute({}, {});
  assert(shot.includes('"mimeType":"image/png"') && shot.includes('"data":"'), "browser_screenshot returns base64 JSON", shot.slice(0, 100));

  const cons = await hooks.tool.browser_console.execute({}, {});
  assert(!cons.startsWith("Error:") && cons.includes("sim console"), "browser_console flows canned entries", cons);

  const net = await hooks.tool.browser_network.execute({}, {});
  assert(!net.startsWith("Error:") && net.includes("https://example.com/api") && net.includes("200"), "browser_network flows canned entries", net);

  // --- disconnect -> clean errors ---
  sim.child.kill("SIGTERM");
  await sim.waitForExit();
  const disconnected = await poll(async () => {
    const s = await hooks.tool.browser_status.execute({}, {});
    return s.includes('"connected":false') ? s : null;
  }, { timeoutMs: 5_000 });
  pass("browser_status connected:false after sim exit");
  assert(disconnected.includes('"connected":false'), "disconnected status text", disconnected);

  const navAfter = await hooks.tool.browser_navigate.execute({ url: "https://example.com/" }, {});
  assert(navAfter.startsWith("Error:") && navAfter.includes("not connected"), "browser_navigate after disconnect -> clean error", navAfter);
} catch (err) {
  fail("plugin smoke run", err?.stack ?? String(err));
} finally {
  clearTimeout(watchdog);
  for (const c of children) {
    try {
      c.child.kill("SIGTERM");
    } catch {
      // already gone
    }
  }
  try {
    fs.rmSync(dataDir, { recursive: true, force: true });
  } catch {
    // best effort
  }
}

if (failures === 0) {
  console.log("PLUGIN SMOKE OK");
  process.exit(0);
} else {
  console.error(`PLUGIN SMOKE FAILED (${failures} assertion(s))`);
  process.exit(1);
}
