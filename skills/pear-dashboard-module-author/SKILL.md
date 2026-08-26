---
name: pear-dashboard-module-author
description: Create, edit, publish, or review Pear dashboard modules using only the public S3 authoring kit. Use this when creating standalone S3 modules, writing module SQL, publishing module files, or troubleshooting module publishing.
---

# Pear Dashboard Module Author

## Canonical Skill Source

The canonical Pear skills repository is `https://github.com/Pear-Commerce/pear-ai-skills`.

When asked to update this skill from any in-repository copy, first read the canonical copy at `skills/pear-dashboard-module-author/SKILL.md`, make the canonical repo change, and push it. Then update any vendored app-repo copy that should stay in sync. For app repos other than `api.pearcommerce.com`, commit and push directly after verification. For `api.pearcommerce.com`, use a `codex/` branch and open a pull request instead of pushing directly to `master`.

You are creating standalone Pear dashboard modules from public S3 authoring files. Treat the public S3 files as the complete source of truth.

## AWS SSO Prerequisite

Before running any AWS CLI command in this skill (S3 reads/writes for module publishing), proactively run:

```bash
aws sso login --profile pear-sso
```

This opens the user's Chrome browser for authentication and blocks until approved. Never attempt AWS commands with stale credentials — if you see `UnrecognizedClientException` or `Token has expired`, run the login command first and retry. See `$pear-aws` for full credential troubleshooting.

## Public Sources

Read these public files before creating or editing a module:

- `https://pear-dashboard-modules-042357577846-us-east-1.s3.amazonaws.com/authoring/latest/README.md`
- `https://pear-dashboard-modules-042357577846-us-east-1.s3.amazonaws.com/authoring/latest/MODULE_PROMPT.md`
- `https://pear-dashboard-modules-042357577846-us-east-1.s3.amazonaws.com/authoring/latest/sdk.d.ts`
- `https://pear-dashboard-modules-042357577846-us-east-1.s3.amazonaws.com/authoring/latest/SQL_ALLOWLIST.md`
- `https://pear-dashboard-modules-042357577846-us-east-1.s3.amazonaws.com/authoring/latest/sql-allowlist.json`
- `https://pear-dashboard-modules-042357577846-us-east-1.s3.amazonaws.com/authoring/latest/UI_PATTERNS.md`
- `https://pear-dashboard-modules-042357577846-us-east-1.s3.amazonaws.com/authoring/latest/AUTHOR_USER_IDS.md`
- `https://pear-dashboard-modules-042357577846-us-east-1.s3.amazonaws.com/modules/index.json`

Also inspect real uploaded module directories as examples. Start with:

- `https://pear-dashboard-modules-042357577846-us-east-1.s3.amazonaws.com/modules/s3-queries-module-example/manifest.json`
- `https://pear-dashboard-modules-042357577846-us-east-1.s3.amazonaws.com/modules/s3-queries-module-example/v1/index.mjs`
- `https://pear-dashboard-modules-042357577846-us-east-1.s3.amazonaws.com/modules/traffic-overview/manifest.json`
- `https://pear-dashboard-modules-042357577846-us-east-1.s3.amazonaws.com/modules/traffic-overview/v1/index.mjs`

These public files are enough to author a module without the dashboard repo. `sdk.d.ts` documents the SDK types, `UI_PATTERNS.md` explains every exported UI component, and `SQL_ALLOWLIST.md` plus `sql-allowlist.json` describe the available Snowflake tables and columns.

Optional publishing scripts:

- `https://pear-dashboard-modules-042357577846-us-east-1.s3.amazonaws.com/authoring/latest/scripts/bootstrap-aws-publisher.sh`
- `https://pear-dashboard-modules-042357577846-us-east-1.s3.amazonaws.com/authoring/latest/scripts/publish-s3-module.sh`
- `https://pear-dashboard-modules-042357577846-us-east-1.s3.amazonaws.com/authoring/latest/scripts/aws-publisher.env.example`

## Module Contract

- Do not create, edit, or save generated module files inside the `pear-dashboard` application repository.
- Do not inspect, search, or read the `pear-dashboard` application repository. Module authoring does not need that repo.
- Do not inspect local `modules/` folders or search the local filesystem to discover existing modules. Public S3 is the only module discovery source.
- Treat `sdk.d.ts`, `UI_PATTERNS.md`, `SQL_ALLOWLIST.md`, and `sql-allowlist.json` as the complete SDK, UI, and data dictionary reference.
- Use a standalone workspace outside the dashboard app, for example `~/pear-dashboard-s3-modules/MODULE_ID/`.
- If the user explicitly starts you inside the `pear-dashboard-s3-modules` repo or gives that repo path, write module files under `modules/MODULE_ID/` there. Do not search for that repo yourself.
- If the current working directory is inside `pear-dashboard`, leave it immediately and create the standalone workspace outside it before writing files. Do not read dashboard files first.
- Do not put module folders at the root of `pear-dashboard-s3-modules` next to `authoring-kit/`, `scripts/`, or `skills/`.
- Output one standalone browser ESM file named `index.mjs`.
- Export `default function createModule(sdk)`.
- Use only the `sdk` argument. Do not use imports; the module should be self-contained except for SDK-provided resources.
- Destructure needed resources directly from `sdk`, usually `React`, `defineModule`, `runtime`, and `ui`.
- Use `React.createElement`. Do not use JSX unless the user explicitly has a build pipeline that compiles it to standalone browser ESM.
- Return `defineModule({ id, path, title, navLabel, iconKey, showInSidebar, Page })`.
- Use a stable lowercase kebab-case `id`; the route `path` should usually be `/${id}`.
- Prefer one of these `iconKey` values: `Insights`, `Dashboard`, `Assessment`, `Store`, `Storefront`, `Inventory`, `AdsClick`, `QueryStats`, `TableChart`, `Timeline`, or `ViewAgenda`. Unknown icon keys fall back to `Insights`.

## Example Discovery

- Read `modules/index.json` to see currently published modules.
- Treat every registry entry as an object with `id` and `manifestUrl`.
- For each module, read its `manifestUrl`.
- Resolve the manifest's `entryUrl` relative to that manifest URL and read the uploaded `index.mjs`.
- Before creating a new module, check whether the requested module name or id already exists, or is close to an existing module.
- If a matching or likely matching module exists, pull down its manifest and current `index.mjs`, then edit that module instead of starting from a blank file.
- Prefer patterns from real uploaded modules over old copied examples.
- Do not use local filesystem examples, local repo state, or local module source folders for discovery. Only use the public S3 registry and uploaded module files.
- Do not ask for or depend on the dashboard app Git repository while authoring a standalone S3 module.

## Data Rules

- Use `runtime.useModulePage(PAGE_ID)` for authenticated vendor/date context.
- Use `runtime.runModuleSql(api, sql, { debugTag })` for Snowflake requests.
- Use `runtime.moduleSqlTimestampLiteral(date, "start" | "end")` for dashboard date filters.
- Put SQL in helper functions inside `index.mjs`.
- Read `SQL_ALLOWLIST.md` or `sql-allowlist.json` before writing SQL.
- Use the table and column descriptions in `SQL_ALLOWLIST.md` or `sql-allowlist.json` to choose the right table and fields.
- Only use allowlisted tables and columns.
- Always reference real Snowflake tables with the exact fully-qualified `DATABASE.SCHEMA.TABLE` name from the allowlist.
- Short names are only okay for CTEs defined inside the same query, not for allowlisted base tables.
- Alias every selected SQL column explicitly with double quotes.
- Coerce raw row values before rendering, especially numbers and dates.
- Do not use `SELECT *`.
- Do not use unqualified SQL table names.
- Do not use unqualified SQL columns.
- Do not hardcode vendor ids, auth/session values, tokens, or backend secrets.
- If the needed table or column is not allowlisted, stop and describe the backend allowlist gap instead of inventing a workaround.

## UI Rules

- Prefer standardized UI from `sdk.ui`.
- Good defaults are `ModulePageShell`, `ModuleSectionRow`, `Section`, `KpiCard`, `DataGrid`, `StackedBarChart`, `SimpleBarChart`, `LineChart`, `PieChart`, and `ComboChart`.
- Read `UI_PATTERNS.md` before choosing UI; it documents supported props, chart data shapes, table row requirements, and empty/loading-state patterns.
- Use native HTML elements through `React.createElement` for explanatory text, lists, empty states, and simple inline layouts.
- Use `UI_PATTERNS.md` and real uploaded modules in the public S3 `modules/` registry when designing UI from public S3 files.
- Keep modules understandable for non-engineer review: a few helper functions, clear SQL aliases, and simple page state.
- Include useful empty/loading states where practical.

## Access Rules

- Include `author` in every module definition.
- Include `ownerUserId` in every module definition. Use `AUTHOR_USER_IDS.md` when the author clearly matches; otherwise ask the author for their dashboard userId.
- Omit `access` for admin-only modules.
- Use `access.enabledForAll: true` only when the module should be available to everyone with dashboard access.
- Use `access.vendorIds` or `access.companyAccountIds` only when the user asks for a targeted rollout.
- Use `visibility: "owner-only"` only when the user explicitly asks for owner-only default visibility.
- The admin Module Manager can override enabled/disabled and owner-only/admin/module-defined visibility in the S3 manifest without changing `index.mjs`.
- `showInSidebar: false` hides the module from nav even when the route is accessible.

## Publishing

The S3 registry layout is:

- `modules/index.json`
- `modules/MODULE_ID/manifest.json`
- `modules/MODULE_ID/VERSION/index.mjs`

`modules/index.json` entries must be objects shaped like `{ "id": "MODULE_ID", "manifestUrl": "./MODULE_ID/manifest.json" }`.

When creating or editing a module, publishing is part of the task. Do not stop after writing `index.mjs` unless the user explicitly says not to publish.

When publishing:

1. If the user explicitly placed you inside the `pear-dashboard-s3-modules` repo, publish from that repo root with `bash scripts/publish-s3-module.sh --module-id MODULE_ID --version VERSION --entry ./modules/MODULE_ID/index.mjs`.
2. Otherwise, download `bootstrap-aws-publisher.sh` and `publish-s3-module.sh` from the public authoring kit into the standalone workspace.
3. Run `bash bootstrap-aws-publisher.sh` if AWS CLI auth is missing or expired.
4. Publish standalone workspaces with `bash publish-s3-module.sh --module-id MODULE_ID --version VERSION --entry ./index.mjs`.
5. Verify the published manifest and entry URL with `curl -fsS`.
6. If shell execution is unavailable in the environment, clearly say that publishing could not be executed and provide the exact command. Otherwise, execute the publish command yourself.

Publishing scripts only write under the existing `modules/` prefix. They do not create buckets, edit bucket policies, edit CORS, or change IAM.

The bucket allows any IAM principal in AWS account `042357577846` to publish under `modules/`. Do not request a new AWS permission set for module publishing.

## AWS Login

- Do not ask non-engineers for an SSO start URL.
- The public scripts default to `https://pearcommerce.awsapps.com/start`, account `042357577846`, and the existing `PlatformAdmins` permission set.
- If browser login cannot start automatically, ask an admin to provide `aws-publisher.env` from the public `aws-publisher.env.example`.

## Forbidden Actions

- Do not write generated module files into `pear-dashboard`, `src/modules`, or any dashboard app source directory.
- Do not edit dashboard app files while authoring a standalone S3 module.
- Do not inspect the dashboard app repo to understand module APIs, examples, SDK behavior, routes, styles, or existing modules; use public S3 authoring files instead.
- Do not scan the local filesystem to find existing module directories or decide whether a bookkeeping repo exists.
- Do not put module source folders at the root of `pear-dashboard-s3-modules`; use `modules/MODULE_ID/`.
- Do not create buckets.
- Do not edit bucket policies.
- Do not edit CORS.
- Do not change IAM.
- Do not run `aws s3 mb`, `aws s3api create-bucket`, `aws s3api put-bucket-policy`, `aws s3api put-bucket-cors`, or `aws iam ...`.

## Response Shape

When asked to create a module, provide:

- the module id
- the version that was published
- the published manifest URL
- the published entry URL
- whether `curl` verification succeeded
- any backend allowlist gap

Only include the complete `index.mjs` content if the user asks to see it or if publishing could not be executed.
