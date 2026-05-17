---
name: pear-upc-resolution-verification
description: Run Pear local devdb UPC resolution verification for api.pearcommerce.com. Use when Codex changes UPC resolution graph search, ItemIdInfoResolver code, retailer UPC feasibility scripts, TinEye/image comparison, known item detail resolution, or resolver scheduling and needs live-script confidence outside CI.
---

# Pear UPC Resolution Verification

Use this skill as the local live-script verification gate for UPC resolution work. These checks use shared devdb credentials and live retailer scrape paths, so they are intentionally local and explicit rather than CI-default.

## Workflow

1. Work in a dedicated `api.pearcommerce.com` worktree for the feature branch. Do not run broad live-script suites from a dirty user checkout.
2. Read `references/devdb-sample.md` for the current known-good sample, environment prefix, and known master-failing exclusions.
3. If the sample is stale or a selected test fails on the feature branch, rerun the same test on a clean `origin/master` or requested base worktree before blaming the feature branch.
4. Run the known-good sample on the feature branch with the exact `--tests` filters. Preserve the filters; class-level runs include live scrape probes that are not reliably passing.
5. Treat a test that passes on master and fails on the branch as a regression until proven otherwise. Focus first on retailers or surfaces touched by the change.
6. Treat a test that also fails on master as live-data/scrape drift. Disable only the demonstrated bad `@Script` or slow test with a date and reason, or update the sample reference if the passing set changes.
7. After code changes, also run the focused deterministic tests relevant to the touched code, such as `UPCResolutionSpeedupTest`, `TineyeUtilTest`, and `./gradlew compileJava`.

## Reporting

Report:

- master/base commit used for the sample baseline
- feature branch commit tested
- exact sample command or log path
- passing retailers/surfaces
- tests disabled or excluded because they fail on master
- any branch-only failures and the suspected cause

Do not claim CI coverage for this gate. These scripts scrape live retailers and use shared devdb configuration, so they are a local verification supplement.
