#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const file = process.argv[2];
if (!file) throw new Error("Usage: upload-snapshot.mjs /absolute/path/snapshot.json");
const body = JSON.parse(await readFile(file, "utf8"));
if (!["openai", "anthropic"].includes(body.provider) || !/^\d{4}-\d{2}-\d{2}$/.test(body.date || "") || !Array.isArray(body.users)) throw new Error("Invalid snapshot schema");
const token = execFileSync("security", ["find-generic-password", "-a", "eric", "-s", "llm-usage-ingest-token", "-w"], { encoding: "utf8" }).trim();
const response = await fetch("https://llm-usage.intern.pearcommerce.com/api/ingest/browser-snapshot", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
if (!response.ok) throw new Error(`Upload failed (${response.status}): ${(await response.text()).slice(0, 300)}`);
const result = await response.json();
console.log(`Uploaded ${result.provider} ${result.date}: ${result.users} users`);
