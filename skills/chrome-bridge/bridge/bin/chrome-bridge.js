#!/usr/bin/env node
// chrome-bridge CLI.
//
//   chrome-bridge start    run the standalone daemon (foreground)
//   chrome-bridge pair     one-command pairing: opens the extension's pairing
//                          page in the right Chrome profile with credentials
//                          in the URL fragment (never leaves the machine)
//   chrome-bridge token    print the pairing token + where it lives
//   chrome-bridge health   query the running host's /health endpoint
//   chrome-bridge help     show usage

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { getConfigPath, loadConfig, resolvePort } from "../src/config.js";
import { startDaemon } from "../src/daemon.js";

const CHROME_BIN = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const CHROME_DIR = path.join(os.homedir(), "Library/Application Support/Google/Chrome");
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Chrome derives the extension ID from the manifest "key" (SHA-256 of the DER
// public key, first 32 hex chars, nibbles mapped a-p). Recomputing it here
// keeps `pair` in sync with whatever key is in the manifest on disk.
function extensionIdFromKey() {
  const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "extension", "manifest.json"), "utf8"));
  const key = manifest.key;
  if (!key) return null;
  const digest = crypto.createHash("sha256").update(Buffer.from(key, "base64")).digest("hex");
  return digest.slice(0, 32).replace(/[0-9a-f]/g, (c) => String.fromCharCode("a".charCodeAt(0) + parseInt(c, 16)));
}

// Find the Chrome profile where the unpacked extension is loaded. The manifest
// "key" makes the ID deterministic, so prefer the keyed-ID entry (the live one
// after a reload); fall back to any entry whose source path matches ours —
// reloads that change the ID leave tombstone entries with the old ID.
function findExtensionProfile() {
  let entries = [];
  try {
    entries = fs.readdirSync(CHROME_DIR);
  } catch {
    return null;
  }
  const keyedId = extensionIdFromKey();
  let fallback = null;
  for (const dir of entries) {
    if (dir !== "Default" && !dir.startsWith("Profile ")) continue;
    const prefsPath = path.join(CHROME_DIR, dir, "Secure Preferences");
    let prefs;
    try {
      prefs = JSON.parse(fs.readFileSync(prefsPath, "utf8"));
    } catch {
      continue;
    }
    const settings = prefs?.extensions?.settings;
    if (!settings || typeof settings !== "object") continue;
    for (const [id, ext] of Object.entries(settings)) {
      const p = typeof ext?.path === "string" ? ext.path : "";
      const isOurs = p.includes("opencode-chrome-bridge") || p.includes("chrome-bridge/bridge/extension");
      if (!isOurs) continue;
      const hit = { profileDir: dir, id };
      if (keyedId && id === keyedId) return hit;
      fallback = fallback ?? hit;
    }
  }
  return fallback;
}

const cmd = process.argv[2] ?? "help";

async function main() {
  switch (cmd) {
    case "start": {
      const config = loadConfig();
      const port = resolvePort(config);
      let daemon;
      try {
        daemon = await startDaemon({ port });
      } catch (err) {
        console.error(`chrome-bridge: ${err?.message ?? err}`);
        process.exit(1);
      }
      console.log(`chrome-bridge daemon listening on http://127.0.0.1:${daemon.port}`);
      console.log(`  extension WS: ws://127.0.0.1:${daemon.port}/extension`);
      console.log(`  MCP endpoint: http://127.0.0.1:${daemon.port}/mcp`);
      console.log(`  health:       http://127.0.0.1:${daemon.port}/health`);
      console.log(`  config:       ${getConfigPath()}`);
      console.log(`  pairing:      run \`chrome-bridge token\` and paste the token into the extension popup`);
      const shutdown = async () => {
        await daemon.close();
        process.exit(0);
      };
      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);
      break;
    }
    case "token": {
      const config = loadConfig();
      console.log(config.token);
      console.log(`\n(stored in ${getConfigPath()} — shared by the daemon and the opencode plugin)`);
      break;
    }
    case "pair": {
      const config = loadConfig();
      const port = resolvePort(config);
      const found = findExtensionProfile();
      if (!found) {
        console.error(
          "chrome-bridge: extension not found in any Chrome profile.\n" +
            "Load it first: chrome://extensions → Developer mode → Load unpacked → extension/ folder, then re-run pair.",
        );
        process.exit(1);
      }
      const url = `chrome-extension://${found.id}/pairing.html#token=${encodeURIComponent(config.token)}&port=${port}`;
      if (!fs.existsSync(CHROME_BIN)) {
        console.log(`chrome-bridge: Chrome not found at ${CHROME_BIN} — open this URL in the Chrome profile that has the extension:\n\n${url}\n`);
        process.exit(1);
      }
      const child = spawn(CHROME_BIN, [`--profile-directory=${found.profileDir}`, url], { detached: true, stdio: "ignore" });
      child.unref();
      console.log(`pairing page opened in Chrome profile "${found.profileDir}" (extension ${found.id})`);
      // Watch /health: when the pairing page saves the token, the extension
      // connects to whichever host (plugin or daemon) owns the port.
      const deadline = Date.now() + 30_000;
      while (Date.now() < deadline) {
        try {
          const res = await fetch(`http://127.0.0.1:${port}/health`);
          const health = await res.json();
          if (health.connected) {
            console.log(`paired and connected to the ${health.mode ?? "host"} on 127.0.0.1:${port} — done.`);
            process.exit(0);
          }
        } catch {
          // no host up yet; keep waiting
        }
        await new Promise((r) => setTimeout(r, 500));
      }
      console.log(`pairing page opened. If the tab said "paired", the extension will connect automatically once a host is up (restart opencode, or \`chrome-bridge start\`).`);
      process.exit(0);
    }
    case "health": {
      const config = loadConfig();
      const port = resolvePort(config);
      try {
        const res = await fetch(`http://127.0.0.1:${port}/health`);
        console.log(await res.text());
        process.exit(res.ok ? 0 : 1);
      } catch (err) {
        console.error(`chrome-bridge: no host answering on 127.0.0.1:${port} (${err?.message ?? err})`);
        process.exit(1);
      }
      break;
    }
    case "help":
    case "--help":
    case "-h":
    default: {
      console.log(
        [
          "chrome-bridge — drive Chrome from opencode",
          "",
          "usage:",
          "  chrome-bridge start    run the standalone daemon (foreground)",
          "  chrome-bridge pair     one-command pairing (opens Chrome, no typing)",
          "  chrome-bridge token    print the pairing token (manual fallback)",
          "  chrome-bridge health   query the running host's /health endpoint",
          "",
          "config:  $CHROME_BRIDGE_DATA_DIR or ~/.opencode-chrome-bridge/config.json",
          "port:    $CHROME_BRIDGE_PORT -> config.port -> 8823",
          "",
          "opencode plugin mode (default, no daemon needed):",
          "  cp plugin/chrome-bridge.plugin.js ~/.config/opencode/plugins/",
          "opencode daemon/MCP mode (multi-instance):",
          '  { "mcp": { "chrome_bridge": { "type": "remote", "url": "http://127.0.0.1:8823/mcp" } } }',
        ].join("\n"),
      );
      if (cmd !== "help" && cmd !== "--help" && cmd !== "-h") {
        console.error(`\nchrome-bridge: unknown command '${cmd}'`);
        process.exit(2);
      }
    }
  }
}

main().catch((err) => {
  console.error(`chrome-bridge: ${err?.message ?? err}`);
  process.exit(1);
});
