---
name: sync-llm-usage-analytics
description: Pull daily per-user OpenAI Codex usage through authenticated browser analytics and maintain the Anthropic Enterprise browser fallback for llm-usage.intern.pearcommerce.com. Use for daily LLM cost syncs, browser-export backfills, missing OpenAI/Claude dashboard days, or requests to attribute OpenAI and Anthropic spend by teammate. Anthropic is API-first when its Enterprise read:analytics key is configured.
---

# Sync LLM Usage Analytics

Use the in-app Browser with the existing authenticated sessions. Do not substitute undocumented HTTP calls or read browser cookies/storage.

## Daily workflow

1. Set `target_date` to the previous completed UTC day unless the user specifies another date.
2. Open OpenAI Admin Analytics (`https://admin.openai.com/analytics/leaderboards?tab=users`). Set the date range to that single day. Read/export each user's estimated USD cost, credits, and tokens. Normalize to:
   ```json
   {"provider":"openai","date":"YYYY-MM-DD","totalCostUsd":0,"users":[{"name":"","email":"","costUsd":0,"credits":0,"tokens":0,"product":"codex","model":null}]}
   ```
3. Anthropic is API-first in the dashboard only when the Worker has a key with `read:analytics`. Otherwise open Pear Commerce Analytics Chat (`https://claude.ai/analytics/chat`) and ask: `For <target_date> UTC, return spend by user across ALL Anthropic Enterprise products combined, including Chat, Claude Code, Cowork, and any other product surface. Include every user with usage, even if spend is $0. Return name, email, spend USD, requests, and total tokens. Do not limit the answer to Claude Code.` Read the returned table, not just the narrative. Normalize every row to the snapshot shape with `provider:"anthropic"`, `product:"all_enterprise"`, and the visible requests/tokens.
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

- OpenAI Business browser analytics is the source of truth for OpenAI snapshots. Claude Enterprise Analytics API is preferred for Anthropic; its authenticated browser analytics is the fallback until the Primary Owner provides the scoped key.
- Fireworks and OpenRouter are API-backed directly by the dashboard and are not browser-scraped.
- Do not create, rotate, expose, or request provider keys during a routine pull.
- If authentication expires, leave the relevant page open and ask Eric to sign in; continue the other provider when possible.
