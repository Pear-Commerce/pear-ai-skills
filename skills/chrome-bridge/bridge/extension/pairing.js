// Pairing page: opened by `chrome-bridge pair` as
//   chrome-extension://<id>/pairing.html#token=<token>&port=<port>
// Persists credentials to chrome.storage.local; background.js's storage
// listener reconnects automatically. The fragment never leaves the machine.

const statusEl = document.getElementById("status");

function fail(msg) {
  statusEl.textContent = msg;
  statusEl.className = "err";
}

document.addEventListener("DOMContentLoaded", async () => {
  const params = new URLSearchParams(location.hash.replace(/^#/, ""));
  const token = params.get("token") ?? "";
  const port = Number(params.get("port") ?? "8823");

  if (!/^[A-Za-z0-9_=-]{20,}$/.test(token)) {
    fail("invalid pairing link — missing or malformed token.\nRun `chrome-bridge pair` to get a fresh one.");
    return;
  }
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    fail("invalid pairing link — bad port.\nRun `chrome-bridge pair` to get a fresh one.");
    return;
  }

  await chrome.storage.local.set({ token, port });
  statusEl.textContent = "paired with chrome-bridge on port " + port + ".\nYou can close this tab.";
  statusEl.className = "ok";
  setTimeout(() => window.close(), 1500);
});
