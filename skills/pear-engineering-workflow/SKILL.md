---
name: pear-engineering-workflow
description: Pear engineering workflow for editing, reviewing, debugging, or implementing in api.pearcommerce.com, admin.pearcommerce.com, offers.pearcommerce.com, and related Pear repos. Covers PR cleanup rules, worktrees, db.sh real-data checks, dev-DB startup, PearEntity serialization, and browser E2E verification.
---

# Pear Engineering Workflow

Keep Pear code work grounded in repo patterns, real data, and the actual browser flow.

## Skill Source

Canonical repo: `https://github.com/Pear-Commerce/pear-ai-skills`. For skill edits, update and push `skills/pear-engineering-workflow/SKILL.md` there first, then sync installed/vendored copies. For app repos other than `api.pearcommerce.com`, commit synced copies directly after verification; for `api.pearcommerce.com`, use a `codex/` branch and PR.

## Offers Deploy Safety

For `offers.pearcommerce.com`, never repair or deploy CDN/static asset content by pushing local workstation files to S3/R2/CloudFront/Cloudflare or any production bucket. Do not use `aws s3 cp`, `aws s3 sync`, `s3api put-object`, R2 object writes, Cloudflare direct uploads, or equivalent local artifact pushes for Offers production or staging assets, including emergency fixes.

Never deploy production from a local or dev build. Production Offers artifacts must be built and uploaded by the GitHub Actions/CI deploy pipeline from the merged source branch, using production configuration. If a live asset is stale or wrong, fix the source, deploy script, cache headers, or invalidation path in code; merge through PR/CI; trigger or rerun the CI deploy; then verify the public URLs and browser flow.

CDN cache purges/invalidations may be run when needed to make already-deployed CI artifacts visible, but they must not be paired with local object-content writes. If a situation appears to require manual production object mutation, stop and escalate instead of improvising from local files.

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

Before adding utility-like code, search for the existing home and use or extend it. Environment names belong in `ServerEnv`; AppConfig parsing/default shaping belongs in `AWSAppConfigUtil`; queue/concurrency helpers should follow `pear-concurrency`/`pear-jobs`; SimpleORM data access should follow `pear-orm`. Do not duplicate normalization, parsing, retry, locking, or config code in a feature module when a shared utility exists.

New feature/domain helpers must default to Spring services with explicit constructor injection. Put `@Autowired` on non-empty constructors in new/changed Spring classes, including services and controllers, so dependency wiring is obvious in review. Avoid field injection, manual `new`, static registries/helpers for behavior, and feature-owned state hidden behind global calls unless the code is a pure reusable value utility with no collaborators and no expected test injection. Before finalizing, scan touched packages for `@Autowired`, `Resources.global`, `ManagedResourcesConfig.getBean`, `static`, and `new <feature class>` and move collaborators into small injected `@Service` modules where practical.

## Pear Entity Serialization

Production API paths may serialize `PearEntity` objects through SimpleORM, which emits only `id` and `@SimpleORMField` fields. Plain public fields, `transient`, and `@JsonProperty` can pass local `ObjectMapper` tests yet disappear from real responses.

For hydrated/computed/UI-only/response-only data, prefer explicit response DTOs. Add `@SimpleORMField` only for intentional DB schema/storage. Tests should exercise the endpoint response, DTO, or production serializer; avoid `new ObjectMapper()` entity tests unless that is the real call path.

## Serialized JSON DTOs

For external API response/request DTOs, scraper payload models, JSON-LD/schema.org models, app/webhook payloads, and other classes whose fields are populated by Jackson or Pear `JSON`, prefer representing as many upstream JSON fields as practical. These fields document the payload shape for future readers, make debugger inspection easier, and reduce rediscovery when another scraper/resolver path later needs the same data.

Do not remove serialized JSON DTO fields solely because the current production code does not read them. A Copilot or reviewer comment like "field X is deserialized but never read" is usually not sufficient reason to delete it. Stand firm graciously: explain that unused-but-real DTO fields intentionally preserve the upstream contract, especially in retailer integrations and API clients.

This guidance is different from dead behavior. Remove stale helpers, duplicate DTO classes, fields that are proven not to exist upstream, sensitive fields we should not retain, fields that actively mislead readers, or fields whose parsing has meaningful performance/memory cost in a hot path. When in doubt, keep the field and add a short comment only if the retention would otherwise look surprising.

## Spring Tests

In `api.pearcommerce.com`, any JUnit test that needs Spring-managed beans, method-parameter `@Autowired`, `awsAppConfigUtil`, `Persistence`, `Resources`, or the Pear app test context should usually extend `BasePearScript` because it loads the Spring/Pear test context. If a test sees null `Persistence.global()`, missing `Resources`, or uninitialized autowired collaborators, first check whether it should be based on `BasePearScript`. Keep pure unit tests plain, but do not add ad hoc Spring annotations or manual context setup when `BasePearScript` is the repo pattern. Make Spring-backed tests deterministic by creating required SimpleORM rows in the test instead of assuming CI seed data contains them.

## Concurrent Repo Work

Before editing a repo, run `git status --short`. If it prints anything at all, use a sibling worktree on a `codex/` branch for the task, even for docs or tiny changes. This is mandatory: treat staged, unstaged, untracked, generated, and unknown files as someone else's active work. Also use a worktree whenever the user or another Codex thread may be using the checkout, even if status is currently clean.

```bash
git fetch origin master --prune
git worktree add -b codex/<short-task-name> ../<repo-name>-<short-task-name> origin/master
```

Edit, test, commit, push, and open the PR from that worktree. Do not stash, reset, rebase, or clean the user's main checkout to make room. Only edit the current checkout directly when it is clean and clearly dedicated to this task. Use unique task names; remove only worktrees you no longer need.

When updating an existing PR branch with latest `master`, `main`, or another PR base, rebase the branch onto the base tip and force-push with lease after verification. Do not use `git merge origin/master`, `git merge origin/main`, or any update-branch flow that creates a merge commit. If the branch is shared or unsafe to rewrite, stop and ask/report instead of making a merge commit. For stacked PRs, rebase and push the parent first, then rebase each child onto the updated parent.

## Real Data

When data would clarify behavior, edge cases, IDs, ownership, or UI state, query `db.sh` instead of guessing. Prefer the safest relevant env, usually `db.sh -e test`; use production only when requested or clearly required. Default to read-only queries and summarize facts instead of dumping broad output.

For live server logs, use `devops/logs.sh -e <env>`. For UPC resolution, `devops/logs.sh -e upc-resolution --single` streams one server instead of threading all UPC-resolution instances together.

## End-To-End Checks

Consider browser E2E for user-facing admin/offers/API-backed flows, especially UI state, auth, extension behavior, API wiring, server/client errors, or displayed data.

For Chrome/unpacked extension work, treat `manifest.json` versioning as part of the change. Bump the manifest `version` whenever extension behavior changes, verify Chrome is loading the path you edited (for example the profile's extension details or Secure Preferences path), reload the extension in that profile, and confirm `chrome://extensions` shows the new version. If the version does not change after reload, you probably edited a different checkout than the one Chrome has loaded; sync or patch the loaded path explicitly before retesting.

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
