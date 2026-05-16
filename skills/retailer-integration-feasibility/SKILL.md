---
name: retailer-integration-feasibility
description: Coordinate Pear retailer onboarding feasibility for store importers, UPC/item ID resolvers, and store-level availability scanners in api.pearcommerce.com. Use when given a retailer name or URL and asked to assess or build a retailer integration, create AvailabilityUpdater/recomputer support, create ItemIdInfoResolver/UPC resolution support, import Store.SStore data, or produce Java @Script feasibility probes that use Chrome discovery, JurlProxyFallback, and proxies without running in CI.
---

# Retailer Integration Feasibility

Use this skill as the coordinator for a new retailer integration. The goal is to leave the repo with Java code and `@Script` probes that prove which of the three onboarding surfaces work:

- store import: retailer store ids, addresses, coordinates, and `Store.SStore`-compatible data
- UPC resolution: UPC/name to retailer item id and PDP URL
- availability scanning: store id plus item id/UPC to stock status and price

## Focused Skills

Use the focused skills for the actual implementation loops:

- `$retailer-store-import-feasibility` for store locators and store importers
- `$retailer-upc-resolution-feasibility` for UPC/name search, PDP parsing, and `ItemIdInfoResolver`
- `$retailer-availability-scanning-feasibility` for `UPCRetailerZipAvailabilityRecomputer` and store-level inventory checks

If the user asks for all three, work in this order: stores, UPC resolution, availability. Availability usually needs a real store id and item id from the first two passes.

## Default Artifacts

Prefer feasibility artifacts under:

```text
test/com/pear/retailerFeasibility/<country>/<retailer>/<Retailer>Plan.java
test/com/pear/retailerFeasibility/<country>/<retailer>/<Retailer>PlanTest.java
```

This follows the repo's feasibility naming pattern. `*Plan.java` is the reusable scratch implementation: static route probes, parsers, DTOs, normalization helpers, proxy lists, artifact writers, and code that may later graduate into production classes. `*PlanTest.java` is the JUnit `@Script` harness: sample inputs, assertions, logging, `@Disabled` failure notes, and PR/reference comparisons. Use both when the work has more than a tiny one-off assertion or when code may be reused by store, UPC, and availability probes. For a very small throwaway check, a single `*PlanTest.java` can be acceptable, but do not put production-style helper logic directly into the script harness when it will grow.

Before creating a new feasibility file, search for an existing retailer `*Plan.java` / `*PlanTest.java` pair and update it when present. Focused skills must compose with this same pair: if stores already created `DartyPlanTest.java`, the UPC and availability skills should add their `@Script` methods to that existing class instead of creating parallel files. The result should be runnable from either the orchestrator skill or any individual focused skill without losing prior probes or comments.

When the user asks for production wiring, graduate the proven code into the existing owner area, usually `src/com/pear/itemurlupdater`, `src/com/pear/upcresolution`, `src/com/pear/jobs/retailer`, or a retailer-specific package already used by similar code.

When creating the PR for a retailer feasibility pass, use a simple title:

```text
[codex] <retailer> feasibility
```

Keep the title focused on the retailer and feasibility outcome even when the branch includes production wiring for the proven route.

When a PR is created for a solvable retailer from the feasibility spreadsheet, update the spreadsheet row promptly. Mark Alex as owner, set difficulty to `Easy` when all three surfaces are production-ready, fill the columns you understand, link the PR, and add concise notes on routes, store count, proxy requirements, and caveats. Use Chrome to edit the sheet when the Google Sheets connector cannot write, and do this for every PR before moving on to the next retailer.

Every combined `@Script` probe class should start with a compact comment like:

```java
/*
 * FEASIBILITY SUMMARY
 * Stores: PASS via store-locator JSON; STATIC works; 312 stores; sample storeId=123.
 * UPC resolution: PASS via name search + PDP embedded GTIN; UNBLOCKER required; sample UPC=...
 * Availability: FAILING; API 403s on STATIC/UNBLOCKER/ZENROWS; disabled test documents last curl and headers.
 */
```

## Operating Loop

1. Load Pear context before editing Java: use `$pear-engineering-workflow` and `$pear-proxy`, then search with `rg` for existing retailer/platform patterns.
2. Explore the retailer in local Chrome. Use DevTools Network, Sources, rendered DOM, cookies/local storage, request payloads, and copied cURL as evidence. Do not treat browser success as proof until Java can replay it. When a needed header, cookie, token, version string, parameter, or body value appears in DevTools, trace where it comes from and reproduce that source in Java when practical. If the value is public and long-lived, such as a stable app id, version, API key, or functionally permanent token, it is acceptable to capture it with a comment explaining why it is safe to reuse.
3. Translate the best route into a small Java method that uses `LoggedJurl` plus `JurlProxyFallback`.
4. Try the proxy ladder in Java: static/datacenter first, then `UNBLOCKER`, then ZenRows scrape/render, then Scrapfly render/ASP render when the page needs JavaScript or bot handling. If `STATIC` works but flakes intermittently, retry `STATIC` up to about 10 times and count that as one cheap proxy option before falling through to the next known-good proxy.
5. Run the focused `@Script` probe. If it fails, return to Chrome and find another route: different endpoint, document HTML, embedded app data, rendered page, cart API, or city/state traversal.
6. Repeat until the surface passes or the failing route is clearly documented and disabled.

## Creative Recovery

Get creative when the obvious browser route, copied API, or first proxy ladder fails. Try alternate store modes, full documents instead of APIs, embedded app state, sitemap/search-index data, mobile or app-adjacent endpoints, cart/PDP side doors, platform-sibling banners, checked-in PR artifacts, and rendered DOM traversal before declaring a surface infeasible.

When a creative tactic works, or fails in a reusable way, update the focused skill's `SKILL.md` or `references/repo-tactics.md` in the canonical skills repo before finishing. Keep the note short, name the route/platform/proxy signal, validate the skill, and sync it into the local skill target.

## Test Rules

- Mark every generated feasibility check with `@Script` so it stays out of CI unless intentionally run. Do this even when the class name ends in `Test` and even when the check uses a fixture or PR artifact.
- Keep failing probes in the test file, but disable them with `@Disabled("FEASIBILITY FAILING: ...")` and a comment naming the last observed response, proxy list, and next route to try.
- Prefer deterministic parser checks with fixtures when graduating code to production, but keep them as `@Script` while they live in retailer feasibility packages.
- Assertions must prove real behavior: non-empty stores, stable store ids, target UPC match, expected item id/URL, non-`UNKNOWN` availability when the sample is known, and price when the retailer exposes it.
- Do not mark a surface successful because it worked only in Chrome or only from the local IP without a proxy path that can run off-box.

## Completion

Finish by reporting:

- which surfaces pass, fail, or are disabled
- the required proxy types and whether static works
- sample inputs used: retailer URL, store id, UPC/name, item id/PDP
- Java files and `@Script` probes created or updated
- the exact focused Gradle/JUnit `@Script` checks run, or why they could not run
