---
name: retailer-integration-feasibility
description: Coordinate Pear retailer onboarding feasibility for store importers, UPC/item ID resolvers, and store-level availability scanners in api.pearcommerce.com. Use when given a retailer name or URL and asked to assess or build a retailer integration, create AvailabilityUpdater/recomputer support, create ItemIdInfoResolver/UPC resolution support, import Store.SStore data, or produce Java feasibility tests that use Chrome discovery, JurlProxyFallback, proxies, and local unit tests.
---

# Retailer Integration Feasibility

Use this skill as the coordinator for a new retailer integration. The goal is to leave the repo with Java code and tests that prove which of the three onboarding surfaces work:

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

When the user asks for production wiring, graduate the proven code into the existing owner area, usually `src/com/pear/itemurlupdater`, `src/com/pear/upcresolution`, `src/com/pear/jobs/retailer`, or a retailer-specific package already used by similar code.

Every combined test class should start with a compact comment like:

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
2. Explore the retailer in local Chrome. Use DevTools Network, Sources, rendered DOM, cookies/local storage, request payloads, and copied cURL as evidence. Do not treat browser success as proof until Java can replay it.
3. Translate the best route into a small Java method that uses `LoggedJurl` plus `JurlProxyFallback`.
4. Try the proxy ladder in Java: static/datacenter first, then `UNBLOCKER`, then ZenRows scrape/render, then Scrapfly render/ASP render when the page needs JavaScript or bot handling.
5. Run the focused test. If it fails, return to Chrome and find another route: different endpoint, document HTML, embedded app data, rendered page, cart API, or city/state traversal.
6. Repeat until the surface passes or the failing route is clearly documented and disabled.

## Test Rules

- Mark live external feasibility probes with `@Script` so they stay out of CI unless intentionally run.
- Keep failing probes in the test file, but disable them with `@Disabled("FEASIBILITY FAILING: ...")` and a comment naming the last observed response, proxy list, and next route to try.
- Prefer deterministic parser tests with fixtures when graduating code to production, but keep at least one live feasibility test while the retailer route is still being proven.
- Assertions must prove real behavior: non-empty stores, stable store ids, target UPC match, expected item id/URL, non-`UNKNOWN` availability when the sample is known, and price when the retailer exposes it.
- Do not mark a surface successful because it worked only in Chrome or only from the local IP without a proxy path that can run off-box.

## Completion

Finish by reporting:

- which surfaces pass, fail, or are disabled
- the required proxy types and whether static works
- sample inputs used: retailer URL, store id, UPC/name, item id/PDP
- Java files and tests created or updated
- the exact focused Gradle/JUnit checks run, or why they could not run
