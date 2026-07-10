---
name: pear-engineering-workflow
description: Pear engineering workflow for editing, reviewing, debugging, implementing, syncing deploy branches, or deploying in api.pearcommerce.com, admin.pearcommerce.com, offers.pearcommerce.com, and related Pear repos. Covers PR cleanup rules, DevRev ticket links, worktrees, db.sh real-data checks, production JSP probes for live JVM/service/controller checks, dev-DB startup, PearEntity serialization, deploy commands, and browser E2E verification.
---

# Pear Engineering Workflow

Keep Pear code work grounded in repo patterns, real data, and the actual browser flow.

## Skill Source

Canonical repo: `https://github.com/Pear-Commerce/pear-ai-skills`. For skill edits, update and push `skills/pear-engineering-workflow/SKILL.md` there first, then sync installed/vendored copies. For app repos other than `api.pearcommerce.com`, commit synced copies directly after verification; for `api.pearcommerce.com`, use a `codex/` branch and PR.

## Shell Environment

Pear repos rely on Alex's interactive shell setup for common tools such as `gh`, `node`, `npm`, `npx`, `zx`, `nvm`, SSH agent state, and repo helpers like `devops/env.sh`. For Pear work, keep commands in the default Codex login shell or run them through `zsh -lc '...'` when the command may need those tools.

Avoid switching to non-login Bash, especially `shell=/bin/bash` with `login=false`, for deploys, GitHub CLI work, Node-backed scripts, `devops/*` helpers, dry runs that call repo scripts, or checks that shell out to Pear tooling. If Bash is genuinely needed, first seed `PATH` from a known-good login `zsh` or explicitly include the active `nvm` Node bin directory, then verify with `command -v gh npx node npm` before running the real command. If a Pear command fails with `gh`, `node`, `npm`, `npx`, or `zx` missing, treat it as a shell-environment issue before debugging repo behavior.

For CloudWatch, RDS, or other AWS-backed investigations, also check the login shell before deciding tools are missing: `zsh -lc 'command -v aws python3 pip3'`. Prefer Pear repo helpers such as `devops/logs.sh`, `db.sh`, and `pear-prod-jsp` when they answer the question. If direct AWS API access is genuinely needed and `aws`/`boto3` is unavailable, keep any temporary Python dependency install in a temp venv/path outside the repo, avoid changing repo dependency files, and describe that as a local tooling workaround rather than a production or application finding.

## Offers Deploy Safety

For `offers.pearcommerce.com`, never repair or deploy CDN/static asset content by pushing local workstation files to S3/R2/CloudFront/Cloudflare or any production bucket. Do not use `aws s3 cp`, `aws s3 sync`, `s3api put-object`, R2 object writes, Cloudflare direct uploads, or equivalent local artifact pushes for Offers production or staging assets, including emergency fixes.

Never deploy production from a local or dev build. Production Offers artifacts must be built and uploaded by the GitHub Actions/CI deploy pipeline from the merged source branch, using production configuration. If a live asset is stale or wrong, fix the source, deploy script, cache headers, or invalidation path in code; merge through PR/CI; trigger or rerun the CI deploy; then verify the public URLs and browser flow.

CDN cache purges/invalidations may be run when needed to make already-deployed CI artifacts visible, but they must not be paired with local object-content writes. If a situation appears to require manual production object mutation, stop and escalate instead of improvising from local files.

## Pear API Curl Header

When curling Pear API hosts from a local shell, include the trusted-edge header before treating a Cloudflare 403/block page as endpoint behavior. This applies to `https://api.pearcommerce.com` and `https://test.api.pearcommerce.com` requests, including validation probes, cache invalidation calls, retailer-list reads, JSP raw-output curls, and other direct API checks. The header shape comes from the Admin/Offers Cloudflare invalidation scripts:

```bash
PEAR_TRUSTED_EDGE_VALUE="${PEAR_TRUSTED_EDGE_HEADER:-${PEAR_TRUSTED_EDGE:-a1360351-32b2-4410-9c87-ec294e780c25}}"
curl -fsS -H "x-pear-trusted-edge: ${PEAR_TRUSTED_EDGE_VALUE}" "https://api.pearcommerce.com/v1/..."
```

Use this only for Pear API hosts. Do not add it to third-party retailer APIs, `partners.pearcommerce.com`, raw Offers page loads, Cloudflare's own API, or unrelated domains. If the trusted-edge header still returns a Cloudflare block, switch to browser verification or a narrow JSP/server-side read path instead of escalating local curl variants.

## DevRev Ticket Links

Every Pear PR should carry a DevRev work link before it is opened for review or handed back as ready. Treat this as a SOC2 auditability requirement: code changes need a durable work record that ties intent, approval context, implementation, and verification back to the merged PR. Before creating, updating, or backfilling a PR in Pear repos, check the title and body for an existing DevRev ID or link, such as `ISS-7045`, `TKT-717`, or `https://app.devrev.ai/pearcommerce/works/ISS-7045`.

If no DevRev work exists for the change, create one before the PR is ready for review whenever DevRev tooling or credentials are available. The ticket should be specific enough to stand on its own: use the PR or task title, summarize the user-visible change or operational reason, include the repo name, PR URL if one exists, and enough implementation/testing context for a reviewer to understand why the code changed. If DevRev access is unavailable, do not silently skip the link; mark the PR as blocked on ticket creation or report the missing credential/tooling in the final response.

This requirement applies to process-only, documentation-only, skill-only, and compliance-only changes too; do not skip DevRev linkage just because the change has no application runtime behavior.

Use this PR body format unless the repo template already has a better location:

```markdown
## DevRev Ticket
https://app.devrev.ai/pearcommerce/works/ISS-####
```

For newly created Codex PRs, include the DevRev link in the initial body. For existing PRs, edit the PR body rather than leaving the ticket only in a comment. For closed and merged PR backfills, only process PRs whose `mergedAt`/`merged_at` is set; skip closed-unmerged PRs. Create or reuse one DevRev work item per PR unless the user explicitly asks to group related PRs, then edit the historical PR body with a `## DevRev Ticket` section so future searches find the link.

Once a DevRev work ID is known for new work, prefix the commit subject with that ID and a colon. Use the same primary ID that appears in the PR body:

```bash
git commit -m "ISS-1234: Add foo to bar"
```

If a branch genuinely spans multiple DevRev works, use the primary issue or ticket that best describes the PR. Do not rewrite old merged commits solely to retrofit this convention during historical PR-body backfills.

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

When reviewing your own code, compare the final diff against the user's stated goal and remove superfluous changes before calling the work done. Treat unrelated cleanup, speculative abstractions, incidental formatting churn, extra workflow tweaks, and diagnostic/profiling leftovers as review blockers unless the user explicitly asked for them or they are required for the requested behavior.

Before adding utility-like code, search for the existing home and use or extend it. Environment names belong in `ServerEnv`; AppConfig parsing/default shaping belongs in `AWSAppConfigUtil`; queue/concurrency helpers should follow `pear-concurrency`/`pear-jobs`; SimpleORM data access should follow `pear-orm`. Do not duplicate normalization, parsing, retry, locking, or config code in a feature module when a shared utility exists.

New feature/domain helpers must default to Spring services with explicit constructor injection. Put `@Autowired` on non-empty constructors in new/changed Spring classes, including services and controllers, so dependency wiring is obvious in review. Avoid field injection, manual `new`, static registries/helpers for behavior, and feature-owned state hidden behind global calls unless the code is a pure reusable value utility with no collaborators and no expected test injection. Before finalizing, scan touched packages for `@Autowired`, `Resources.global`, `ManagedResourcesConfig.getBean`, `static`, and `new <feature class>` and move collaborators into small injected `@Service` modules where practical.

For retailer integrations, this is a hard default: client/helper classes that fetch live pages or APIs, parse retailer payloads, resolve UPCs, load store artifacts, compute PDP URLs, or check availability should be `@Service` beans injected into resolvers/updaters/tests. Static constants and DTOs are fine; static behavior helpers in production retailer code are not.

## Pear Entity Serialization

Production API paths may serialize `PearEntity` objects through SimpleORM, which emits only `id` and `@SimpleORMField` fields. Plain public fields, `transient`, and `@JsonProperty` can pass local `ObjectMapper` tests yet disappear from real responses.

Strict rule: never put any value the client must receive on a `PearEntity` as a `transient` field. Treat `transient` as not JSON-serialized in real PearEntity API responses, even if a local Jackson/ObjectMapper test appears to include it or a `@JsonProperty` annotation is present. For hydrated/computed/UI-only/response-only data, use an explicit response DTO or response-shaping mapper. Add `@SimpleORMField` only for intentional DB schema/storage. Tests should exercise the endpoint response, DTO, or production serializer; avoid `new ObjectMapper()` entity tests unless that is the real call path.

## Serialized JSON DTOs

For external API response/request DTOs, scraper payload models, JSON-LD/schema.org models, app/webhook payloads, and other classes whose fields are populated by Jackson or Pear `JSON`, prefer representing as many upstream JSON fields as practical. These fields document the payload shape for future readers, make debugger inspection easier, and reduce rediscovery when another scraper/resolver path later needs the same data.

For simple Jackson/Gson/Pear `JSON` payload shapes, prefer `public static` nested DTO classes with public fields when that is the local convention. This is the default for external API request/response DTOs, scraper payloads, JSON-LD models, and webhook/app payloads that are just data carriers.

If Error Prone reports `EffectivelyPrivate` on public fields inside a private nested JSON DTO, fix the class visibility first: make the DTO `public static` when the public-field payload shape is intentional. Do not "fix" that warning by making serialized/deserialized DTO fields private or package-private, and do not add `@JsonProperty` solely to preserve names after narrowing field visibility. Keeping the DTO class public and the fields public is the intended Pear convention for these simple payload models.

Do not make DTO classes or fields private/package-private solely to satisfy `EffectivelyPrivate` or similar unused-field warnings when framework serialization/deserialization depends on visibility or the public-field shape is intentional.

Do not remove serialized JSON DTO fields solely because the current production code does not read them. A Copilot or reviewer comment like "field X is deserialized but never read" is usually not sufficient reason to delete it. Stand firm graciously: explain that unused-but-real DTO fields intentionally preserve the upstream contract, especially in retailer integrations and API clients.

This guidance is different from dead behavior. Remove stale helpers, duplicate DTO classes, fields that are proven not to exist upstream, sensitive fields we should not retain, fields that actively mislead readers, or fields whose parsing has meaningful performance/memory cost in a hot path. When in doubt, keep the field and add a short comment only if the retention would otherwise look surprising.

## Spring Tests

In `api.pearcommerce.com`, any JUnit test that needs Spring-managed beans, method-parameter `@Autowired`, `awsAppConfigUtil`, `Persistence`, `Resources`, or the Pear app test context should usually extend `BasePearScript` because it loads the Spring/Pear test context. If a test sees null `Persistence.global()`, missing `Resources`, or uninitialized autowired collaborators, first check whether it should be based on `BasePearScript`. Keep pure unit tests plain, but do not add ad hoc Spring annotations or manual context setup when `BasePearScript` is the repo pattern. Make Spring-backed tests deterministic by creating required SimpleORM rows in the test instead of assuming CI seed data contains them.

In `api.pearcommerce.com`, default Gradle tests that load Spring, SimpleORM, `Resources`, AppConfig, Snowflake, UPC resolution scripts, vendors, or real entity data to the shared dev DB, not local MySQL. Prefix those `./gradlew test`, `testCI`, or similar commands with:

```bash
MYSQL_CREDENTIALS_SECRET=prod-db-10-2025 \
MYSQL_HOST=analytics-database.pearcommerce.com \
MYSQL_HOST_READ=analytics-database.pearcommerce.com \
MYSQL_HOST_WRITE=analytics-database.pearcommerce.com \
SNOWFLAKE_CREDENTIALS_SECRET=snowflake-2025-12-01 \
./gradlew test --tests ...
```

Pure compile checks and pure unit tests that do not touch Pear resources can run without the DB prefix. If a local test or app page is missing vendors, users, UPC imports, resolver rows, or auth-related data, suspect an accidental local-DB run before debugging feature code.

## Browser Profiles For HTTP Work

For scraper, resolver, availability, store-locator, or API-client work using `LoggedJurl`/`JurlProxyFallback`, remember that browser-like headers are not always enough. If `.asChrome()` and copied Chrome headers still produce 403/429s, bot shells, empty app responses, or behavior that differs from local Chrome, try `LoggedJurl.withBrowserProfile(...)` to reproduce Chrome's TLS/HTTP2 fingerprint.

Prefer `ChromeShim.getMostRecentChromeRelease().getBrowserProfile()` on production-like boxes, especially with proxy types that explicitly require a browser profile. If local script/dev data has no `BrowserProfileConfiguration`, do not prematurely mark the route impossible: for feasibility probes, use a documented long-lived captured/check-in Chrome TLS profile as a fallback and note that production should use the latest DB-backed profile when present.

Keep request shape coherent. API/XHR routes should use browser profile plus explicit CORS/API headers when `.asChrome()` v1 adds document-navigation headers that conflict with the copied request. Avoid sending duplicate `accept`, `referer`, or `sec-fetch-*` values through proxy providers; split browser-profile and provider-header experiments if needed.

## Concurrent Repo Work

Before editing a repo, explicitly choose the worktree. Do this before the first `apply_patch`, IDE edit, formatter, generated-code command, or test command that might write files.

Run:

```bash
pwd
git status --short --branch
git worktree list --porcelain
```

Use a sibling worktree on a `codex/` branch for the task unless the current checkout is already a task-owned worktree for this exact thread. A task-owned worktree means its path and branch clearly match the current task/retailer/PR and it was created for this Codex task. The primary checkout, such as `$HOME/api.pearcommerce.com`, `$HOME/admin.pearcommerce.com`, or `$HOME/offers.pearcommerce.com`, is a shared/user checkout by default even when it is clean, even when it is already on a `codex/` branch, and even when the same PR branch is being updated. Do not treat a clean primary checkout as "dedicated" unless the user explicitly tells you to edit that checkout.

If `git status --short --branch` shows staged, unstaged, untracked, generated, or unknown files, do not edit there. Treat every existing change as someone else's active work and create/use a sibling worktree, even for docs or tiny changes. Do not stash, reset, rebase, clean, or otherwise rearrange the user's checkout to make room.

```bash
git fetch origin master --prune
git worktree add -b codex/<short-task-name> ../<repo-name>-<short-task-name> origin/master
```

Edit, test, commit, push, and open the PR from that worktree. Use unique task names; remove only worktrees you no longer need.

For an existing PR update, first resolve the PR head branch and use a worktree for that branch instead of editing the primary checkout:

```bash
BRANCH="$(gh pr view PR_NUMBER --json headRefName --jq .headRefName)"
git fetch origin "$BRANCH" --prune
git worktree add --detach ../<repo-name>-<short-task-name> "origin/$BRANCH"
```

Make the PR update in that detached worktree, then push back to the PR branch with:

```bash
git push origin HEAD:"$BRANCH"
```

If the branch is not checked out anywhere else and a normal branch worktree is more convenient, `git worktree add ../<repo-name>-<short-task-name> "$BRANCH"` is also fine. If the PR branch is user-authored, shared, or unsafe to update from a detached worktree, stop and report the risk instead of editing the primary checkout.

When updating an existing PR branch with latest `master`, `main`, or another PR base, rebase the branch onto the base tip and force-push with lease after verification. Do not use `git merge origin/master`, `git merge origin/main`, or any update-branch flow that creates a merge commit. If the branch is shared or unsafe to rewrite, stop and ask/report instead of making a merge commit. For stacked PRs, rebase and push the parent first, then rebase each child onto the updated parent.

## Real Data

When data would clarify behavior, edge cases, IDs, ownership, or UI state, query `db.sh` instead of guessing. Prefer the safest relevant env, usually `db.sh -e test`; use production only when requested or clearly required. Default to read-only queries and summarize facts instead of dumping broad output.

For live server logs, use `devops/logs.sh -e <env>`. For UPC resolution, `devops/logs.sh -e upc-resolution --single` streams one server instead of threading all UPC-resolution instances together.

## Live Java Instance Probes

Use `pear-prod-jsp` when the answer requires code running inside a live Pear Java server rather than a local JVM or SQL query. Good fits include live `Resources`/`Persistence`, Spring beans, AppConfig/secrets/IAM, process-local caches, in-memory registries, browser profiles, proxy behavior, service methods, job helpers, or controller-adjacent code that only makes sense with the production classpath and runtime state.

Prefer `db.sh` for pure data questions, local tests for pure code questions, and real HTTP/browser requests for endpoint routing, filters, auth, serialization, and user-visible behavior. Reach for a JSP when you need to call or inspect live Java methods directly. If a controller is involved, be explicit about what is being validated: use the real endpoint for request/response behavior; use a JSP to get Spring beans or call service/controller methods only when the live app context itself is the important part.

When this applies, load and follow `pear-prod-jsp`: no-parameter preview with a `Run` button, no side effects on the preview path, deploy the preview without `--single`, show the full human run report on `run=true`, use `output=raw` only for formal artifacts, avoid secrets/customer dumps in source or output, and capture the run URL plus S3 source key. Treat controller/service/job calls that may write database rows, S3/R2, cache, queues, or downstream systems as writes/triggers and require the approval path from `pear-prod-jsp` before running them.

## Deploy And Sync Commands

When the user says "sync to deploy", run Pear's deploy-branch sync script from a clean, up-to-date checkout of the target repo:

```bash
/Users/alexwyler/pear-scripts/sync-deploy-branch.sh
```

For `api.pearcommerce.com`, this syncs `master` into the API release-candidate deploy branch alias, such as `deploy-YYYY-MM-DD-HH-MM`. For `admin.pearcommerce.com`, this syncs `master` into the `deploy` branch; that deploy-branch push is the admin production deploy trigger.

When the user says "deploy" for API code, use the API repo's GitHub Actions deploy trigger, not a local build artifact. Run it from a clean, up-to-date `api.pearcommerce.com` checkout. In Codex shells, prefer `zsh -lc` so `nvm` exposes `node`, `npm`, and `npx` for `devops/env.sh`:

```bash
zsh -lc './devops/trigger-deploy.sh -c master -e pear-commerce-dashboard'
zsh -lc './devops/trigger-deploy.sh -c master -e pear-commerce-upc-resolution'
zsh -lc './devops/trigger-deploy.sh -c master -e jobs-2026'
```

For a combined API deploy to dashboard, UPC resolution, and jobs:

```bash
zsh -lc './devops/trigger-deploy.sh -c master -e pear-commerce-dashboard,pear-commerce-upc-resolution,jobs-2026'
```

Short user phrases map naturally: "deploy to upc-resolution" means `-e pear-commerce-upc-resolution`; "deploy to dashboard" means `-e pear-commerce-dashboard`; "deploy to jobs" means `-e jobs-2026`. API environment deploys go through Elastic Beanstalk and often take a long time; after triggering one, do not babysit it to completion by default. Instead, use `gh run list --workflow deployment.yml` once to capture and report the run URL, target environment, commit SHA, and queued/in-progress/completed status. Only run `gh run watch`, poll until completion, or investigate deploy logs when the user explicitly asks you to wait, when the deploy fails immediately, or when the task requires synchronous deploy verification. Do not deploy Offers production from local artifacts; keep following the Offers deploy safety rules above.

## End-To-End Checks

Consider browser E2E for user-facing admin/offers/API-backed flows, especially UI state, auth, extension behavior, API wiring, server/client errors, or displayed data.

For Chrome/unpacked extension work, treat `manifest.json` versioning as part of the change. Bump the manifest `version` whenever extension behavior changes, verify Chrome is loading the path you edited (for example the profile's extension details or Secure Preferences path), reload the extension in that profile, and confirm `chrome://extensions` shows the new version. If the version does not change after reload, you probably edited a different checkout than the one Chrome has loaded; sync or patch the loaded path explicitly before retesting.

For local dashboard work, inspect IntelliJ run configs before starting services. In `api.pearcommerce.com`, mirror `SpringBootTomcat` and always use the shared dev DB unless the user explicitly asks for a disposable local DB. Set `PEAR_LOCAL_USER_ID` for local API starts so local auth can fall back to a known user when the browser has no valid `auth-token-v2` cookie. Ask which local user id to impersonate before choosing a value; for Alex's local Codex sessions on his workstation, default to `PEAR_LOCAL_USER_ID=2`. If using the repo helper, prefix it:

```bash
PEAR_LOCAL_USER_ID=<chosen-user-id> ./devops/boot-run-from-intellij-config.py SpringBootTomcat
```

Never start `:bootRun` with bare `./gradlew :bootRun`; use the env prefix and verify startup logs include `MYSQL_HOST=analytics-database.pearcommerce.com` and process env includes the chosen `PEAR_LOCAL_USER_ID`. Gradle example:

```bash
ENV=LOCAL \
LOCAL_IP_ZIPCODE_OVERRIDE=55408 \
PEAR_LOCAL_USER_ID=<chosen-user-id> \
MYSQL_CREDENTIALS_SECRET=prod-db-10-2025 \
MYSQL_HOST=analytics-database.pearcommerce.com \
MYSQL_HOST_READ=analytics-database.pearcommerce.com \
MYSQL_HOST_WRITE=analytics-database.pearcommerce.com \
SECRETS_MANAGER_AUTH0_CLIENT_SECRET=AUTH0_CLIENT_SECRET \
SECRETS_MANAGER_AUTH0_MANAGEMENT_SECRET=AUTH0_MANAGEMENT_SECRET \
SNOWFLAKE_CREDENTIALS_SECRET=snowflake-2025-12-01 \
./gradlew :bootRun
```

Do not let `:bootRun` fall into empty/local MySQL by accident. If login, vendor pages, UPC imports, or other seeded data look empty/missing, first check whether the API was started without the dev-DB prefix. For `admin.pearcommerce.com`, use the existing npm/gulp/browser-sync workflow, and when starting or debugging local admin, verify the paired local API on `8080` was started with the intended `PEAR_LOCAL_USER_ID` as well as the shared dev-DB env. The admin process does not consume `PEAR_LOCAL_USER_ID` directly; local admin login depends on the API auth fallback. If delegating startup/browser work, pass these expectations to the subagent.

Before browser checks, reuse already-running API/admin processes when available; otherwise start from repo patterns, track sessions, and stop only processes you started. When feasible, verify:

- load the local admin page with the user’s authenticated Chrome profile when extension/auth state matters
- exercise the primary action, not just page load
- inspect visible UI state and browser console errors
- inspect server logs for exceptions or malformed requests
- repeat after small fixes until the specific flow is clean, or clearly state what was not re-tested

If the user cancels or defers E2E, continue with focused static/unit checks.
