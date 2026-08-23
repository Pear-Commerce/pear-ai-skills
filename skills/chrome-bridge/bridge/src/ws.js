// Minimal zero-dependency RFC 6455 WebSocket framing for the daemon (Node)
// and for test clients. The opencode plugin does NOT use this file — it uses
// Bun.serve({ websocket }) — but both speak the exact same wire protocol.
//
// Supports: text frames, fragmentation, ping/pong, close handshake, and
// HTTP-level rejection with a status code (used for auth failures).

import crypto from "node:crypto";
import net from "node:net";
import { EventEmitter } from "node:events";

const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

const OP_CONT = 0x0;
const OP_TEXT = 0x1;
const OP_BIN = 0x2;
const OP_CLOSE = 0x8;
const OP_PING = 0x9;
const OP_PONG = 0xa;

const MAX_PAYLOAD = 64 * 1024 * 1024;

function acceptKey(key) {
  return crypto.createHash("sha1").update(key + WS_GUID).digest("base64");
}

/**
 * One WebSocket connection over a net.Socket.
 * Events: "message" (string), "close" (code, reason), "pong" (Buffer), "error".
 */
export class WsConn extends EventEmitter {
  constructor(socket, { maskOutgoing }) {
    super();
    this._socket = socket;
    this._maskOutgoing = maskOutgoing;
    this._buf = Buffer.alloc(0);
    this._frag = null; // { opcode, parts: Buffer[] }
    this._closeSent = false;
    this._closeEmitted = false;

    socket.on("data", (chunk) => this._feed(chunk));
    socket.on("error", (err) => this._emitError(err));
    socket.on("close", () => this._emitClose(1006, "abnormal closure"));
    socket.on("end", () => this._emitClose(1006, "abnormal closure"));
  }

  send(text) {
    this._writeFrame(OP_TEXT, Buffer.from(text, "utf8"));
  }

  ping(payload = Buffer.alloc(0)) {
    this._writeFrame(OP_PING, payload);
  }

  pong(payload = Buffer.alloc(0)) {
    this._writeFrame(OP_PONG, payload);
  }

  close(code = 1000, reason = "") {
    if (this._closeSent) {
      this._socket.end();
      return;
    }
    this._closeSent = true;
    const reasonBuf = Buffer.from(String(reason).slice(0, 120), "utf8");
    const payload = Buffer.alloc(2 + reasonBuf.length);
    payload.writeUInt16BE(code, 0);
    reasonBuf.copy(payload, 2);
    try {
      this._writeFrame(OP_CLOSE, payload);
    } catch {
      // socket already broken — nothing to send
    }
    this._socket.end();
  }

  terminate() {
    this._socket.destroy();
  }

  _emitError(err) {
    if (this.listenerCount("error") > 0) this.emit("error", err);
    this._emitClose(1006, "abnormal closure");
  }

  _emitClose(code, reason) {
    if (this._closeEmitted) return;
    this._closeEmitted = true;
    this.emit("close", code, reason);
  }

  _writeFrame(opcode, payload) {
    const mask = this._maskOutgoing;
    const len = payload.length;
    let headerLen = 2 + (len >= 126 ? (len > 0xffff ? 8 : 2) : 0) + (mask ? 4 : 0);
    const frame = Buffer.alloc(headerLen + len);
    frame[0] = 0x80 | opcode;
    let offset = 2;
    if (len < 126) {
      frame[1] = (mask ? 0x80 : 0) | len;
    } else if (len <= 0xffff) {
      frame[1] = (mask ? 0x80 : 0) | 126;
      frame.writeUInt16BE(len, 2);
      offset = 4;
    } else {
      frame[1] = (mask ? 0x80 : 0) | 127;
      frame.writeBigUInt64BE(BigInt(len), 2);
      offset = 10;
    }
    if (mask) {
      const key = crypto.randomBytes(4);
      key.copy(frame, offset);
      offset += 4;
      for (let i = 0; i < len; i++) frame[offset + i] = payload[i] ^ key[i & 3];
    } else {
      payload.copy(frame, offset);
    }
    this._socket.write(frame);
  }

  _feed(chunk) {
    this._buf = this._buf.length === 0 ? chunk : Buffer.concat([this._buf, chunk]);
    for (;;) {
      const buf = this._buf;
      if (buf.length < 2) return;
      const fin = (buf[0] & 0x80) !== 0;
      const opcode = buf[0] & 0x0f;
      const masked = (buf[1] & 0x80) !== 0;
      let len = buf[1] & 0x7f;
      let offset = 2;
      if (len === 126) {
        if (buf.length < 4) return;
        len = buf.readUInt16BE(2);
        offset = 4;
      } else if (len === 127) {
        if (buf.length < 10) return;
        const big = buf.readBigUInt64BE(2);
        if (big > BigInt(MAX_PAYLOAD)) {
          this.close(1009, "message too big");
          this._buf = Buffer.alloc(0);
          return;
        }
        len = Number(big);
        offset = 10;
      }
      if (len > MAX_PAYLOAD) {
        this.close(1009, "message too big");
        this._buf = Buffer.alloc(0);
        return;
      }
      const maskLen = masked ? 4 : 0;
      if (buf.length < offset + maskLen + len) return;
      let payload = buf.subarray(offset + maskLen, offset + maskLen + len);
      if (masked) {
        const key = buf.subarray(offset, offset + 4);
        const unmasked = Buffer.alloc(len);
        for (let i = 0; i < len; i++) unmasked[i] = payload[i] ^ key[i & 3];
        payload = unmasked;
      } else {
        payload = Buffer.from(payload); // detach from the shared buffer
      }
      this._buf = buf.subarray(offset + maskLen + len);
      this._handleFrame(fin, opcode, payload);
      if (this._closeEmitted) return;
    }
  }

  _handleFrame(fin, opcode, payload) {
    if (opcode === OP_CLOSE) {
      let code = 1000;
      let reason = "";
      if (payload.length >= 2) {
        code = payload.readUInt16BE(0);
        reason = payload.subarray(2).toString("utf8");
      }
      if (!this._closeSent) {
        this._closeSent = true;
        try {
          this._writeFrame(OP_CLOSE, payload);
        } catch {
          // ignore
        }
      }
      this._socket.end();
      this._emitClose(code, reason);
      return;
    }
    if (opcode === OP_PING) {
      try {
        this.pong(payload);
      } catch {
        // ignore
      }
      return;
    }
    if (opcode === OP_PONG) {
      this.emit("pong", payload);
      return;
    }
    if (opcode === OP_TEXT || opcode === OP_BIN || opcode === OP_CONT) {
      if (opcode === OP_CONT) {
        if (!this._frag) {
          this.close(1002, "unexpected continuation frame");
          return;
        }
        this._frag.parts.push(payload);
      } else if (!fin) {
        if (this._frag) {
          this.close(1002, "interleaved fragmented message");
          return;
        }
        this._frag = { opcode, parts: [payload] };
        return;
      }
      if (fin) {
        let opcodeOut = opcode;
        let body = payload;
        if (this._frag) {
          this._frag.parts.push(payload);
          body = Buffer.concat(this._frag.parts);
          opcodeOut = this._frag.opcode;
          this._frag = null;
        }
        if (opcodeOut === OP_TEXT) {
          this.emit("message", body.toString("utf8"));
        } else {
          this.emit("binary", body);
        }
      }
      return;
    }
    this.close(1002, "unknown opcode");
  }
}

/**
 * Server side: complete an upgrade request. Returns a WsConn, or null after
 * destroying the socket if the handshake headers are missing.
 */
export function acceptWebSocket(req, socket, head) {
  const key = req.headers["sec-websocket-key"];
  if (!key) {
    socket.destroy();
    return null;
  }
  const response =
    "HTTP/1.1 101 Switching Protocols\r\n" +
    "Upgrade: websocket\r\n" +
    "Connection: Upgrade\r\n" +
    `Sec-WebSocket-Accept: ${acceptKey(key)}\r\n` +
    "\r\n";
  socket.write(response);
  socket.setNoDelay(true);
  const conn = new WsConn(socket, { maskOutgoing: false });
  if (head && head.length > 0) conn._feed(head);
  return conn;
}

/** Write an HTTP error response onto an upgrade socket and destroy it. */
export function rejectUpgrade(socket, status, message) {
  const reason =
    { 400: "Bad Request", 401: "Unauthorized", 403: "Forbidden", 404: "Not Found" }[status] ?? "Error";
  try {
    socket.write(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  } catch {
    // ignore
  }
  socket.destroy();
}

/**
 * Client side: connect to ws://host:port/path?query with extra headers
 * (used by test/client-sim.js; masks outgoing frames per RFC).
 */
export function connectWebSocket(urlString, { headers = {}, timeoutMs = 10_000 } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const key = crypto.randomBytes(16).toString("base64");
    const socket = net.connect(Number(url.port) || 80, url.hostname);
    let settled = false;
    let handshakeBuf = Buffer.alloc(0);
    let conn = null;

    const fail = (err) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(err);
    };

    const timer = setTimeout(() => fail(new Error("websocket handshake timed out")), timeoutMs);

    socket.on("error", fail);
    socket.on("connect", () => {
      const lines = [
        `GET ${url.pathname}${url.search} HTTP/1.1`,
        `Host: ${url.host}`,
        "Upgrade: websocket",
        "Connection: Upgrade",
        `Sec-WebSocket-Key: ${key}`,
        "Sec-WebSocket-Version: 13",
      ];
      for (const [name, value] of Object.entries(headers)) lines.push(`${name}: ${value}`);
      socket.write(lines.join("\r\n") + "\r\n\r\n");
    });
    socket.on("data", (chunk) => {
      if (conn) return; // WsConn owns the socket now
      handshakeBuf = handshakeBuf.length === 0 ? chunk : Buffer.concat([handshakeBuf, chunk]);
      const end = handshakeBuf.indexOf("\r\n\r\n");
      if (end === -1) {
        if (handshakeBuf.length > 16 * 1024) fail(new Error("websocket handshake response too large"));
        return;
      }
      clearTimeout(timer);
      const headerText = handshakeBuf.subarray(0, end).toString("latin1");
      const rest = handshakeBuf.subarray(end + 4);
      const statusLine = headerText.split("\r\n", 1)[0] ?? "";
      const m = /^HTTP\/\d\.\d (\d{3})/.exec(statusLine);
      const status = m ? Number(m[1]) : 0;
      if (status !== 101) {
        const err = new Error(`websocket upgrade rejected with HTTP ${status || "(no status)"}`);
        err.statusCode = status;
        fail(err);
        return;
      }
      settled = true;
      conn = new WsConn(socket, { maskOutgoing: true });
      if (rest.length > 0) conn._feed(rest);
      resolve(conn);
    });
  });
}
