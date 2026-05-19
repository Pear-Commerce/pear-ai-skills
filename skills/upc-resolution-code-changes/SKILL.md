---
name: upc-resolution-code-changes
description: Use when changing Pear UPC resolution graph search, UPCResoGraph nodes, StaticKnownItemDetails, TinEye/image comparison, direct/trusted candidate scoring, resolver gates, ItemIdInfoResolver wiring, retailer UPC feasibility scripts, known item detail resolution, or related UPC resolution behavior in api.pearcommerce.com. Ensures narrow code changes get focused unit checks plus local devdb UPC resolution verification.
---

# UPC Resolution Code Changes

Use this as the code-change and verification guardrail for UPC resolution work in `api.pearcommerce.com`.

This combines the former graph-change and local devdb verification workflows. If an older prompt refers to `pear-upc-resolution-graph-code-changes` or `pear-upc-resolution-verification`, use this skill instead.

## Code-Change Workflow

1. Use `pear-engineering-workflow` first for the normal Pear repo/worktree/review cleanup rules.
2. Keep graph and resolver edits narrow. Prefer existing graph node patterns, app config toggles, `AWSAppConfigUtil` access, and existing score/candidate helpers over new one-off logic.
3. For concurrency, resolver timing, queues, locks, or futures, also use `pear-concurrency`; do not cancel existing resolver work unless the user explicitly asked for cancellation semantics.
4. Add or update focused deterministic tests for the exact behavior touched. Common anchors include:
   - `UPCResolutionSpeedupTest`
   - `TineyeUtilTest`
   - targeted `UPCResoGraph*` tests or resolver tests for the touched node/resolver
5. Run focused checks, at minimum:
   ```bash
   ./gradlew compileJava -PnoLint --console=plain
   ```
   Prefer a targeted `testCI --tests ... -PnoLint --console=plain` run for the changed code as well. If the Gradle test loads Spring/Pear resources, SimpleORM, real entities, UPC resolver scripts, AppConfig, Snowflake, or live retailer data, prefix it with the shared devdb env from `references/devdb-sample.md`; do not let it fall back to local MySQL. Pure compile and pure unit tests can run without the DB prefix.
6. Supplement narrow checks with local devdb coverage before calling UPC resolution behavior done. This is especially important for image comparison, TinEye, direct/trusted candidates, known item details, retailer source caps, resolver scheduling/gating, retailer UPC feasibility scripts, or any change that could alter the selected item ID.

## Local Devdb Verification

Read `references/devdb-sample.md` for the current known-good sample, environment prefix, long full-e2e harness, and known master-failing exclusions.

These checks use shared devdb credentials and live retailer scrape paths. They are intentionally local and explicit rather than CI-default.

Devdb workflow:

1. Work in a dedicated `api.pearcommerce.com` worktree for the feature branch. Do not run broad live-script suites from a dirty user checkout.
2. Run the known-good sample on the feature branch with the exact `--tests` filters. Preserve the filters; class-level runs include live scrape probes that are not reliably passing.
3. For graph/image/scoring changes, include a meaningful long/full e2e subset from the known-good full-e2e filters, biased toward retailers and surfaces touched by the change.
4. For image comparison or TinEye changes, include the Larabar/Target/TinEye-sensitive filters from the sample when feasible.
5. If a selected filter fails on the feature branch, rerun the same filter once.
6. If it still fails, compare against a clean `origin/master` or requested base worktree before blaming the feature branch.
7. Treat a test that passes on master/base and fails on the branch as a regression until proven otherwise.
8. Treat a test that also fails on master/base as live-data/scrape drift. Disable only the demonstrated bad `@Script` or slow test with a date and reason, or update the sample reference if the passing set changes.
9. In `api.pearcommerce.com`, known master-failing UPC-resolution devdb probes should use `LocalDevdbDrift.assumeKnownMasterFailingProbeEnabled(...)` rather than broad or permanent `@Disabled`.

## Reporting

In the final response or PR update, report:

- focused unit/compile checks run
- local devdb sample filters run, including any long e2e filters
- master/base commit used when refreshing or comparing the sample
- branch commit verified
- passing retailers/surfaces
- tests disabled or excluded because they also fail on master/base
- any branch-only failures and the suspected cause

Do not present the local devdb sample as required CI. Say plainly that it supplements CI/unit coverage.
