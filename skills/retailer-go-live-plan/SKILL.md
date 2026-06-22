---
name: retailer-go-live-plan
description: Create and execute a repeatable Pear retailer go-live plan after a retailer integration PR is merged or close to merging. Use when asked whether a retailer is live, what the final go-live step is, how to prove go-live, or to make a go-live checklist for direct retailer integrations such as Michaels or Fleet Farm. Covers merge/deploy state, live RetailPartner/runtime wiring, availability/store prerequisites, production retailer-list API proof, production Offers picker button proof, and final retailer PDP click-through; delegates write/updater smoke runs to retailer-verify and pear-prod-jsp.
---

# Retailer Go-Live Plan

Use this skill to turn a retailer integration into a concrete go-live checklist and verdict. Do not call a retailer "live" from merge state alone. The decisive proof is:

1. merged code is deployed to the relevant live services;
2. the live `RetailPartner` row is enabled and wired to the direct runtime path;
3. Pear's production read path returns the retailer for a known UPC/ZIP/store context;
4. the production Offers picker shows the retailer button without relying on `include=`;
5. clicking the visible button reaches the expected retailer PDP.

## Required Companion Skills

- Use `$pear-pr-review-flow` when the request mentions a PR, merge, review, deploy, or landing state.
- Use `$retailer-verify` for the final production read-path, picker, and click-through proof.
- Use `$pear-prod-jsp` only when live Java/server context or a production DB write/updater run is needed.
- Use `$browser` for production Offers picker and retailer PDP verification.

## Inputs To Collect

Record these before making a verdict:

- Retailer name, enum, and `RetailPartner.id`.
- PR number(s), merge commit(s), and base branch.
- Expected deployed services: usually production API and the availability service; sometimes jobs, UPC resolution, catalog-ingester, or list-scraper depending on the changed code path.
- Smoke UPC, `upcId`/canonical UPC offer id, ZIP/postal code, country, and store ID when local availability is store-specific.
- Stored item data needed by the updater: direct retailer `itemId`, `secondaryId`/slug/SKU if needed, and expected PDP URL.
- Availability scope: local-store/store-level, ship-to-home, online fallback, or purchasability-only.

Use stable examples as patterns, not hardcoded requirements:

- Michaels: retailer `80084`, enum `Michaels`, sample UPC `071662077266`, offer/upc id `3027019089465295`, ZIP `95606`, store `9042`, final PDP path `/product/crayola-fine-line-markers-classic-colors-10ct-10620930`.
- Fleet Farm: retailer `5849`, enum `fleetfarm1`, sample UPC `041137006251`, offer/upc id `2850843037283024`, ZIP `55315`, store `3200`, final PDP path `/detail/-/0000000308984`.

## Go-Live Workflow

### 1. PR and deploy state

Check the relevant PRs and commits:

```bash
gh pr view <pr> --json state,mergedAt,mergeCommit,reviewDecision,statusCheckRollup
gh api repos/Pear-Commerce/api.pearcommerce.com/compare/<merge_sha>...master --jq '{status,ahead_by,behind_by}'
```

Then inspect live deployment runs:

```bash
gh run list --repo Pear-Commerce/api.pearcommerce.com --workflow deployment.yml --limit 80 --json databaseId,displayTitle,status,conclusion,headBranch,headSha,createdAt,url
gh run list --repo Pear-Commerce/api.pearcommerce.com --workflow scheduled-restart.yml --limit 20 --json databaseId,displayTitle,status,conclusion,headSha,createdAt,url
```

For availability updater changes, verify a successful availability restart or deploy on a commit that contains the merge. If a production deploy started before the merge, it does not prove the merge is live.

### 2. Live retailer configuration

Use live read-only DB checks. Run `devops/db.sh` reads sequentially; its helper filename can collide if several reads run in parallel.

```bash
devops/db.sh -e PROD --read "select id, enumName, name, live, availabilitySharedImagesAndIds, itemAvailabilityDependsOnZip, locationAgnosticShipToHome, itemUpdateConfiguration from RetailPartner where id in (...);"
```

Confirm:

- `live = 1`;
- `availabilitySharedImagesAndIds` matches the intended direct/shared platform contract;
- the updater class/config is not stale fallback metadata;
- direct updater discovery is known from code or server-side runtime proof, not from `itemUpdateConfiguration` alone.

For store-level claims, also check imported stores and zones when relevant:

```bash
devops/db.sh -e PROD --read "select count(*) from Store where retailerId = <id>;"
devops/db.sh -e PROD --read "select count(*), count(distinct zoneId) from ZipRetailerZone where retailerId = <id>;"
```

### 3. Optional local code smoke

If still pre-deploy or debugging a suspected code issue, run focused tests from a clean worktree at the intended commit. Force execution; do not trust Gradle up-to-date state.

```bash
MYSQL_CREDENTIALS_SECRET=prod-db-10-2025 \
MYSQL_HOST=analytics-database.pearcommerce.com \
MYSQL_HOST_READ=analytics-database.pearcommerce.com \
MYSQL_HOST_WRITE=analytics-database.pearcommerce.com \
SNOWFLAKE_CREDENTIALS_SECRET=snowflake-2025-12-01 \
./gradlew test --rerun-tasks --tests <RetailerIntegrationTest>
```

Treat unrelated dependency/network failures separately from retailer code failures.

### 4. Decide whether a write JSP is needed

Prefer read-only proof. Use a preview-first write/updater JSP only when Pear has no reusable valid UPC/retailer data or saved availability and the shopper read path cannot show the retailer without running the updater.

When a write/updater JSP is needed:

- use `$retailer-verify` and `$pear-prod-jsp`;
- preview first with a visible `Run` button;
- save only one winning `AVAILABLE` row;
- use exact upsert keys such as `(retailerId, upcId, zip, storeId)`;
- do not save misses or broad scan output.

If production `retailer-list`, picker button, and click-through already pass, do not run a write JSP just to repeat proof.

### 5. Production read-path proof

Check the production API with the trusted-edge header:

```bash
PEAR_TRUSTED_EDGE_VALUE="${PEAR_TRUSTED_EDGE_HEADER:-${PEAR_TRUSTED_EDGE:-a1360351-32b2-4410-9c87-ec294e780c25}}"
curl -fsS -H "x-pear-trusted-edge: ${PEAR_TRUSTED_EDGE_VALUE}" \
  "https://api.pearcommerce.com/v1/retailer-list/<offerId>?zip=<zip>&countryCode=<countryCode>&debug=true"
```

The target retailer should appear without `include=<retailerEnum>`. Use `include=` only as a diagnostic for geo/filtering, and state that explicitly.

### 6. Production shopper proof

Use the production picker, not only TEST:

```text
https://offers.pearcommerce.com/picker/<offerId>?zip=<zip>&countryCode=<countryCode>&debug=true
```

In the browser:

1. confirm the target retailer button is visible, expanding "See more places to buy" if needed;
2. click the visible retailer button;
3. verify the final retailer URL has the expected stable domain/path/item id.

Pear tracking params such as `pearclid`, `utm_source`, `offerId`, or `ref=pearcommerce` are normal.

## Verdict Format

Report one of:

- `live`: all deployment, runtime, production API, picker, and click-through checks passed;
- `deployed but not shopper-proven`: code/config is live, but production picker or click-through was not verified;
- `blocked`: state the missing gate and exact next action.

Always include:

- retailer id/enum;
- production picker URL;
- final clicked PDP URL;
- availability scope, e.g. local-store pickup/BOPIS versus ship-to-home or fallback;
- whether any production DB write/JSP was run.

## Common Failure Modes

- Merged PR state is not go-live proof.
- A production deploy created before the merge does not contain the merge.
- `test.offers.pearcommerce.com` proves only TEST shopper surface; use production Offers for go-live.
- `itemUpdateConfiguration.itemUpdaterClass` is fallback/config metadata, not sufficient runtime proof by itself.
- Direct retailer `itemId` and Instacart `instacartItemId` are different paths; prove the direct path first for direct integrations.
- Store-level availability requires a store/branch echo or equivalent requested-store validation. Do not describe fallback/online availability as store-level inventory.
- Fleet Farm local `curl` may hit Cloudflare; use browser or proxy-backed server/code paths.
