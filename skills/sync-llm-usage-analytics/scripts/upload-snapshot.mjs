#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const file = process.argv[2];
if (!file) throw new Error("Usage: upload-snapshot.mjs /absolute/path/snapshot.json");
const body = JSON.parse(await readFile(file, "utf8"));
if (!["openai", "anthropic"].includes(body.provider) || !/^\d{4}-\d{2}-\d{2}$/.test(body.date || "") || !Array.isArray(body.users)) throw new Error("Invalid snapshot schema");
const token = execFileSync("security", ["find-generic-password", "-a", "eric", "-s", "llm-usage-ingest-token", "-w"], { encoding: "utf8" }).trim();
const response = await fetch("https://llm-usage.intern.pearcommerce.com/api/ingest/browser-snapshot", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
if (!response.ok) {
  const responseText = await response.text();
  const cloudflareWafBlock = response.status === 403 && /Attention Required|cf\.errors\.css/i.test(responseText);
  if (!cloudflareWafBlock) throw new Error(`Upload failed (${response.status}): ${responseText.slice(0, 300)}`);
  const namespaceId = process.env.LLM_USAGE_KV_NAMESPACE_ID || "d79da0a2948e41b896bb7b4dbef57dfe";
  const appDir = process.env.LLM_USAGE_APP_DIR || join(process.env.HOME || "", "openrouter-fireworks-usage");
  const wranglerBin = join(appDir, "node_modules", ".bin", "wrangler");
  if (!existsSync(wranglerBin)) throw new Error(`Upload hit Cloudflare WAF and Wrangler fallback is unavailable at ${wranglerBin}`);
  const snapshot = { ...body, capturedAt: new Date().toISOString(), source: "browser" };
  execFileSync(wranglerBin, ["kv:key", "put", "--namespace-id", namespaceId, `v1:${body.provider}:${body.date}`, JSON.stringify(snapshot)], { cwd: appDir, stdio: "pipe" });
  console.log(`Uploaded ${body.provider} ${body.date}: ${body.users.length} users (Wrangler WAF fallback)`);
  process.exit(0);
}
const result = await response.json();
console.log(`Uploaded ${result.provider} ${result.date}: ${result.users} users`);
