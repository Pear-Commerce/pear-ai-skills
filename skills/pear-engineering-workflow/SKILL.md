---
name: pear-engineering-workflow
description: Pear engineering workflow guidance for Codex when editing Pear codebases, reviewing Pear branches, debugging Pear local behavior, or implementing features in api.pearcommerce.com, admin.pearcommerce.com, offers.pearcommerce.com, or related Pear repos. Use when code changes may benefit from PR-review rules, real database context via db.sh, or browser-based end-to-end verification with local API/admin clients.
---

# Pear Engineering Workflow

## Canonical Skill Source

The canonical Pear skills repository is `https://github.com/Pear-Commerce/pear-ai-skills`.

When asked to update this skill from any in-repository or locally installed copy, first read the canonical copy at `skills/pear-engineering-workflow/SKILL.md`, make the canonical repo change, and push it. Then update any vendored or installed copy that should stay in sync. For app repos other than `api.pearcommerce.com`, commit and push directly after verification. For `api.pearcommerce.com`, use a `codex/` branch and open a pull request instead of pushing directly to `master`.

Use this skill to keep Pear code work grounded in the repo, real data, and the actual browser flow.

## Review Rules

When editing code, read the canonical PR-improvement guide before calling the implementation done. Prefer the canonical repo copy:

```bash
sed -n '1,240p' /Users/alexwyler/pear-ai-skills/docs/codex-pr-improvement-goal.md
```

If the canonical repo is not checked out locally, use the public GitHub raw URL:

```bash
curl -fsSL https://raw.githubusercontent.com/Pear-Commerce/pear-ai-skills/main/docs/codex-pr-improvement-goal.md | sed -n '1,240p'
```

If neither canonical source is available, fall back to the active repo copy:

```bash
sed -n '1,240p' docs/codex-pr-improvement-goal.md
```

If the active repo does not have the guide, check the sibling API checkout:

```bash
sed -n '1,240p' ../api.pearcommerce.com/docs/codex-pr-improvement-goal.md
```

Apply the guide as a checklist: keep ownership boundaries clear, prefer existing helpers, make async and failure behavior explicit, keep observability useful, add focused deterministic tests, and keep the diff reviewable. To make review easy, keep all but the essentials in their own purpose-owned modules; existing-code touchpoints should be minimal and limited to things like shared utility updates, small registry hooks, dependency wiring, and thin call-site handoffs.

## Pear Entity Serialization

Be careful with response-only fields on `PearEntity` classes. Production API paths may serialize ORM entities through Pear's SimpleORM serializer, which only includes `id` and fields marked with `@SimpleORMField`; plain public fields, `transient` fields, and `@JsonProperty` annotations that pass a local `ObjectMapper` test may still be omitted from real API responses.

When adding hydrated, computed, UI-only, or response-only data, prefer an explicit response DTO that copies the persisted entity fields plus the extra fields needed by the client. Only add `@SimpleORMField` when the value truly belongs in the database schema and the migration/storage impact is intentional.

Tests for these paths should exercise the actual endpoint response shape, response DTO, or production serializer used by the controller. Avoid tests that serialize the entity with `new ObjectMapper()` unless the real call path also uses that serializer directly.

## Concurrent Repo Work

When the user or another Codex thread may already be working in the repo checkout, avoid sharing that working directory. Prefer a sibling git worktree on a new `codex/` branch:

```bash
git fetch origin master --prune
git worktree add -b codex/<short-task-name> ../<repo-name>-<short-task-name> origin/master
```

Do all edits, checks, commits, pushes, and PR creation from that worktree. Do not stash, reset, rebase, or clean the user's main checkout just to make room for Codex work. Use unique task names so multiple Codex threads can work independently, and remove the worktree only when it is no longer needed.

## Real Data

When real data would clarify behavior, edge cases, IDs, ownership, or UI state, check `db.sh` instead of guessing. Use the safest relevant environment for the question, usually `db.sh -e test`; only use production when the user specifically asks or the task clearly requires production context.

Use read-only queries unless the user explicitly asks for a mutation. Summarize the useful facts in the response rather than dumping broad query output.

## End-To-End Checks

Always consider a browser end-to-end pass for user-facing admin, offers, or API-backed flows. Do it when the change affects UI state, auth, extension behavior, API wiring, server/client errors, or data shown to users.

For local Pear dashboard work, inspect the repo’s IntelliJ run configurations before starting services. In `api.pearcommerce.com`, the API run configuration has historically been `SpringBootTomcat`; use it to mirror local JVM/env setup and always start the API against the shared dev database unless the user explicitly asks for a disposable local database. For Gradle startup, this means `ENV=LOCAL` plus the `SpringBootTomcat` dev database environment, for example:

```bash
ENV=LOCAL \
LOCAL_IP_ZIPCODE_OVERRIDE=55408 \
MYSQL_CREDENTIALS_SECRET=prod-db-10-2025 \
MYSQL_HOST=analytics-database.pearcommerce.com \
MYSQL_HOST_READ=analytics-database.pearcommerce.com \
MYSQL_HOST_WRITE=analytics-database.pearcommerce.com \
SECRETS_MANAGER_AUTH0_CLIENT_SECRET=AUTH0_CLIENT_SECRET \
SECRETS_MANAGER_AUTH0_MANAGEMENT_SECRET=AUTH0_MANAGEMENT_SECRET \
SNOWFLAKE_CREDENTIALS_SECRET=snowflake-2025-12-01 \
./gradlew :bootRun
```

Do not start the API against an empty/local MySQL just because `:bootRun` defaults to `ENV=LOCAL`; dashboard feature work should normally exercise real dev data. In `admin.pearcommerce.com`, use the repo’s existing npm/gulp/browser-sync workflow rather than inventing a new server command.

When delegating browser or startup work to a subagent, include these same local startup expectations in the subagent prompt so it does not guess at the API/admin commands.

Before browser verification, check whether the user already has the API or admin client running. If they do, reuse those processes. If not, start the local API and admin client from the repo patterns, keep terminal sessions tracked, and stop only the processes you started.

During browser verification, cover the full path when feasible:

- load the local admin page with the user’s authenticated Chrome profile when extension/auth state matters
- exercise the primary action, not just page load
- inspect visible UI state and browser console errors
- inspect server logs for exceptions or malformed requests
- repeat after small fixes until the specific flow is clean, or clearly state what was not re-tested

If the user cancels or defers E2E testing, respect that and continue with focused static/unit checks instead.
