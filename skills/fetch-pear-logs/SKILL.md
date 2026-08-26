---
name: fetch-pear-logs
description: Query Pear production logs (logs.intern.pearcommerce.com, VictoriaLogs) from a terminal. Covers acquiring a Google OAuth session via the CLI localhost-callback flow, running LogsQL queries, and the Pear log glossary (Jurl, list-scraper, etc). Use when an agent needs to search or investigate Pear application logs — debugging errors, finding failing requests, counting events, or answering "why is X failing" questions against production log data.
---

# Fetch Pear Logs

Query Pear's internal production logs at `https://logs.intern.pearcommerce.com` (VictoriaLogs + Grafana) from the terminal. Acquire a session once via browser OAuth, then run LogsQL queries with a saved cookie. Hot retention is 7 days; older partitions live in S3 Glacier Deep Archive and need a 9-12h restore.

## AWS SSO Prerequisite

Before running any AWS CLI command in this skill, proactively run:

```bash
aws sso login --profile pear-sso
```

This opens the user's Chrome browser for authentication and blocks until approved. Never attempt AWS commands with stale credentials — if you see `UnrecognizedClientException` or `Token has expired`, run the login command first and retry. See `$pear-aws` for full credential troubleshooting.

## Prerequisites

- Node 18+ (for global `fetch`)
- `git` + `gh` (to clone the repo)
- Chrome (for the one-time login)

## Setup — clone the CLI tools

```bash
git clone https://github.com/Pear-Commerce/victorialogs-intern.git ~/victorialogs-intern
```

The CLI lives at `cli/login.js` and `cli/query.js` inside that repo. No `npm install` needed — both scripts use only Node built-ins.

## Step 1 — authenticate (once per 7 days)

```bash
cd ~/victorialogs-intern
node cli/login.js
```

What happens:
1. A local HTTP server starts on `127.0.0.1:<random-port>`.
2. Chrome opens to `https://logs.intern.pearcommerce.com/login?cli_port=<port>`.
3. You complete Google sign-in (restricted to `@pearcommerce.com` accounts). If you're already signed in to Google, it's a single account-chooser click.
4. After OAuth, the auth-gateway callback page fires a background `fetch` to `http://127.0.0.1:<port>/callback?vl_session=<cookie>`.
5. The CLI catches it and saves `~/.pear-logs/session.json` (mode 0600).

Output on success:
```
listening on http://127.0.0.1:55771
opening Pear Logs login in Chrome — complete the Google sign-in there if prompted
saved session to /Users/<you>/.pear-logs/session.json
cookie valid for 7 days from login time.
```

The session cookie (`vl_session`) is valid for 7 days. Re-run `node cli/login.js` when it expires.

If `PEAR_LOGS_URL` is set, the CLI uses that instead of the default URL — useful for testing against a non-production instance.

## Step 2 — query

```bash
cd ~/victorialogs-intern
node cli/query.js '<LogsQL query>' [range]
```

`range` is one of `15m | 1h | 6h | 24h | 7d` (default `1h`). The API caps results at 200 rows.

Examples:
```bash
# errors in the last hour
node cli/query.js 'level:=error' 1h

# logs for a specific service
node cli/query.js '{service="api"}' 15m

# count by service
node cli/query.js '* | stats by (service) count() as logs' 1h

# phrase search in messages
node cli/query.js '_msg:"connection refused"' 24h
```

Output:
```
query: level:=error
range: 1h
rows: 42
duration: 14ms
---
{"_time":"...","_msg":"...","service":"api","level":"error",...}
...
```

If you get `401`, the session expired — re-run `node cli/login.js`.

## LogsQL quick reference

- Stream filters (exact, fast): `{environment="production",service="api"}`
- Field filter (exact): `level:=error` — note the `:=` (bare `=` is invalid outside stream filters)
- Message phrase: `_msg:"connection refused"`
- All logs: `*`
- Count by field: `* | stats by (service) count() as logs`
- Percentage matching a condition: `* | stats count() as total, count() if (status:=200) as matching | math (matching / total * 100) as percentage`

Do NOT add `_time:` filters or `options(...)` — the server injects the time range and concurrency. The query is just the filter + optional pipes.

## Pear log glossary (authoritative)

- **Jurl** / **Jurls** — Pear's logged HTTP-request records. Filter with `tag:="jurl"`. Do NOT search `_msg` for the word "jurl".
- **list scraper** — `service="list-scraper"`. Prefer the stream filter `{service="list-scraper"}`.
- Raw Jurl requests return all stored fields by default. Don't add `| fields ...` unless the user asks for specific fields.
- Scalyr's `$tag` field is stored as `tag` (no dollar sign) in VictoriaLogs.

Common service names: `api`, `dashboard`, `production`, `list-scraper`, `catalog-ingester`, `recipe-importer`, `availability_aws`, `jobs`, `upc-resolution`, `CI`.

## How an agent should use this

When asked to investigate logs ("why is X failing", "find errors in Y", "how many Z happened"):

1. Check if `~/.pear-logs/session.json` exists. If not, tell the user to run `node cli/login.js` (it requires their browser — agents cannot complete Google OAuth autonomously).
2. Run `node cli/query.js '<query>' <range>` from the `victorialogs-intern` repo directory.
3. Parse the JSON rows from stdout. Each row is one log line with all stored fields.
4. If 401, the session expired — ask the user to re-run `node cli/login.js`.
5. If the query needs data older than 7 days, that requires an S3 Glacier restore (9-12h lead time) — tell the user and surface the date they need.

## Oversized response bodies

Jurl records with very large `jurl_responseBody` fields are archived to S3. The inline log row carries:
- `jurl_oversizedResponseBodyLink` — S3 URI
- `jurl_oversizedResponseBodyDownloadCommand` — ready-to-run `aws s3 cp ... | gzip -dc` command

Run that command from an AWS-authenticated shell to retrieve the full body. S3 retains these for 14 days.

## Troubleshooting

- **`no saved session at ~/.pear-logs/session.json`** — run `node cli/login.js` first.
- **`401` / "session expired"** — re-run `node cli/login.js`.
- **`timed out waiting for login`** — the CLI's 5-minute window expired before you completed sign-in. Re-run.
- **Chrome didn't open** — the CLI prints the URL; open it manually in a browser where you're signed in to your Pear Google account.
- **`fetch ... failed` in the browser console** — Private Network Access preflight issue in some Chrome versions. The CLI handles `OPTIONS` preflights; if a future Chrome breaks this, the auth-gateway callback can fall back to a top-level redirect. Report it if you see it.

## Where the pieces live

- **CLI tools**: `Pear-Commerce/victorialogs-intern` → `cli/login.js`, `cli/query.js`
- **Auth-gateway** (the `cli_port` callback mechanism): `Pear-Commerce/victorialogs-intern` → `auth-gateway/server.mjs`
- **Session file** (user state, not in any repo): `~/.pear-logs/session.json`
- **Live app**: `https://logs.intern.pearcommerce.com`
