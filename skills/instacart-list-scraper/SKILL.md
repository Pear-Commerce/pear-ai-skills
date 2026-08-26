---
name: instacart-list-scraper
description: Operate and tune Pear's Instacart prewarm/list-scraper subsystem.
---

# Instacart List Scraper

## When to use

Working with anything that touches `InstacartBatchInventoryList` processing, `InstacartPrewarmer`, the prewarm Quartz job, the no-recipes prewarm dashboard, or AppConfig knobs in the `instacart-prewarm-pool` namespace. Use for tuning, dashboard interpretation, code review of changes near the prewarm path, or onboarding new engineers to the subsystem.

## AWS SSO Prerequisite

Before running any AWS CLI command in this skill (e.g. AppConfig lookups), proactively run:

```bash
aws sso login --profile pear-sso
```

This opens the user's Chrome browser for authentication and blocks until approved. Never attempt AWS commands with stale credentials — if you see `UnrecognizedClientException` or `Token has expired`, run the login command first and retry. See `$pear-aws` for full credential troubleshooting.

## The system in one page

`InstacartBatchInventoryList` is the unit of work. Each row represents a list of UPCs to be scraped against an Instacart retailer's zones. A scheduled job picks the oldest expired lists and refreshes them by calling Instacart's GraphQL, then writing `UPCRetailerZipAvailability` (URZA) rows for each (UPC × zone) tuple.

The work model:

1. **One Quartz job** triggers all production scraping: `InstacartPrewarmRetailerListsJob`. Runs every 90s on the **catalog-ingester** Beanstalk environment. Guarded by a per-process `AtomicBoolean` — a tick that runs longer than 90s suppresses subsequent ticks until it completes.
2. **`InstacartPrewarmer.prewarm()`** is the workhorse method. Behavior is determined by builder configuration (see "The Builder" below).
3. **Eligibility** in Quartz mode is `getSoonExpiredListsBatch(true)` which returns the oldest N lists (capped by `retailer-list-run-batch-size`) where `retailerId != 0 AND vendorId != FLEXIBLE_INGREDIENTS_VENDOR_ID`.
4. **Inner fan-out per list**: list → UPCs → (UPC × top-20 most-populous zones per retailer) → Instacart scrape calls → URZA writes.
5. **URZA writes cascade via two triggers** (see "Triggers" below) which write to `UPCRetailerZipAvailabilityDailyUpdates` for Snowflake pulse data.
6. **List completion updates `dateLastScraped`** at the end of the per-list processing block. Some branches update `dateLastScrapedMinorChanges` instead, or neither (this is intentional for non-retailer-scoped builds — see the builder).

## The three populations of InstacartBatchInventoryList

The table holds three distinct populations identified by `(retailerId, vendorId)`. Only one is what the dashboard and the Quartz job care about.

| Population | Filter | Purpose | Counted by dashboard? |
|---|---|---|---|
| **Retailer prewarm** | `retailerId != 0 AND vendorId = 0` | Standard per-retailer scraping. The Quartz job's main target. | Yes — this is the entire dashboard scope. |
| **Recipe flex** | `vendorId = 2412072003881250` (FLEXIBLE_INGREDIENTS_VENDOR_ID) | Recipe ingredient flexibility. Pipeline is **intentionally disabled**. Lists accumulate stale but nothing processes them. | No — explicitly excluded. Reading these without that context produces false alarms (100k+ "expired" lists). |
| **General purpose** | `retailerId = 0 AND vendorId = 0` | Cross-retailer prewarm jobs. Handled by a separate code path (`getExpiredGeneralPurposeLists`). | No — separate metric, separate scheduler. |

When you see SQL queries against this table, **always check the filter**. The default-looking `SELECT * FROM InstacartBatchInventoryList` lumps all three populations together and produces meaningless numbers for capacity planning.

## The builder: four modes, one prewarm() method

`InstacartPrewarmer.prewarm()` is one method but behaves as different code paths depending on builder configuration. To understand any tick or invocation, identify the builder config first; the inner branch labels (`main_retailer`, `no_futures_retailer`, etc.) are secondary.

The setters that drive mode selection:

| Setter | Effect |
|---|---|
| `setAllItems(true)` | Quartz job mode. Selects oldest N lists via `getSoonExpiredListsBatch`. Updates `dateLastScraped`. |
| `setListIds(List<Long>)` | Specific-list mode. Used for manual/admin runs from `DashboardApp`. Updates `dateLastScrapedMinorChanges` only. |
| `setUpcIds(List<Long>)` / `setUpcIdsViaVendorId(Long)` | Vendor prewarm mode. Finds lists containing these UPCs and processes those. |
| `setForceListsExpired(true)` | Bypasses staleness filter — uses `getAllLists(true)` directly. Processes every list, not just expired. Use only for catchup. |
| `setChangeScope(ChangeScope)` | `MEANINGFUL_CHANGES` (Quartz default), `ALL_CHANGES`, or `ALL`. Affects which `dateLastScraped*` fields get updated. |
| `setRetailerIdsForVendorPrewarm(List<Long>)` | Restricts a vendor prewarm to specific retailers. |

The four observable production modes, with their named factory:

1. **Quartz batch** — `forQuartzBatch().build()`. Called by `InstacartPrewarmRetailerListsJob` every 90s. This is the production daily-driver.
2. **Specific-list** — `forSpecificLists(listIds, upcIds).build()`. Dashboard hooks for one-off runs against named lists.
3. **Vendor prewarm** — `forVendorPrewarm(upcIds).build()`. Called by vendor workflows refreshing their UPCs across the lists those UPCs appear in.
4. **Catchup-all-lists** — `forCatchupAllLists().build()`. Bypasses the staleness filter. Not normal traffic.

Each factory returns the underlying `InstacartPrewarmerBuilder`, so callers may chain additional setters when needed (e.g. overriding `changeScope` for a Quartz-shaped run that wants `ALL_CHANGES` instead of the default `MEANINGFUL_CHANGES`). The four observable modes correspond to the four factories; ad-hoc setter chains at call sites should be rare and call out non-standard intent.

Practical implication: when changing `InstacartPrewarmer`, verify against all four modes. A change that improves Quartz behavior may break vendor prewarm or admin runs.

## AppConfig knobs

All knobs are live-read via `awsAppConfigUtil.getIntegerNow(...)` — changes take effect on the next Quartz tick (90s) with **no deploy required**.

The defaults shown below are the **code defaults** (the third argument to `getIntegerNow` / `getBooleanNow`). Production values are typically different and live in AppConfig. Look up current production values rather than assuming code defaults match reality.

`instacart-prewarm-pool` namespace:

| Key | Effect | Code default |
|---|---|---|
| `max-workers` | Parallel worker count inside `prewarm()` for (UPC × zone) fan-out | 100 |
| `retailer-list-run-batch-size` | Max lists picked per Quartz tick | 45 |
| `prewarm-job-runs-all-lists` | Quartz job gate; if true, the Quartz job runs the prewarm pass | true |
| `fast-forward-enabled` | Whether prewarm uses a resume cursor across runs | true |
| `prewarm-await-timeout-minutes` | Per-tick await timeout for the lastWarmFuture | 60 |
| `prewarm-saves-timeout-minutes` | Per-tick timeout for outstanding save futures | 10 |
| `vendor-ids-for-zone-shop-grouping` | Vendor IDs that use `zoneId-shopId` grouping rather than `shopId` only | (empty) |
| `save-availability-log`, `shared-list-availability-log` | Toggles for the availability log writes | false / true |

`instacart-bau` namespace (downstream of prewarm):

| Key | Effect | Code default |
|---|---|---|
| `pool-size` | BAU worker pool size (per US / CA pool) | 75 |
| `canada-enabled` | Whether Canada-side BAU runs | false |
| `upc-batch-size` | Items per UPC batch | 100 |
| `upc-batch-parallelism` | Concurrent UPC batches | 1 |
| `price-endpoint-batch-size` | Items per price API call | 100 |
| `max-zones-per-batch` | Zone fan-out limit per item | 5 |
| `max-items-per-batch` | Item fan-out limit per zone | 50 |

### Looking up current values

Set IDs once and reuse:

```bash
APP_ID=$(aws appconfig list-applications --query 'Items[?Name==`Pear API`].Id' --output text)
PROFILE_ID=$(aws appconfig list-configuration-profiles --application-id "$APP_ID" \
  --query 'Items[?Name==`Base (All)`].Id' --output text)
```

Get the latest version number:

```bash
LATEST=$(aws appconfig list-hosted-configuration-versions \
  --application-id "$APP_ID" --configuration-profile-id "$PROFILE_ID" \
  --max-items 1 --query 'Items[0].VersionNumber' --output text)
```

Read a single key (`max-workers` shown):

```bash
aws appconfig get-hosted-configuration-version \
  --application-id "$APP_ID" --configuration-profile-id "$PROFILE_ID" \
  --version-number "$LATEST" /tmp/cfg.json >/dev/null && \
jq -r '.values["instacart-prewarm-pool"]["max-workers"]' /tmp/cfg.json
```

Dump the whole `instacart-prewarm-pool` namespace:

```bash
jq '.values["instacart-prewarm-pool"]' /tmp/cfg.json
```

Show recent version history with labels and descriptions (the changelog):

```bash
aws appconfig list-hosted-configuration-versions \
  --application-id "$APP_ID" --configuration-profile-id "$PROFILE_ID" \
  --max-items 30 --output json | \
jq -r '.Items[] | "\(.VersionNumber)\t\(.VersionLabel // "—")\t\(.Description // "")"'
```

Find every version that touched a specific key (slower, downloads each version):

```bash
for V in $(seq $((LATEST-20)) $LATEST); do
  aws appconfig get-hosted-configuration-version \
    --application-id "$APP_ID" --configuration-profile-id "$PROFILE_ID" \
    --version-number "$V" /tmp/v.json >/dev/null 2>&1
  VAL=$(jq -r '.values["instacart-prewarm-pool"]["max-workers"]' /tmp/v.json)
  echo "v$V max-workers=$VAL"
done
```

When making a change, set `--version-label` and `--description` on the new version — both appear in the history listing above and serve as the changelog.

### Tuning order when capacity issues appear

1. **`max-workers`** first. Clean, monotonic, easy to revert.
2. **`retailer-list-run-batch-size`** second. Smaller batch = faster tick; combined with high worker count can produce unexpected behavior at very small values.
3. **Per-list cost reduction** as a last resort — code change, not a knob.

Change one knob at a time. Observe for at least 30-60 minutes. Label every AppConfig change with a `--version-label` and `--description` for future readers.

## Dashboard reference

The maintained dashboards live in Datadog. Find them by searching for **"Instacart"** in the Datadog dashboard list — the canonical ones are the standard "Instacart Prewarm" view and the "no recipes" variant that filters out the intentionally-disabled recipe-flex population.

Which widget answers which question:

| Question | Widget | Group |
|---|---|---|
| Is the metric pipeline alive? | Metric Freshness | top of dashboard |
| Are we processing enough lists to satisfy the 24h TTL? | Throughput Gap (single-stat, green/yellow/red) | Throughput Gap |
| Is the actual processing rate trending up or down over time? | Throughput Gap over time (1h smoothed) | Throughput Gap |
| Is any code path silently dropping lists without saving? | Silent Bleeder (`list_no_date_update`) | Un-Staling Outcomes |
| Is the system experiencing save failures? | Save Failures by Exception Class | Un-Staling Outcomes |
| Which code paths fired un-stalings (and how often)? | Un-Staling Success Rate by path | Un-Staling Outcomes |
| Is the worker pool saturating? | BAU Pool Utilization, All Instacart Pools — Utilization | Ramp Readiness |
| Is the long-horizon backlog converging or diverging? | Backlog Size (4h smoothed), Net Drain Rate (8h smoothed) | Trend View |

### Known interpretive traps

- **`Steady-state Retailer Inventory List Age`** measures input/output ratio, not absolute throughput. It can sit at ~24h for arbitrarily long while the system is silently under-provisioned. **Do not use as a primary health signal.** Use the Throughput Gap widget instead.
- **`Num Expired Retailer Inventory Lists`** thresholds were set for a smaller population era. At current population (~45k), the natural steady-state at the system's processing cadence is structurally large (tens of thousands). Red color is expected at certain operating points; don't treat it as an alarm on its own.
- **`Max Retailer Inventory List Staleness`** is the MAX across the population — it only drops when the very oldest list specifically gets touched. Lags behind throughput improvements by hours-to-a-day.

## Triggers on UPCRetailerZipAvailability

URZA writes cascade through two triggers that write to `UPCRetailerZipAvailabilityDailyUpdates` (for Snowflake pulse data):

- **`iaas_daily_updater`** — `AFTER UPDATE`. Inserts a row when URZA status/availability fields change.
- **`iaas_daily_inserter`** — `AFTER INSERT`. Inserts a row on URZA creation.

Both filter by `vendorId != FLEXIBLE_INGREDIENTS_VENDOR_ID` and require `inStoreStatus`/`shipToHomeStatus`/`status` to be a non-pending value. Trigger source is in `UPCRetailerZipAvailability.java` (`pulse_iaas_daily_updater`, `pulse_iaas_daily_inserter`).

**Required idiom**: both triggers must `DECLARE v_date_updated DATETIME; SET v_date_updated = NOW();` and use the variable in the `INSERT VALUES`. Calling `NOW()` inline in the INSERT triggers AWS Aurora bug `ER_ROW_DOES_NOT_MATCH_GIVEN_PARTITION_SET` (error 1748) on `INSERT ... ON DUPLICATE KEY UPDATE` against the unpartitioned URZA table. The workaround is mandatory — do not "simplify" the triggers by inlining `NOW()`.

**Scope changes are expensive**: removing the retailer allowlist from these triggers (so all retailers' URZA mutations cascade to the daily-updates table) significantly increases per-URZA write cost. Any change to trigger scope should be evaluated against expected URZA write volume × the row-amplification factor.

## Existing instrumentation

Four counters under `pear.availabilities.batch.prewarm.*`, tagged by `path`, `retailerId`, `vendorId`, and (for failures) `exceptionClass`:

| Counter | Fires when | What it means |
|---|---|---|
| `list_un_staled` | List completed and `dateLastScraped` was written | Success path. Higher = better drain rate. |
| `list_no_date_update` | List processed but no date field was updated | Silent bleeder. Any nonzero value indicates lists that ran but didn't have their staleness reset. |
| `list_save_failed` | `list.save(true)` threw inside the catch block | Save failure. `exceptionClass` tag identifies the failure mode. |
| `list_no_save_futures` | Entered the else branch (`lastWarmFuture` was null) | Sanity check; expected for some list types but spikes here suggest empty `inventoryIdToRetailerZones` lookups. |

The `path` tag distinguishes which inner branch fired. Values follow the prefix convention `main_*` (the `lastWarmFuture != null` block) or `no_futures_*` (the else block). Look at the `unstalePath` assignments in `InstacartPrewarmer.java` for the current set; new branches are added as save logic evolves so an enumeration here would drift.

## Throughput math

The capacity equation:

```
required_lists_per_hour = list_count / TTL_hours
```

For a TTL target of 24h and current population (~45k retailer prewarm lists), the system must process ~1,875 lists/hour sustained. If actual processing rate is below this, the system cannot refresh every list within the TTL; backlog will accumulate at the difference.

The **Throughput Gap widget** computes `actual_lists_per_hr - (list_count / 24)`. Positive = headroom; zero = treading water; negative = falling behind.

This number, not `Steady-state Age`, is the operative health signal.

## Packages and responsibilities

| Package | Responsibility |
|---|---|
| `com.pear.instacart` | The prewarm engine itself. `InstacartPrewarmer` owns the per-tick scrape loop, builder, and per-list save logic. `InstacartBatchInventoryList` owns list entities and the UPC resolution path. Helpers (`InstacartScraperUtil`, `InstacartBatchScraperUtil`) own outbound Instacart API calls. |
| `com.pear.jobs` | Scheduling. `InstacartPrewarmRetailerListsJob` is the Quartz trigger for the production prewarm path. `CustomStatsdMetricJob` emits the `retailer_inventory_list_*` gauges every 60s. |
| `com.pear.entities.inventory` | URZA persistence and trigger management. `UPCRetailerZipAvailability` owns the URZA entity and the `pulse_iaas_*` trigger definitions (SimpleORM data migrations). |
| `com.pear.controllers.app` | Admin entry points. `DashboardApp` hosts the manual-mode prewarm hooks; `PearApp.computeInstacartBatch` hosts the admin-only `prewarmAllLists()` endpoint. |
| `com.pear.spring.stats` | Metric name constants. `Metrics.Availabilities.Batch` declares the `pear.availabilities.batch.prewarm.*` counter names used by the instrumentation. |

## Per-list cost lever

Per-list processing cost is roughly proportional to `count(instacartIds on this list) × count(top-20 zones for this retailer)`. The `instacartId` count comes from `InstacartIdRetailer_to_InstacartBatchInventoryList` rows; if some of those IDs don't resolve to a known `UPCRetailerData` row, the work runs but produces no output. Cleanup of unresolvable IDs is a per-list-cost-reduction lever when worker-count tuning runs out of room. Look at `InstacartBatchInventoryList.getUPCIds()` for the resolution path.

## Anti-patterns

- **Trusting `Steady-state Age` as a health signal.** It measures ratio, not throughput. Use Throughput Gap instead.
- **Comparing backlog counts across populations.** The recipe-flex population (~112k lists) is intentionally not processed; mixing it into any "expired list count" makes that count meaningless.
- **Changing multiple AppConfig knobs simultaneously.** Loses the causal signal. One knob at a time, 30-60min observation.
- **Treating `Num Expired` thresholds as a real alarm.** They were calibrated for a smaller population. Red is expected at certain operating points.
- **Tuning by short-window observation.** 5-minute counts have high tick-placement variance. Use 30-minute or 1-hour windows for decisions.
- **Assuming `prewarmAllLists()` (in `PearApp.computeInstacartBatch`) is a normal production path.** It loads every row in `InstacartBatchInventoryList`. It's an admin-only hook.

## References

- `skills/pear-engineering-workflow` for general repo conventions
- `skills/pear-orm` for SimpleORM patterns used by the entities involved
- `skills/pear-concurrency` for understanding the worker pools `InstacartPrewarmer` uses
- `skills/pear-prod-jsp` for running diagnostic JSPs against production
