---
name: pear-upc-resolution-graph-code-changes
description: Use when changing Pear UPC resolution graph search, UPCResoGraph nodes, StaticKnownItemDetails, TinEye/image comparison, direct/trusted candidate scoring, resolver gates, ItemIdInfoResolver graph wiring, or related UPC resolution behavior in api.pearcommerce.com. Ensures graph changes get focused unit tests plus local devdb UPC resolution verification.
---

# Pear UPC Resolution Graph Code Changes

Use this as the graph-change guardrail for UPC resolution work in `api.pearcommerce.com`.

## Workflow

1. Use `pear-engineering-workflow` first for the normal Pear repo/worktree/review cleanup rules.
2. Keep graph edits narrow. Prefer existing graph node patterns, app config toggles, `AWSAppConfigUtil` access, and existing score/candidate helpers over new one-off logic.
3. For concurrency, resolver timing, queues, locks, or futures, also use `pear-concurrency`; do not cancel existing resolver work unless the user explicitly asked for cancellation semantics.
4. Add or update focused deterministic tests for the exact behavior touched. Common anchors include:
   - `UPCResolutionSpeedupTest`
   - `TineyeUtilTest`
   - targeted `UPCResoGraph*` tests or resolver tests for the touched node/resolver
5. Run focused checks, at minimum:
   ```bash
   ./gradlew compileJava -PnoLint --console=plain
   ```
   Prefer a targeted `testCI --tests ... -PnoLint --console=plain` run for the changed code as well.
6. Always supplement the narrow unit checks with `pear-upc-resolution-verification` local devdb coverage before calling graph behavior done. This is especially important for image comparison, TinEye, direct/trusted candidates, known item details, retailer source caps, resolver scheduling/gating, or any change that could alter the selected item ID.

## Devdb Verification Expectations

Use `pear-upc-resolution-verification` and its `references/devdb-sample.md` known-good sample. The local devdb sample is not CI coverage; it catches live resolver and scrape interactions that narrow unit tests miss.

For graph/image/scoring changes, include a meaningful long/full e2e subset from the known-good full-e2e filters, biased toward retailers and surfaces touched by the change. For image comparison or TinEye changes, include the Larabar/Target/TinEye-sensitive filters from the sample when feasible.

If a devdb filter fails on the branch:

- rerun the same filter once
- compare against clean master/base before blaming the branch
- treat master/base pass plus branch fail as a regression
- treat master/base fail as live-data/scrape drift and record it in the verification skill sample
- prefer `LocalDevdbDrift.assumeKnownMasterFailingProbeEnabled(...)` for known master-failing probes, not broad or permanent `@Disabled`

## Reporting

In the final or PR update, report:

- focused unit/compile checks run
- local devdb sample filters run, including any long e2e filters
- master/base commit used when refreshing or comparing the sample
- branch commit verified
- any filters excluded because they also fail on master/base

Do not present the local devdb sample as required CI. Say plainly that it supplements CI/unit coverage.
