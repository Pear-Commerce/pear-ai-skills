const tokenInput = document.getElementById("token");
const portInput = document.getElementById("port");
const saveButton = document.getElementById("save");
const statusEl = document.getElementById("status");

async function load() {
  const stored = await chrome.storage.local.get(["token", "port"]);
  if (typeof stored.token === "string") tokenInput.value = stored.token;
  if (Number.isInteger(stored.port)) portInput.value = String(stored.port);
}

saveButton.addEventListener("click", async () => {
  const token = tokenInput.value.trim();
  const port = Number(portInput.value);
  if (!token) {
    statusEl.textContent = "Token is required — run `chrome-bridge token` and paste it here.";
    return;
  }
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    statusEl.textContent = "Port must be an integer between 1 and 65535.";
    return;
  }
  await chrome.storage.local.set({ token, port });
  statusEl.textContent = "Saved — connecting to the bridge host…";
});

load();
