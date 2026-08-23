// Daemon-mode end-to-end smoke test (plain Node, zero deps).
//
//   node test/smoke.mjs
//
// Starts the real daemon on a scratch port + data dir, verifies /health,
// WS auth (bad token / bad origin), connects the fake extension
// (test/client-sim.js), drives the 16 tools through the MCP endpoint,
// checks one-extension-at-a-time replacement, and verifies clean errors
// after disconnect. Prints PASS lines and exits 0 on success.

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TOOL_NAMES } from "../src/tools.js";
import { connectWebSocket } from "../src/ws.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8891;
const BASE = `http://127.0.0.1:${PORT}`;

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

async function mcpCall(method, params) {
  const res = await fetch(`${BASE}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (res.status !== 200) throw new Error(`/mcp ${method} -> HTTP ${res.status}`);
  const msg = await res.json();
  if (msg.error) throw new Error(`/mcp ${method} -> ${msg.error.message}`);
  return msg.result;
}

function firstText(result) {
  const block = (result?.content ?? []).find((c) => c?.type === "text");
  return block?.text ?? "";
}

// ---------------------------------------------------------------------------

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "chrome-bridge-smoke-"));
const env = { CHROME_BRIDGE_DATA_DIR: dataDir, CHROME_BRIDGE_PORT: String(PORT) };
const children = [];

try {
  const daemon = spawnLogged(process.execPath, [path.join(ROOT, "bin", "chrome-bridge.js"), "start"], env, "daemon");
  children.push(daemon);

  const health = await poll(async () => {
    const res = await fetch(`${BASE}/health`);
    return res.ok ? res.json() : null;
  });
  assert(health.ok === true && health.mode === "daemon" && health.service === "chrome-bridge", "health shape", JSON.stringify(health));
  assert(health.connected === false, "health starts disconnected");

  const token = JSON.parse(fs.readFileSync(path.join(dataDir, "config.json"), "utf8")).token;
  assert(typeof token === "string" && token.length >= 16, "token generated in scratch config");

  // --- WS auth ---
  const badToken = await connectWebSocket(`ws://127.0.0.1:${PORT}/extension?token=wrong-token-value`, {
    headers: { Origin: "chrome-extension://chrome-bridge-client-sim" },
  }).then(
    () => null,
    (err) => err,
  );
  assert(badToken?.statusCode === 401, "WS bad token rejected 401", badToken?.message);

  const badOrigin = await connectWebSocket(`ws://127.0.0.1:${PORT}/extension?token=${encodeURIComponent(token)}`, {
    headers: { Origin: "https://evil.example" },
  }).then(
    () => null,
    (err) => err,
  );
  assert(badOrigin?.statusCode === 403, "WS non-extension origin rejected 403", badOrigin?.message);

  // --- connect fake extension ---
  const sim = spawnLogged(process.execPath, [path.join(ROOT, "test", "client-sim.js"), "--port", String(PORT), "--token", token], {}, "sim");
  children.push(sim);
  await sim.waitForLine("SIM connected");
  pass("client-sim connected");

  const health2 = await poll(async () => (await (await fetch(`${BASE}/health`)).json()).connected === true && true);
  assert(health2 === true, "health reports connected after sim attach");

  // --- MCP envelope ---
  const init = await mcpCall("initialize", { protocolVersion: "2024-11-05" });
  assert(init?.serverInfo?.name === "chrome-bridge", "mcp initialize serverInfo");

  const list = await mcpCall("tools/list", {});
  const names = (list?.tools ?? []).map((t) => t.name);
  assert(
    names.length === 16 &&
      TOOL_NAMES.every((n) => names.includes(n)) &&
      names.includes("browser_console") &&
      names.includes("browser_network"),
    "mcp tools/list returns exactly the 16 browser_* tools",
    names.join(","),
  );

  const status = await mcpCall("tools/call", { name: "browser_status", arguments: {} });
  assert(firstText(status).includes('"connected":true'), "browser_status connected:true", firstText(status));

  const snap = await mcpCall("tools/call", { name: "browser_snapshot", arguments: {} });
  assert(firstText(snap).includes("ref_") && firstText(snap).includes("Submit"), "browser_snapshot contains refs", firstText(snap).slice(0, 120));

  const nav = await mcpCall("tools/call", { name: "browser_navigate", arguments: { url: "https://example.com/docs" } });
  assert(firstText(nav).includes("https://example.com/docs"), "browser_navigate navigates", firstText(nav));

  const shot = await mcpCall("tools/call", { name: "browser_screenshot", arguments: {} });
  const img = (shot?.content ?? []).find((c) => c?.type === "image");
  assert(img?.mimeType === "image/png" && typeof img?.data === "string" && img.data.length > 0, "browser_screenshot returns MCP image block");

  const cons = await mcpCall("tools/call", { name: "browser_console", arguments: {} });
  assert(cons?.isError !== true && firstText(cons).includes("sim console"), "browser_console flows canned entries", firstText(cons));

  const net = await mcpCall("tools/call", { name: "browser_network", arguments: {} });
  assert(
    net?.isError !== true && firstText(net).includes("https://example.com/api") && firstText(net).includes("200"),
    "browser_network flows canned entries",
    firstText(net),
  );

  const unknown = await mcpCall("tools/call", { name: "browser_nope", arguments: {} });
  assert(unknown?.isError === true && firstText(unknown).startsWith("Error: unknown tool"), "unknown tool -> clean MCP error");

  // --- one extension at a time: new replaces old ---
  const sim2 = spawnLogged(process.execPath, [path.join(ROOT, "test", "client-sim.js"), "--port", String(PORT), "--token", token], {}, "sim2");
  children.push(sim2);
  await sim2.waitForLine("SIM connected");
  const sim1Exit = await sim.waitForExit();
  assert(sim1Exit === 0, "first sim replaced by second and exits cleanly", `exit=${sim1Exit}`);
  const stillConnected = await mcpCall("tools/call", { name: "browser_status", arguments: {} });
  assert(firstText(stillConnected).includes('"connected":true'), "bridge still connected after replacement");

  // --- disconnect -> clean errors ---
  sim2.child.kill("SIGTERM");
  await sim2.waitForExit();
  await poll(async () => (await (await fetch(`${BASE}/health`)).json()).connected === false && true, { timeoutMs: 5_000 });
  pass("health reports disconnected after sim exit");

  const navDead = await mcpCall("tools/call", { name: "browser_navigate", arguments: { url: "https://example.com/" } });
  assert(
    navDead?.isError === true && firstText(navDead).startsWith("Error:") && firstText(navDead).includes("not connected"),
    "browser_navigate while disconnected -> clean error",
    firstText(navDead),
  );

  // --- misc HTTP ---
  const getMcp = await fetch(`${BASE}/mcp`);
  assert(getMcp.status === 405, "GET /mcp -> 405");
  const notFound = await fetch(`${BASE}/nope`);
  assert(notFound.status === 404, "unknown path -> 404");
} catch (err) {
  fail("smoke run", err?.stack ?? String(err));
} finally {
  for (const c of children) {
    try {
      c.child.kill("SIGTERM");
    } catch {
      // already gone
    }
  }
  await sleep(200);
  try {
    fs.rmSync(dataDir, { recursive: true, force: true });
  } catch {
    // best effort
  }
}

if (failures === 0) {
  console.log("SMOKE OK (daemon mode)");
  process.exit(0);
} else {
  console.error(`SMOKE FAILED (${failures} assertion(s))`);
  process.exit(1);
}
