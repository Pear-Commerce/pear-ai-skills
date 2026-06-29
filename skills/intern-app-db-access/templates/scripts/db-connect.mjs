#!/usr/bin/env node
// Pear intern app — MySQL connection bootstrap.
//
// Fetches DB credentials from AWS Secrets Manager using the same flow as the
// Pear dashboard API (src/db/mysqlCredentials.js), then exposes a shared
// mysql2/promise connection pool. The secret must be in the dashboard-API
// shape: {engine, host, port, dbname, username, password}.
//
// Required env:
//   DB_SECRET_ID   Secrets Manager secret id, e.g. intern-app-<app>-db
//
// Optional env:
//   AWS_REGION / AWS_DEFAULT_REGION   defaults to us-east-1
//   DB_SSL                            "true" (default) or "false"
//   DB_SSL_REJECT_UNAUTHORIZED        "true" (default) or "false"
//   MYSQL_HOST                        overrides secret.host
//   MYSQL_DATABASE                    overrides secret.dbname
//   MYSQL_USER                        overrides secret.username
//   MYSQL_PASSWORD                    overrides secret.password
//   MYSQL_CONNECTION_LIMIT            default 10
//   MYSQL_CONNECT_TIMEOUT_MS          default 10000
//
// Dependencies: mysql2, @aws-sdk/client-secrets-manager

import mysql from "mysql2/promise";
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";

let poolPromise = null;
let cachedCredentials = null;

/**
 * Returns the shared mysql2 connection pool, creating it on first use.
 * @returns {Promise<import("mysql2/promise").Pool>}
 */
export async function getPool() {
  if (!poolPromise) poolPromise = createPool();
  return poolPromise;
}

/**
 * Runs a query against the shared pool. Uses pool.query (not pool.execute)
 * to avoid accumulating server-side prepared statements across pooled
 * Aurora/MySQL connections, matching the dashboard API's behavior.
 * @returns {Promise<[rows, fields]>}
 */
export async function query(sql, values) {
  const pool = await getPool();
  return pool.query(sql, values);
}

/** Force a re-fetch of the secret on the next pool creation. */
export function resetDbCredentialCache() {
  cachedCredentials = null;
}

async function createPool() {
  const credentials = await getDbCredentials();
  const ssl = sslConfig();
  return mysql.createPool({
    ...credentials,
    waitForConnections: true,
    connectionLimit: integerEnv("MYSQL_CONNECTION_LIMIT", 10),
    queueLimit: 0,
    connectTimeout: integerEnv("MYSQL_CONNECT_TIMEOUT_MS", 10000),
    timezone: "Z",
    ...(ssl ? { ssl } : {}),
  });
}

async function getDbCredentials(forceRefresh = false) {
  if (cachedCredentials && !forceRefresh) return cachedCredentials;
  const region =
    process.env.AWS_REGION ||
    process.env.AWS_DEFAULT_REGION ||
    "us-east-1";
  const secretId = requiredEnv("DB_SECRET_ID");
  const client = new SecretsManagerClient({ region });
  try {
    const response = await client.send(
      new GetSecretValueCommand({ SecretId: secretId }),
    );
    const payload = parsePayload(response);
    cachedCredentials = normalize(payload);
    return cachedCredentials;
  } finally {
    client.destroy();
  }
}

function parsePayload(response) {
  if (response.SecretString) return JSON.parse(response.SecretString);
  if (response.SecretBinary) {
    const text = Buffer.from(response.SecretBinary).toString("utf8");
    return JSON.parse(text);
  }
  throw new Error(
    `Secret ${process.env.DB_SECRET_ID} has no SecretString or SecretBinary.`,
  );
}

function normalize(secret) {
  const host = firstPresent(process.env.MYSQL_HOST, secret.host, secret.hostname);
  const port = integerOr(secret.port, 3306);
  const user = firstPresent(process.env.MYSQL_USER, secret.username, secret.user);
  const password = firstPresent(
    process.env.MYSQL_PASSWORD,
    secret.password,
    secret.pass,
  );
  const database = firstPresent(
    process.env.MYSQL_DATABASE,
    secret.dbname,
    secret.database,
    secret.db,
  );
  if (!host) {
    throw new Error(
      "DB secret is missing host and MYSQL_HOST is not set.",
    );
  }
  if (!user) {
    throw new Error(
      "DB secret is missing username and MYSQL_USER is not set.",
    );
  }
  if (!password) {
    throw new Error(
      "DB secret is missing password and MYSQL_PASSWORD is not set.",
    );
  }
  const credentials = { host, port, user, password };
  if (database) credentials.database = database;
  return credentials;
}

function sslConfig() {
  const raw = process.env.DB_SSL ?? "true";
  const normalized = String(raw).toLowerCase();
  if (["0", "false", "off", "no"].includes(normalized)) return undefined;
  return {
    rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== "false",
  };
}

function firstPresent(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function integerEnv(name, fallback) {
  return integerOr(process.env[name], fallback);
}

function integerOr(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Required env var ${name} is not set.`);
  return value;
}
