---
name: chrome-bridge
description: Drive the user's REAL Chrome browser (their profile, their logins) from an AI agent — navigate, snapshot pages into clickable refs, click, type, scroll, screenshot, read console/network, evaluate JS. Installs as a zero-dependency opencode plugin plus an MV3 Chrome extension connected over a localhost WebSocket (standalone MCP daemon available for multi-instance). Use when the user asks to browse/automate/verify pages in their own Chrome, mentions chrome-bridge or browser_* tools, asks to pair or set up the bridge, or wants an agent to act on pages that need their real sessions.
---

# chrome-bridge

Let the agent drive the user's real Chrome. Architecture: opencode plugin
hosts a localhost bridge (127.0.0.1:8823) ⇄ MV3 extension connects over a
token-authenticated WebSocket ⇄ real CDP (`chrome.debugger`) performs trusted
input. Nothing leaves the machine; the extension uses the user's real profile
and logins.

Canonical runtime lives in this repo at `skills/chrome-bridge/bridge/`.
Do not copy or move it elsewhere — the unpacked extension must load from a
stable path.

## Install for a user (agent-run)

```bash
curl -fsSL https://raw.githubusercontent.com/Pear-Commerce/pear-ai-skills/main/skills/chrome-bridge/install.sh | bash
```

The installer: syncs the canonical repo to `~/pear-ai-skills`, installs this
skill into the detected assistant targets, copies the opencode plugin to
`~/.config/opencode/plugins/`, then runs pairing.

If anything needs a password/browser login, explain the prompt and wait.

## Enable in Chrome (one-time, two steps)

1. `chrome://extensions` → Developer mode → **Load unpacked** → select
   `~/pear-ai-skills/skills/chrome-bridge/bridge/extension/`.
2. `node ~/pear-ai-skills/skills/chrome-bridge/bridge/bin/chrome-bridge.js pair`
   — finds the Chrome profile that has the extension and opens its
   self-pairing page there; no typing. Manual fallback: `... token` → paste
   into the extension popup (port `8823`).

Then **restart opencode** so the plugin loads (plugins load at session
bootstrap, not hot).

## Verify (always run these after installing for someone)

```bash
node ~/pear-ai-skills/skills/chrome-bridge/bridge/bin/chrome-bridge.js health
# expect: {"ok":true,"mode":"plugin"|"daemon","connected":true,...}
```

Then do a live check: `browser_list_tabs` (should list their real tabs),
`browser_open_tab https://example.com`, `browser_snapshot` (tree with refs),
`browser_close_tab` with the returned id. If those work, the bridge is good.

## Core loop

1. `browser_status` — if not connected, fix pairing first (see errors).
2. `browser_navigate`/`browser_open_tab` — new tabs land in an "opencode" tab
   group; close what you opened with `browser_close_tab` when done.
3. `browser_snapshot` — PRIMARY perception. Interactive elements carry
   `[ref_N]` handles. Re-snapshot after navigation or big DOM changes; stale
   refs error cleanly.
4. Act: `browser_click {ref}`, `browser_type {ref, text, submit?}`,
   `browser_press_key {key, modifiers?}`, `browser_scroll {deltaY|ref}`.
5. Verify: `browser_snapshot` again; `browser_screenshot` only for visual
   checks. `browser_wait_for {text|selector}` after async loads.
6. Debug: `browser_console {level?}` (errors after an action),
   `browser_network {filter?}` (request statuses), `browser_evaluate`
   (JS extraction).

Tools appear as `browser_*` in plugin mode, `chrome_bridge_browser_*` in
daemon/MCP mode.

## Safety model

- Bridge binds 127.0.0.1 only; token lives at `~/.opencode-chrome-bridge/
  config.json` (0600). `pair` passes it in a URL fragment — never networked.
- Driven tabs show Chrome's "started debugging this browser" infobar — that is
  the `debugger` permission working, same as commercial agentic extensions.
- Extension needs `<all_urls>` + `debugger` to inject/act on any page.
- chrome:// pages and the Chrome Web Store reject injection — navigate to a
  normal URL first. Do not fight bot defenses/CAPTCHAs; report instead.
- The agent can see everything in driven tabs (PII included). Only drive pages
  the user asked for; never browse their existing tabs unless told to.

## Error playbook

- `not connected to the Chrome extension` → run `health`; if host down, restart
  opencode (plugin) or `bin/chrome-bridge.js start` (daemon); if host up but
  disconnected, run `pair` again (profile/token mismatch).
- `bridge unavailable: port ... in use by standalone daemon` → both hosts
  running; stop the daemon (`pkill -f "chrome-bridge.js start"`).
- `ref_N is stale or missing` → re-snapshot.
- After editing `bridge/extension/` code: Chromium/Chrome caches the extension
  service worker per profile — click **Reload** on the extension card in
  chrome://extensions or you will be running stale code.
- `extension command ... timed out` → tab busy (long load/blocked dialog);
  retry once, then `browser_list_tabs` to see what's actually open.

## Multi-instance / MCP mode (optional)

For several opencode instances or other MCP clients sharing one Chrome, run the
daemon instead of the plugin: `node .../bin/chrome-bridge.js start`, plus
`"mcp": {"chrome_bridge": {"type":"remote","url":"http://127.0.0.1:8823/mcp"}}`
in opencode.json. Only one host may own the port at a time.
