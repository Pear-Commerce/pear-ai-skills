#!/usr/bin/env node
import { createHmac } from "node:crypto";
import http from "node:http";
import https from "node:https";
import { spawnSync } from "node:child_process";

const DEFAULT_AUTH_URL = "https://auth-v2.intern.pearcommerce.com";
const DEFAULT_SECRET_ID = "intern-app-hosting-auth-v2-shared-secret";
const DEFAULT_REGION = "us-east-1";
const PROTECTED_WORKERS = new Set(["auth-intern", "auth-intern-v2"]);

const args = parseArgs(process.argv.slice(2));
const command = args._[0] || "verify-app";
const config = {
  appUrl: normalizeBaseUrl(args.url || args.appUrl || ""),
  authUrl: normalizeBaseUrl(args.authUrl || args["auth-url"] || DEFAULT_AUTH_URL),
  region: args.region || DEFAULT_REGION,
  secretId: args.secretId || args["secret-id"] || DEFAULT_SECRET_ID,
  workerName: args.worker || args.workerName || "",
  oauthCookie: args.oauthCookie || args["oauth-cookie"] || "",
  sessionCookie: args.sessionCookie || args["session-cookie"] || ""
};

try {
  if (command === "sync-app-secret") {
    syncAppSecret(config);
  } else if (command === "verify-app") {
    await verifyAppSecret(config);
  } else if (command === "verify-auth") {
    await verifyAuthService(config);
  } else {
    fail(`Unknown command "${command}". Use sync-app-secret, verify-app, or verify-auth.`);
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

function syncAppSecret({ region, secretId, workerName }) {
  if (!workerName) fail("Pass --worker <worker-name>.");
  assertAppWorkerName(workerName);

  const secret = readAwsSecret({ region, secretId });
  const result = spawnSync("npx", [
    "wrangler",
    "secret",
    "put",
    "AUTH_SHARED_SECRET",
    "--name",
    workerName
  ], {
    input: secret,
    encoding: "utf8"
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    fail(`Wrangler failed to update AUTH_SHARED_SECRET for ${workerName}.`);
  }

  console.log(`AUTH_SHARED_SECRET for ${workerName} now mirrors ${secretId} in ${region}.`);
}

function assertAppWorkerName(workerName) {
  const normalized = String(workerName || "").trim();
  if (PROTECTED_WORKERS.has(normalized) || normalized.startsWith("auth-")) {
    fail(`Refusing to modify protected shared auth Worker "${normalized}". Pass the app Worker name instead.`);
  }
}

async function verifyAuthService({ authUrl }) {
  const health = await requestNoRedirect(new URL("/healthz", authUrl));
  assertNotCloudflareBlock(health, authUrl);
  if (health.statusCode !== 200) {
    fail(`Expected ${authUrl}/healthz to return HTTP 200, got HTTP ${health.statusCode}: ${excerpt(health.body)}`);
  }

  const healthJson = JSON.parse(health.body);
  const missing = [];
  if (!healthJson.auth_shared_secret_set) missing.push("AUTH_SHARED_SECRET");
  if (!healthJson.google_client_id_set) missing.push("GOOGLE_CLIENT_ID");
  if (!healthJson.google_client_secret_set) missing.push("GOOGLE_CLIENT_SECRET");
  if (missing.length) {
    fail(`${authUrl} is reachable but missing Worker secrets: ${missing.join(", ")}.`);
  }

  const startUrl = new URL("/auth/google/start", authUrl);
  startUrl.searchParams.set("return_to", "https://sample.intern.pearcommerce.com/auth/google/callback");
  startUrl.searchParams.set("state", "auth-v2-check");
  startUrl.searchParams.set("nonce", "auth-v2-check");
  startUrl.searchParams.set("hosted_domain", "pearcommerce.com");
  startUrl.searchParams.set("app_name", "auth-v2-check");

  const start = await requestNoRedirect(startUrl);
  assertNotCloudflareBlock(start, authUrl);
  if (start.statusCode !== 302 || !String(start.headers.location || "").startsWith("https://accounts.google.com/")) {
    fail(`Expected shared auth start to redirect to Google, got HTTP ${start.statusCode}: ${excerpt(start.body)}`);
  }

  console.log(`Verified ${authUrl}: healthz is configured and start redirects to Google.`);
}

async function verifyAppSecret({ appUrl, authUrl, region, secretId, oauthCookie, sessionCookie }) {
  if (!appUrl) fail("Pass --url https://<app-name>.intern.pearcommerce.com.");
  if (!oauthCookie) fail("Pass --oauth-cookie <temporary-oauth-cookie-name>.");
  if (!sessionCookie) fail("Pass --session-cookie <session-cookie-name>.");

  const secret = readAwsSecret({ region, secretId });
  const loginUrl = new URL("/login", appUrl);
  loginUrl.searchParams.set("return_to", "/auth-secret-check");

  const login = await requestNoRedirect(loginUrl);
  assertNotCloudflareBlock(login, appUrl);
  if (login.statusCode !== 302) {
    fail(`Expected ${loginUrl} to redirect to shared auth, got HTTP ${login.statusCode}: ${excerpt(login.body)}`);
  }

  const location = login.headers.location;
  if (!location) {
    fail("Login response did not include a Location header.");
  }

  const sharedAuthUrl = new URL(location);
  if (sharedAuthUrl.origin !== authUrl) {
    fail(`Expected app to use ${authUrl}, got ${sharedAuthUrl.origin}.`);
  }

  const state = sharedAuthUrl.searchParams.get("state");
  const nonce = sharedAuthUrl.searchParams.get("nonce");
  if (!state || !nonce) {
    fail("Shared auth redirect is missing state or nonce.");
  }

  const pendingCookie = getCookie(login.headers["set-cookie"], oauthCookie);
  if (!pendingCookie) {
    fail(`Login response did not set ${oauthCookie}.`);
  }

  const sessionToken = signSharedSessionToken(secret, {
    email: "auth-secret-check@pearcommerce.com",
    name: "Auth Secret Check",
    hostedDomain: "pearcommerce.com",
    nonce,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 60
  });
  const callbackUrl = new URL("/auth/google/callback", appUrl);
  callbackUrl.searchParams.set("state", state);
  callbackUrl.searchParams.set("session_token", sessionToken);

  const callback = await requestNoRedirect(callbackUrl, {
    headers: {
      cookie: pendingCookie
    }
  });
  assertNotCloudflareBlock(callback, appUrl);

  const createdSession = getCookie(callback.headers["set-cookie"], sessionCookie);
  if (callback.statusCode === 302 && createdSession) {
    console.log(`Verified ${appUrl}: app accepts v2 tokens signed by ${secretId}.`);
    return;
  }

  fail(`Auth callback did not create a session. HTTP ${callback.statusCode}: ${excerpt(callback.body)}`);
}

function readAwsSecret({ region, secretId }) {
  const result = spawnSync("aws", [
    "secretsmanager",
    "get-secret-value",
    "--secret-id",
    secretId,
    "--region",
    region,
    "--query",
    "SecretString",
    "--output",
    "json"
  ], {
    encoding: "utf8"
  });

  if (result.status !== 0) {
    if (result.stderr) process.stderr.write(result.stderr);
    fail(`Could not read AWS Secrets Manager secret ${secretId} in ${region}.`);
  }

  const secret = JSON.parse(result.stdout);
  if (typeof secret !== "string" || !secret) {
    fail(`AWS secret ${secretId} is empty or not a string.`);
  }
  return secret;
}

function signSharedSessionToken(secret, claims) {
  const body = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signature = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

function requestNoRedirect(url, options = {}) {
  const target = new URL(url);
  const client = target.protocol === "http:" ? http : https;

  return new Promise((resolve, reject) => {
    const request = client.request(target, {
      method: "GET",
      headers: options.headers || {}
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        resolve({
          statusCode: response.statusCode || 0,
          headers: response.headers,
          body: Buffer.concat(chunks).toString("utf8")
        });
      });
    });
    request.on("error", reject);
    request.end();
  });
}

function assertNotCloudflareBlock(response, url) {
  const server = String(response.headers.server || "").toLowerCase();
  const contentType = String(response.headers["content-type"] || "").toLowerCase();
  if (response.statusCode === 403 && server.includes("cloudflare") && contentType.includes("text/html") && response.body.length > 4000) {
    fail(`${url} returned Cloudflare's large 403 block page before the Worker ran. Retry from a healthy IP or after the WAF score cools down.`);
  }
}

function getCookie(setCookieHeaders, name) {
  const headers = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders].filter(Boolean);
  for (const header of headers) {
    const firstPart = String(header).split(";")[0];
    const index = firstPart.indexOf("=");
    if (index === -1) continue;
    if (firstPart.slice(0, index) === name) {
      return firstPart;
    }
  }
  return "";
}

function parseArgs(items) {
  const parsed = { _: [] };
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (!item.startsWith("--")) {
      parsed._.push(item);
      continue;
    }
    const key = item.slice(2);
    const next = items[index + 1];
    if (next === undefined || next.startsWith("--")) {
      parsed[key] = true;
    } else {
      parsed[key] = next;
      index += 1;
    }
  }
  return parsed;
}

function normalizeBaseUrl(value) {
  return String(value || "").replace(/\/+$/g, "");
}

function excerpt(body) {
  return String(body || "").replace(/\s+/g, " ").trim().slice(0, 300);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
