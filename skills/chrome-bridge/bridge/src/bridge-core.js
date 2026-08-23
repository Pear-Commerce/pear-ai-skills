// Extension session management for the bridge host (daemon side; the plugin
// carries an inline copy adapted to Bun.serve's websocket handlers).
//
// - exactly one extension connection at a time; a new one replaces the old
// - 20s application-level ping keepalive; unanswered ping drops the socket
// - per-tab command serialization so actions on one tab never interleave
// - 20s default / 40s long (navigate, waitFor) command timeouts
// - last-used-tab tracking with the resolution order:
//     explicit tabId -> lastUsedTabId (if still open) -> active tab in the
//     "opencode" tab group -> clean error

import { EventEmitter } from "node:events";
import {
  PING_INTERVAL_MS,
  DEFAULT_CMD_TIMEOUT_MS,
  OPENCODE_GROUP_TITLE,
  encodeRequest,
  parseMessage,
} from "./ext-protocol.js";

export const NOT_CONNECTED_ERROR =
  "not connected to the Chrome extension — open Chrome with the chrome-bridge extension installed and paired (same token/port)";

// How long callRaw waits for a suspended service worker to reconnect.
const RECONNECT_WAIT_MS = 25_000;

export class ExtensionBridge extends EventEmitter {
  constructor() {
    super();
    this._ext = null; // { conn, connectedAt }
    this._pending = new Map(); // id -> { resolve, reject, timer, method }
    this._nextId = 1;
    this._tabQueues = new Map(); // tabId -> Promise chain
    this._pingTimer = null;
    this._pingInFlight = false;
    this.lastUsedTabId = null;
  }

  get connected() {
    return this._ext !== null;
  }

  get connectedAt() {
    return this._ext?.connectedAt ?? null;
  }

  /** Attach a freshly accepted extension connection, replacing any old one. */
  attach(conn) {
    if (this._ext) {
      const old = this._ext.conn;
      this._ext = null;
      this._stopPing();
      // MV3 service workers die and reconnect routinely. Calls in flight on
      // the old socket are re-dispatched on the new one (same id) instead of
      // being rejected — a restart becomes a latency blip, not an error.
      this._redispatchPending();
      try {
        old.close(1000, "replaced by new extension connection");
      } catch {
        old.terminate?.();
      }
    }
    this._ext = { conn, connectedAt: Date.now() };
    conn.on("message", (data) => this._onMessage(conn, data));
    conn.on("close", () => this._onClose(conn));
    conn.on("error", () => {}); // close follows; avoid unhandled 'error'
    this._startPing();
    this.emit("connect");
  }

  _redispatchPending() {
    for (const [id, p] of this._pending) {
      clearTimeout(p.timer);
      p.timer = setTimeout(() => {
        this._pending.delete(id);
        p.reject(new Error(`extension command '${p.method}' timed out after ${p.timeoutMs}ms`));
      }, p.timeoutMs);
      p.timer.unref?.();
      try {
        this._ext?.conn.send(encodeRequest(id, p.method, p.params));
      } catch (err) {
        this._pending.delete(id);
        p.reject(err);
      }
    }
  }

  _onClose(conn) {
    if (!this._ext || this._ext.conn !== conn) return;
    this._ext = null;
    this._stopPing();
    // Pending calls are NOT rejected here: a suspended service worker
    // typically reconnects within seconds and attach() re-dispatches them;
    // if it never returns, each call's own timeout is the failure path.
    this.emit("disconnect");
  }

  _rejectAllPending(err) {
    for (const [, p] of this._pending) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    this._pending.clear();
  }

  _onMessage(conn, data) {
    if (!this._ext || this._ext.conn !== conn) return;
    const msg = parseMessage(data);
    if (!msg) return;
    const id = String(msg.id);
    const p = this._pending.get(id);
    if (!p) return; // late/unknown response — ignore
    this._pending.delete(id);
    clearTimeout(p.timer);
    if (msg.error) {
      const raw = msg.error && typeof msg.error === "object" ? msg.error.message : msg.error;
      p.reject(new Error(`extension '${p.method}' failed: ${raw ?? "unknown error"}`));
    } else {
      p.resolve(msg.result);
    }
  }

  _startPing() {
    this._stopPing();
    this._pingTimer = setInterval(() => {
      if (!this.connected || this._pingInFlight) return;
      this._pingInFlight = true;
      this.callRaw("ping", {}, DEFAULT_CMD_TIMEOUT_MS)
        .catch(() => {
          try {
            this._ext?.conn.close(1001, "ping timeout");
          } catch {
            this._ext?.conn.terminate?.();
          }
        })
        .finally(() => {
          this._pingInFlight = false;
        });
    }, PING_INTERVAL_MS);
    this._pingTimer.unref?.();
  }

  _stopPing() {
    if (this._pingTimer) {
      clearInterval(this._pingTimer);
      this._pingTimer = null;
    }
    this._pingInFlight = false;
  }

  /** Send one request to the extension; no tab serialization. */
  async callRaw(method, params = {}, timeoutMs = DEFAULT_CMD_TIMEOUT_MS) {
    // Tolerate the gap while a suspended service worker restarts and
    // reconnects (alarm-driven, normally <30s) instead of failing fast.
    const deadline = Date.now() + RECONNECT_WAIT_MS;
    while (!this._ext) {
      if (Date.now() >= deadline) throw new Error(NOT_CONNECTED_ERROR);
      await new Promise((r) => setTimeout(r, 100));
    }
    const id = `c-${this._nextId++}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pending.delete(id);
        reject(new Error(`extension command '${method}' timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      timer.unref?.();
      this._pending.set(id, { resolve, reject, timer, method, params, timeoutMs });
      try {
        this._ext.conn.send(encodeRequest(id, method, params));
      } catch (err) {
        clearTimeout(timer);
        this._pending.delete(id);
        reject(err);
      }
    });
  }

  /**
   * Call the extension. Commands carrying a numeric params.tabId are
   * serialized per tab: they run one at a time, in issue order.
   */
  call(method, params = {}, { timeoutMs = DEFAULT_CMD_TIMEOUT_MS } = {}) {
    const tabId = params?.tabId;
    if (Number.isInteger(tabId) && tabId > 0) {
      return this._enqueueTab(tabId, () => this.callRaw(method, params, timeoutMs));
    }
    return this.callRaw(method, params, timeoutMs);
  }

  _enqueueTab(tabId, fn) {
    const prev = this._tabQueues.get(tabId) ?? Promise.resolve();
    const run = prev.catch(() => {}).then(fn);
    this._tabQueues.set(tabId, run);
    run
      .finally(() => {
        if (this._tabQueues.get(tabId) === run) this._tabQueues.delete(tabId);
      })
      .catch(() => {});
    return run;
  }

  markUsed(tabId) {
    if (Number.isInteger(tabId) && tabId > 0) this.lastUsedTabId = tabId;
  }

  clearUsed(tabId) {
    if (this.lastUsedTabId === tabId) this.lastUsedTabId = null;
  }

  /**
   * Tab resolution order: explicit -> lastUsedTabId (if still open) ->
   * active tab in the "opencode" group -> clean error.
   * Values <= 0 (0, -1, null) are treated as "not provided" so hosts whose
   * schema marks every property required can still mean "auto".
   */
  async resolveTabId(explicit) {
    if (Number.isInteger(explicit) && explicit > 0) return explicit;
    if (!this.connected) throw new Error(NOT_CONNECTED_ERROR);
    const tabs = await this.callRaw("listTabs", {});
    const list = Array.isArray(tabs) ? tabs : [];
    if (this.lastUsedTabId !== null && list.some((t) => t?.id === this.lastUsedTabId)) {
      return this.lastUsedTabId;
    }
    const active = list.find((t) => t?.active && t?.groupTitle === OPENCODE_GROUP_TITLE);
    if (active) return active.id;
    throw new Error(
      `no target tab — pass tabId, run any tab command first (sets the last-used tab), ` +
        `or activate a tab in the "${OPENCODE_GROUP_TITLE}" tab group`,
    );
  }

  dispose() {
    this._stopPing();
    this._rejectAllPending(new Error("chrome-bridge: bridge shutting down"));
    if (this._ext) {
      try {
        this._ext.conn.close(1001, "bridge shutting down");
      } catch {
        this._ext.conn.terminate?.();
      }
      this._ext = null;
    }
  }
}
