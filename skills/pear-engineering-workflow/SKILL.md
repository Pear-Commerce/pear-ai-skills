---
name: pear-engineering-workflow
description: Pear engineering workflow for editing, reviewing, debugging, or implementing in api.pearcommerce.com, admin.pearcommerce.com, offers.pearcommerce.com, and related Pear repos. Covers PR cleanup rules, worktrees, db.sh real-data checks, dev-DB startup, PearEntity serialization, and browser E2E verification.
---

# Pear Engineering Workflow

Keep Pear code work grounded in repo patterns, real data, and the actual browser flow.

## Skill Source

Canonical repo: `https://github.com/Pear-Commerce/pear-ai-skills`. For skill edits, update and push `skills/pear-engineering-workflow/SKILL.md` there first, then sync installed/vendored copies. For app repos other than `api.pearcommerce.com`, commit synced copies directly after verification; for `api.pearcommerce.com`, use a `codex/` branch and PR.

## Review Rules

Before calling code changes done, read the PR-improvement guide. Prefer:

```bash
sed -n '1,240p' /Users/alexwyler/pear-ai-skills/skills/pear-engineering-workflow/references/codex-pr-improvement-goal.md
```

Fallbacks:

```bash
sed -n '1,240p' skills/pear-engineering-workflow/references/codex-pr-improvement-goal.md
curl -fsSL https://raw.githubusercontent.com/Pear-Commerce/pear-ai-skills/main/skills/pear-engineering-workflow/references/codex-pr-improvement-goal.md | sed -n '1,240p'
sed -n '1,240p' /Users/alexwyler/.codex/skills/pear-engineering-workflow/references/codex-pr-improvement-goal.md
```

Apply it as a checklist: clear ownership, existing helpers first, explicit async/failure behavior, useful observability, focused deterministic tests, reviewable diff. Keep most new behavior in purpose-owned modules; existing-code touchpoints should stay minimal, e.g. shared utility updates, registry hooks, dependency wiring, or thin call-site handoffs.

## Pear Entity Serialization

Production API paths may serialize `PearEntity` objects through SimpleORM, which emits only `id` and `@SimpleORMField` fields. Plain public fields, `transient`, and `@JsonProperty` can pass local `ObjectMapper` tests yet disappear from real responses.

For hydrated/computed/UI-only/response-only data, prefer explicit response DTOs. Add `@SimpleORMField` only for intentional DB schema/storage. Tests should exercise the endpoint response, DTO, or production serializer; avoid `new ObjectMapper()` entity tests unless that is the real call path.

## Spring Tests

In `api.pearcommerce.com`, any JUnit test that needs Spring-managed beans, method-parameter `@Autowired`, `awsAppConfigUtil`, `Persistence`, `Resources`, or the Pear app test context should extend `BasePearScript`. Keep pure unit tests plain, but do not add ad hoc Spring annotations or manual context setup when `BasePearScript` is the repo pattern. Make Spring-backed tests deterministic by creating required SimpleORM rows in the test instead of assuming CI seed data contains them.

## Concurrent Repo Work

Before editing a repo, run `git status --short`. If it prints anything at all, use a sibling worktree on a `codex/` branch for the task, even for small changes. Treat staged, unstaged, untracked, generated, and unknown files as someone else's active work. Also use a worktree whenever the user or another Codex thread may be using the checkout, even if status is currently clean.

```bash
git fetch origin master --prune
git worktree add -b codex/<short-task-name> ../<repo-name>-<short-task-name> origin/master
```

Edit, test, commit, push, and open the PR from that worktree. Do not stash, reset, rebase, or clean the user's main checkout to make room. Only edit the current checkout directly when it is clean and clearly dedicated to this task. Use unique task names; remove only worktrees you no longer need.

When updating an existing PR branch with latest `master`, `main`, or another PR base, rebase the branch onto the base tip and force-push with lease after verification. Do not use `git merge origin/master`, `git merge origin/main`, or any update-branch flow that creates a merge commit. If the branch is shared or unsafe to rewrite, stop and ask/report instead of making a merge commit. For stacked PRs, rebase and push the parent first, then rebase each child onto the updated parent.

## Real Data

When data would clarify behavior, edge cases, IDs, ownership, or UI state, query `db.sh` instead of guessing. Prefer the safest relevant env, usually `db.sh -e test`; use production only when requested or clearly required. Default to read-only queries and summarize facts instead of dumping broad output.

## End-To-End Checks

Consider browser E2E for user-facing admin/offers/API-backed flows, especially UI state, auth, extension behavior, API wiring, server/client errors, or displayed data.

For local dashboard work, inspect IntelliJ run configs before starting services. In `api.pearcommerce.com`, mirror `SpringBootTomcat` and always use the shared dev DB unless the user explicitly asks for a disposable local DB. Gradle example:

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

Do not let `:bootRun` fall into empty/local MySQL by accident. For `admin.pearcommerce.com`, use the existing npm/gulp/browser-sync workflow. If delegating startup/browser work, pass these expectations to the subagent.

Before browser checks, reuse already-running API/admin processes when available; otherwise start from repo patterns, track sessions, and stop only processes you started. When feasible, verify:

- load the local admin page with the user’s authenticated Chrome profile when extension/auth state matters
- exercise the primary action, not just page load
- inspect visible UI state and browser console errors
- inspect server logs for exceptions or malformed requests
- repeat after small fixes until the specific flow is clean, or clearly state what was not re-tested

If the user cancels or defers E2E, continue with focused static/unit checks.
