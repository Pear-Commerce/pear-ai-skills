# opencode-chrome-bridge

Drive a real Chrome browser from opencode: navigate, read pages as a compact
snapshot with stable element refs, click, type, scroll, screenshot, and
evaluate JS — all through native `browser_*` tools.

Two ways to run the bridge host, one extension, one shared pairing token:

- **Plugin (default)** — a single self-contained file lives inside the
  opencode server process (Bun) and hosts the extension WebSocket server
  itself. No daemon, no MCP config, no npm dependencies.
- **Standalone daemon (fallback)** — a separate Node process that exposes the
  same tools over MCP. Use this when several opencode instances (or other MCP
  clients) must share one Chrome, or when you run opencode in an environment
  where plugins are disabled.

Both speak the exact same wire protocol to the MV3 extension and share
`~/.opencode-chrome-bridge/config.json`, so you can switch hosts without
re-pairing. Only one host may own the port at a time.

## Install (plugin — 3 steps)

```sh
# 1. put the repo somewhere permanent
git clone <this-repo> ~/code/opencode-chrome-bridge   # or copy the folder

# 2. install the plugin (single file, zero dependencies)
cp ~/code/opencode-chrome-bridge/plugin/chrome-bridge.plugin.js ~/.config/opencode/plugins/

# 3. restart opencode
```

Then pair the extension. In Chrome: `chrome://extensions` → enable Developer
mode → **Load unpacked** → select `<repo>/extension/`. Then:

```sh
node ~/code/opencode-chrome-bridge/bin/chrome-bridge.js pair
```

`pair` finds the Chrome profile that has the extension and opens its
self-pairing page there — the token travels in the URL fragment (never leaves
the machine), the page saves it, and the extension connects automatically.
No typing. Manual fallback if a profile can't be found:
`chrome-bridge token` → paste into the extension popup (port `8823`).

Done. The 16 `browser_*` tools are now available natively in every opencode
session on this machine.

## Alternative: standalone daemon (multi-instance / MCP clients)

```sh
node <repo>/bin/chrome-bridge.js start     # foreground; Ctrl-C to stop
```

Add the MCP endpoint to `opencode.json` (or `~/.config/opencode/opencode.json`):

```json
{
  "mcp": {
    "chrome_bridge": {
      "type": "remote",
      "url": "http://127.0.0.1:8823/mcp"
    }
  }
}
```

In daemon mode the tools appear namespaced as `chrome_bridge_browser_*`
(opencode's `<mcpServer>_<tool>` convention); in plugin mode they are plain
`browser_*`. The extension pairing (token popup) is identical.

## Architecture

```
PLUGIN MODE (default — single process)
┌──────────────────────────── opencode server (Bun) ───────────────────────────┐
│  plugin/chrome-bridge.plugin.js                                               │
│    • registers native browser_* tools                                         │
│    • Bun.serve: ws://127.0.0.1:8823/extension  +  GET /health (open)          │
└───────────────────────────────────────────┬───────────────────────────────────┘
                   WS {id,method,params} ⇄ {id,result}|{id,error}
                   (token + chrome-extension:// origin auth, 20s ping)
                                            ▼
                          ┌─────────────────────────────────┐
                          │  Chrome MV3 extension           │
                          │  background.js ⇄ chrome.tabs /  │
                          │  scripting (snapshot/click/...) │
                          └─────────────────────────────────┘

DAEMON MODE (fallback — shared by multiple opencode instances / MCP clients)
┌────────────┐  MCP (HTTP JSON-RPC)   ┌──────────────────────────────┐
│  opencode  │ ─────────────────────▶ │  node bin/chrome-bridge.js   │
│  (chrome_  │  POST /mcp             │  start  (standalone daemon)  │
│  bridge_*  │                        │  • hosts /extension WS       │
│  tools)    │                        │  • GET /health (open)        │
└────────────┘                        └───────────────┬──────────────┘
                                                      │ same WS protocol
                                                      ▼
                                        Chrome MV3 extension (same folder)
```

The extension connects to whichever host owns the port; the plugin detects a
running daemon (via `GET /health`) and disables itself with a clean warning
instead of crashing opencode — stop the daemon or set `CHROME_BRIDGE_PORT`.

## Usage (agent loop)

1. `browser_status` — is the extension connected?
2. `browser_navigate` (or `browser_open_tab`) → URL.
3. `browser_snapshot` → compact text tree; interactive elements carry
   `ref_N` ids.
4. Act with `browser_click` / `browser_type` / `browser_press_key` /
   `browser_scroll` using those refs.
5. `browser_snapshot` again to verify; `browser_screenshot` for visual checks.
6. `browser_wait_for` after async loads; `browser_evaluate` for data
   extraction; `browser_back`, `browser_close_tab` for housekeeping.

Tab targeting: every tab-scoped tool accepts an optional `tabId`; without it
the bridge uses the last-used tab, then the active tab in the `opencode` tab
group. `browser_list_tabs` shows ids, titles, urls, and groups.

## Config

- File: `$CHROME_BRIDGE_DATA_DIR/config.json`, default
  `~/.opencode-chrome-bridge/config.json` (auto-created, mode `0600`).
- Token: generated on first use; print it any time with
  `node bin/chrome-bridge.js token`.
- Port: `$CHROME_BRIDGE_PORT` → `config.port` → `8823`.

## Health check

```sh
curl -s http://127.0.0.1:8823/health
# {"ok":true,"service":"chrome-bridge","mode":"plugin"|"daemon","version":"1.0.0","port":8823,"connected":false,"uptimeMs":...}
```

## Development

```sh
node test/smoke.mjs          # daemon-mode e2e (plain Node, zero deps)
bun test/plugin-smoke.mjs    # plugin-mode e2e (Bun, simulated opencode host)
bun test/double-invoke.test.mjs  # plugin double-instantiation regression
bun test/e2e-driver.mjs      # REAL-Chromium e2e (see below)
```

Both smoke suites spawn `test/client-sim.js`, a fake extension that speaks
the real wire protocol, and assert tool behavior end to end.

### Real-Chromium e2e (`test/e2e-driver.mjs`)

Drives a real Chromium + the real unpacked extension + the real daemon
through every tool, asserting live page effects (CDP typing, clicking,
console/network capture, screenshots). Setup it assumes:

```sh
# 1. local test page + daemon
python3 -m http.server 8890 &
node bin/chrome-bridge.js start &
# 2. Chromium (a Playwright build accepts --load-extension; branded Chrome doesn't)
/path/to/chromium --user-data-dir=<FRESH-TMP-DIR> --remote-debugging-port=9224 \
  --load-extension="$PWD/extension" --no-first-run about:blank &
# 3. run (the driver seeds the pairing token into the extension via CDP)
bun test/e2e-driver.mjs
```

**Always use a fresh `--user-data-dir`.** Chromium caches the extension's
service-worker scripts per profile: with a reused dir, code edits silently
don't load and you test stale bytecode (this cost us a full debugging
session). Same trap when developing in your real Chrome — after editing
`extension/` files, click **Reload** on the extension card in
`chrome://extensions` (or bump the manifest version) or you'll be running
the old code.

## Layout

```
bin/chrome-bridge.js            CLI: start | token | health
src/config.js                   shared config + token (daemon side)
src/ext-protocol.js             wire protocol constants + frame helpers
src/ws.js                       zero-dep RFC6455 WebSocket (daemon + tests)
src/bridge-core.js              extension session: auth slot, ping, per-tab
                                serialization, timeouts, tab resolution,
                                SW-restart resilience (pending re-dispatch)
src/tools.js                    the 16 browser_* tool definitions
src/mcp-server.js               MCP envelope (tools/list, tools/call, /mcp)
src/daemon.js                   standalone host: /extension + /health + /mcp
plugin/chrome-bridge.plugin.js  self-contained opencode plugin (Bun)
extension/                      MV3 extension (background, page fns, popup)
skill/SKILL.md                  agent skill: install + usage playbook
test/client-sim.js              fake extension (protocol-correct WS client)
test/smoke.mjs                  daemon smoke test
test/plugin-smoke.mjs           plugin smoke test
test/double-invoke.test.mjs     plugin double-instantiation regression
test/e2e-driver.mjs             real-Chromium end-to-end driver
```
