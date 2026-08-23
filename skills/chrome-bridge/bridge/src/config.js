// Config + token management for chrome-bridge.
//
// The SAME config file is shared by the standalone daemon and the opencode
// plugin, so the extension pairs once and works with either host.
//
//   data dir:  $CHROME_BRIDGE_DATA_DIR  or  ~/.opencode-chrome-bridge/
//   file:      <data dir>/config.json   { "token": "...", "port": 8823? }
//   port:      $CHROME_BRIDGE_PORT  ->  config.port  ->  8823
//
// The token is generated on first use and the file is written with mode 0600.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

export const DEFAULT_PORT = 8823;
export const CONFIG_FILE_NAME = "config.json";

export function getDataDir() {
  const override = process.env.CHROME_BRIDGE_DATA_DIR;
  if (override && override.trim()) return path.resolve(override);
  return path.join(os.homedir(), ".opencode-chrome-bridge");
}

export function getConfigPath() {
  return path.join(getDataDir(), CONFIG_FILE_NAME);
}

function generateToken() {
  return crypto.randomBytes(24).toString("base64url");
}

function isValidPort(value) {
  return Number.isInteger(value) && value > 0 && value <= 65535;
}

/**
 * Read the config file, generating and persisting a token on first use.
 * Never throws on malformed JSON — regenerates the missing pieces instead.
 */
export function loadConfig() {
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
    cfg.token = generateToken();
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

/** Port resolution order: $CHROME_BRIDGE_PORT -> config.port -> 8823. */
export function resolvePort(cfg) {
  const env = process.env.CHROME_BRIDGE_PORT;
  if (env && /^\d+$/.test(env.trim())) {
    const n = Number(env.trim());
    if (isValidPort(n)) return n;
  }
  if (cfg && isValidPort(cfg.port)) return cfg.port;
  return DEFAULT_PORT;
}
