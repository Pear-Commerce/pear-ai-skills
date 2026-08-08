---
name: sync-llm-usage-analytics
description: Pull daily per-user OpenAI Codex and Anthropic Enterprise usage through authenticated browser analytics pages and upload normalized snapshots to llm-usage.intern.pearcommerce.com. Use for daily LLM cost syncs, browser-export backfills, missing OpenAI/Claude dashboard days, or requests to attribute OpenAI and Anthropic spend by teammate.
---

# Sync LLM Usage Analytics

Use the in-app Browser with the existing authenticated sessions. Do not substitute undocumented HTTP calls or read browser cookies/storage.

## Daily workflow

1. Set `target_date` to the previous completed UTC day unless the user specifies another date.
2. Open OpenAI Admin Analytics (`https://admin.openai.com/analytics/leaderboards?tab=users`). Set the date range to that single day. Read/export each user's estimated USD cost, credits, and tokens. Normalize to:
   ```json
   {"provider":"openai","date":"YYYY-MM-DD","totalCostUsd":0,"users":[{"name":"","email":"","costUsd":0,"credits":0,"tokens":0,"product":"codex","model":null}]}
   ```
3. Open Pear Commerce Claude Enterprise Analytics (`https://claude.ai/analytics/usage`). Set the same day. Include Chat, Claude Code, and Cowork. Prefer the export when available; otherwise read the visible member table and paginate. Normalize to the same shape with `provider:"anthropic"` and the visible product/model fields.
4. Validate that every amount is numeric, the total approximately equals the sum of users, and the date is exact. Never infer missing user dollars from rank/order.
5. Write each normalized object to a temporary JSON file, upload it with `scripts/upload-snapshot.mjs`, then delete the temporary file.
6. Report provider totals, user counts, and any partial/missing export. A provider failure must not prevent uploading the other provider.

## Upload

The uploader reads the ingestion credential from macOS Keychain service `llm-usage-ingest-token`; never place it in prompts, source, logs, or committed files.

```bash
node scripts/upload-snapshot.mjs /absolute/path/openai.json
node scripts/upload-snapshot.mjs /absolute/path/anthropic.json
```

For backfills, repeat one UTC day at a time so uploads are idempotent and daily graphs remain correct.

## Boundaries

- OpenAI Business and Claude Enterprise browser analytics are the sources of truth for these snapshots.
- Fireworks and OpenRouter are API-backed directly by the dashboard and are not browser-scraped.
- Do not create, rotate, expose, or request provider keys during a routine pull.
- If authentication expires, leave the relevant page open and ask Eric to sign in; continue the other provider when possible.
