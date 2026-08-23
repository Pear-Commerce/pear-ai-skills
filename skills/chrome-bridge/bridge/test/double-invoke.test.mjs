// Regression: opencode invokes the plugin export more than once per bootstrap.
// Both invocations must return live 16-tool maps sharing one bridge — the
// second must not EADDRINUSE into a degraded map. Requires bun (Bun.serve).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "chrome-bridge-dbl-"));
process.env.CHROME_BRIDGE_DATA_DIR = dataDir;
process.env.CHROME_BRIDGE_PORT = process.env.CHROME_BRIDGE_PORT || "8896";

const { default: plugin } = await import("../plugin/chrome-bridge.plugin.js");
const a = await plugin({});
const b = await plugin({});
const na = Object.keys(a.tool).length;
const nb = Object.keys(b.tool).length;
if (na !== 16 || nb !== 16) {
  console.error(`FAIL tool counts ${na}/${nb}`);
  process.exit(1);
}
const r1 = await a.tool.browser_status.execute({});
const r2 = await b.tool.browser_status.execute({});
if (!r1.includes('"connected"') || !r2.includes('"connected"')) {
  console.error(`FAIL status: ${r1} | ${r2}`);
  process.exit(1);
}
if (/Error: bridge unavailable/.test(r1 + r2)) {
  console.error(`FAIL degraded map leaked: ${r1} | ${r2}`);
  process.exit(1);
}
console.log("PASS double invocation: 16+16 tools, both live, shared bridge");
process.exit(0);
