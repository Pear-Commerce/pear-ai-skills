---
name: retailer-store-import-feasibility
description: Discover, implement, and verify Pear retailer store import feasibility in api.pearcommerce.com. Use when asked to scrape a retailer store locator, find store IDs, create a store importer, produce Store.SStore-compatible data, save retailer store JSON, or build Java @Script probes that prove store loading works through JurlProxyFallback and production-like proxies without running in CI.
---

# Retailer Store Import Feasibility

Use this skill to prove that Pear can load a retailer's stores with stable store ids and location data.

## Repo Anchors

Check these first:

- `src/com/pear/entities/inventory/Store.java` for `Store.SStore`
- `test/com/pear/retailerFeasibility/**` for prior `Plan` and `StoreUpdater` examples
- `WebContent/META-INF/<retailer>/current.json` when a PR or previous extraction already contains expected `Store.SStore` output
- `WebContent/META-INF/<retailer>/EXTRACTION.md` when a previous extraction documented the source route, completeness strategy, or Java rerun shape
- `test/com/pear/retailerFeasibility/us/tops/TopsStoreUpdater.java` for HTML traversal
- `test/com/pear/retailerFeasibility/us/dollargeneral/DollarGeneralPlan.java` for proxy-backed rendered scraping

## Repo Tactics

Read `references/repo-tactics.md` when deciding how to productionize a store import, choose `getAllStores` vs `getStoresForZip`, set cache TTLs, or diagnose stale/missing store ids. It summarizes patterns and gotchas mined from current API store import code.

Read `references/store-extraction-patterns.md` when choosing a full-estate store extraction pattern, preserving Java rerun notes, or adding a new site family.

## Discovery Order

If `WebContent/META-INF/<retailer>/EXTRACTION.md` already exists, read it before fresh discovery and treat it as the preferred rerun plan unless the live site proves it stale. Then explore in local Chrome before coding:

1. Open the retailer's store locator and complete normal user flows: search by zip, use location, select state/province/city, click load-more/next, and switch pickup/delivery/planning modes.
2. Inspect Network for JSON, GraphQL, Algolia/search-index, locator, or store-detail APIs.
3. Inspect page sources for `__NEXT_DATA__`, `__NUXT__`, `application/ld+json`, inline product/store JSON, module payloads, and `data-store-id`/coordinate attributes.
4. If no endpoint exists, inspect HTML state/city/store pages and rendered DOM selectors.
5. Prove completeness: paging, all states/provinces, city buckets, hidden lazy results, and duplicate store ids.

Prefer stable sources in this order: public store API, app bootstrap JSON, search index, rendered HTML with embedded store data, city/state traversal, then click-driven rendered scraping.

## Java Probe Shape

For feasibility, create or update:

```text
test/com/pear/retailerFeasibility/<country>/<retailer>/<Retailer>Plan.java
test/com/pear/retailerFeasibility/<country>/<retailer>/<Retailer>PlanTest.java
```

Use `*Plan.java` for the reusable store-loading implementation: HTTP/browser-assisted extraction helpers, parsers, DTOs, normalization, dedupe, JSON artifact writing, and comparison helpers. Use `*PlanTest.java` for the JUnit `@Script` entrypoints, assertions, sample stores, logging, `@Disabled` failure comments, and PR/reference comparisons. A single `*PlanTest.java` is fine for a tiny one-off, but prefer the split once helper code is non-trivial or may be reused by UPC/availability work.

When the user scopes a feasibility pass to only `<Retailer>Plan.java` and `<Retailer>PlanTest.java`, treat that as a hard file-boundary instruction. Keep helper DTOs, parser code, extracted JSON constants, known-dead URL notes, and `@Script` validation nested in those two files. Do not create production classes, `WebContent` artifacts, or extra docs in that mode; the code can be pulled out later during full implementation.

When this skill runs by itself, first search for an existing retailer `*Plan.java` / `*PlanTest.java` pair. If it exists, update that pair with the store loader and store `@Script` methods instead of creating a separate store-only test class. If it does not exist, create the pair using the standard names so later UPC and availability skills can append their probes to the same files.

Expose a method such as:

```java
static List<Store.SStore> loadStores()
```

or use `List<Store>` when the code is already close to a production `StoreUpdater`.

## Store JSON Artifacts

When a store import probe successfully produces a normalized `List<Store.SStore>`, also write the stores to JSON artifacts under, unless the user explicitly limited the task to the two plan files:

```text
WebContent/META-INF/<retailer>/<yyyy-MM-dd>.json
WebContent/META-INF/<retailer>/current.json
```

Use the same plain array shape as existing `Store.SStore` files, with no wrapper metadata. Prefer a retailer folder even if older artifacts use flat filenames, preserve the existing retailer folder/style when one already exists, and keep the normalized fields as generated by the probe. Populate only known fields; do not invent ids, coordinates, or phones. Save the final list only after dedupe and field normalization. Do this even for feasibility-only work so the repo keeps the discovered store list, then have the `@Script` probe load `current.json` when useful to verify the live route still matches the saved artifact.

Every full extraction should also create or update:

```text
WebContent/META-INF/<retailer>/EXTRACTION.md
```

Make this a compact rerun guide for that exact site. Include the retailer name, source URLs, pattern family, why the pattern was chosen, completeness strategy, fields mapped into `Store.SStore`, known caveats, output paths, and what changed from any previous note. Add a `Java Implementation` section with a compact method or code skeleton showing the request/page URL constants, parser entrypoint, dedupe key, `Store.SStore` mapping, and JSON write target. If the discovery used browser-only extraction, still preserve the Java that would replay the discovered endpoint or parse the saved HTML shape.

Use `JurlProxyFallback` for live HTTP:

```java
return new JurlProxyFallback(
    List.of(Type.STATIC, Type.SMARTPROXY_STATIC, Type.SOAX_STATIC, Type.NETNUT_STATIC, Type.DATAIMPULSE_STATIC, Type.UNBLOCKER),
    () -> new LoggedJurl()
        .url(url)
        .method("GET")
        .asChrome()
        .timeout(60_000)
        .throwOnNon200(false)
)
    .attempts(5)
    .extraCacheKey("retailer-store-static-v1")
    .useJurlCache(true, TimeUnit.DAYS.toMillis(30))
    .goThen(jurl -> parseStores(jurl.getDocument()))
    .get();
```

For rendered pages, add the render-capable proxy types and a `waitFor` selector when useful:

```java
.setProxyAttribute("waitFor", "div.store-card")
```

Inside `goThen`, non-null return means success; `null` return and throw both mean failed attempt. Keep response validation and parsing that decide whether a page is usable/cacheable inside `goThen`; normalize, dedupe, geocode, and save outside it when possible so logic errors do not burn every proxy attempt.

Use `useJurlCache(...)` for store sitemaps, directory pages, and store detail documents once the route is known to work; store pages rarely need to be refetched on every script run. When changing only proxy type, headers, render settings, or another transport detail during testing, bump `extraCacheKey(...)` so an older cached success does not hide the new experiment. After identifying the working proxy list, keep a stable extra cache key for that list so repeated suite runs reuse the proven responses.

For one-off store imports that fetch many independent store detail pages, run pages in parallel by default, usually 5-10 at a time. Use a bounded Pear pool and `Parallel.getAll(..., timeout, true)` so slow or blocked pages do not hang the entire script. Keep the concurrency modest enough to avoid hammering the retailer and rely on Jurl cache to make reruns cheap.

If `STATIC` is the correct store route but has intermittent transient failures, it is acceptable to try `STATIC` up to about 10 times and count that as one cheap production-ready proxy option before falling through to a small known-good fallback. Keep exhaustive proxy sweeps planning-only; the final store script should use the proven list plus cache rather than rediscovering every proxy on each run.

For Azure/APIM-style APIs, public long-lived subscription keys sometimes work either as the `Ocp-Apim-Subscription-Key` header or as a `subscription-key` query parameter. If a route works in Chrome/curl but proxied Java returns an APIM "missing subscription key" response, try sending the traced key both ways, comment where it came from, and bump the cache key before declaring the proxy blocked.

For IBM/WCS storefronts, the visible store-locator page may be blocked by Incapsula/Distil while underlying AJAX views still work. Inspect rendered HTML and JS assets for `wc.service.declare(...)`, `StoreLocator`, `AjaxStoreLocatorSearch`, `EStoreStoreLocatorResultsView`, and similar route names. Try those endpoints directly with the same `storeId`, `catalogId`, and `langId` constants from the page, then add the postcode/city parameters seen in JavaScript such as `storeAddressSearch_zipCode` or `storeAddressSearch_city`. If the AJAX endpoint returns JSON wrapped in a JavaScript comment, strip `/* ... */`, parse the `searchResults` string, and use a production proxy list proven on that endpoint. Do not discard the route just because the human HTML document is blocked.

For Spartacus/SAP Commerce Cloud (OCC) storefronts, look for `/rest/v2/<baseSite>/stores` with `returnAllStores=true` and fields such as `stores(name,displayName,geoPoint,address,features)`. Treat `PointOfService.name` as the candidate `Store.SStore.storeId` and verify it against the availability or cart route before preferring hidden bootstrap values like `warehouseCode`. Some OCC cart APIs accept the display/store name as `deliveryPointOfService.name` and reject the warehouse code, so a prettier or more numeric id is not automatically better.

## Proxy Ladder

Try and document the first working option:

- static/datacenter: `STATIC`, `SMARTPROXY_STATIC`, `SOAX_STATIC`, `NETNUT_STATIC`, `DATAIMPULSE_STATIC`, `RAYOBYTE_STATIC_DC`, `PROXYEMPIRE_STATIC`
- BrightData: `UNBLOCKER`, `UNBLOCKER_GEO`, `UNBLOCKER_STATE`
- ZenRows: `ZENROWS_DATACENTER_SCRAPE`, `ZENROWS_RESIDENTIAL_SCRAPE`, then render variants
- Scrapfly: `SCRAPEFLY_DATACENTER_RENDER_GEO`, `SCRAPEFLY_RESIDENTAL_RENDER_GEO`, or ASP render variants for heavier bot protection

If an API works in Chrome but fails from Java through this ladder, try the full document/rendered page or a state/city HTML route before giving up.

## Creative Recovery

Get creative when the locator API is partial, blocked, or missing stable ids. Try state/province and city directory pages, map marker payloads, embedded app bootstrap JSON, `application/ld+json`, sitemap/store-detail URLs, search-index dumps, platform-sibling banners, previous `WebContent/META-INF/<retailer>` artifacts, or rendered DOM traversal with a `waitFor` selector.

Do not stop after the first visible page of stores. Check hidden pagination, lazy-loaded lists, state/province partitions, city partitions, delivery/pickup/planning buckets, store-switch side effects that expose extra API calls, and duplicate stores returned under multiple modes. If the page shows a total count, reconcile the normalized output with that total.

Leadformance-style store locators may expose full country or region directories as paginated HTML with one `LocalBusiness` `application/ld+json` block per store. Crawl the directory pages, follow `rel=next` or stable `?page=N` pagination until no stores remain, and sanitize raw control characters such as literal carriage returns before parsing JSON-LD. This can be more durable than a blocked locator API, and the resulting normalized `Store.SStore` list should still be written to both `current.json` and a dated JSON artifact.

For store imports, a valid feasibility path is a one-off JavaScript snippet run in a local browser session when bot detection blocks Java/proxy HTTP but the site loads normally in Chrome. Use the snippet to read retailer-owned page state, embedded JSON, map markers, fetch/XHR responses already present in the page, or rendered DOM store cards, then normalize the result into `Store.SStore` JSON artifacts under `WebContent/META-INF/<retailer>/`. Keep the snippet in the plan/test comment or nearby notes, document that it is a browser-assisted one-off extraction, and still include an `@Script` probe that validates the saved artifact shape, dedupe, required fields, and comparison target. Do not use this browser one-off tactic as proof for real-time UPC resolution or availability scanning.

When a browser one-off uses server-rendered app state, inspect late hydration scripts as well as obvious globals. React/URQL sites may serialize useful data in strings such as `globalThis.__URQL_DATA__`, where each entry's `data` field is itself JSON. Parse that payload, dedupe on the fulfillment id that availability will need, and preserve the Chrome snippet/rerun route in the plan. This is especially useful when render proxies return HTTP 200 but only hydrate to a generic app shell.

Validate every proxy-rendered HTTP 200 before caching it as a store success. Bot products such as Cloudflare/Forter may return pages titled `Checking Connection`, `Just a moment`, JavaScript-disabled shells, or generic app shells that do not contain the expected store JSON even though the status is 200. Treat those as failed proxy attempts by returning `null` or throwing inside `goThen`, include expected-content checks there, and bump the `extraCacheKey` after adding a new challenge/body validator so old cached shells do not mask the fix.

If Java/proxy store detail fetching gets bogged down and the user permits a one-off browser extraction, it is acceptable to skip the Java live fetch for the store importer and commit the browser-rerunnable snippet plus the extracted store list with the plan. This is store-import-only guidance because stores are effectively one-off reference data; do not apply it to real-time UPC resolution or availability scanning. The snippet should be durable enough that someone can rerun it a year later: include the start URL, extraction date, endpoint/source shape, normalization rules, concurrency limit, known dead links, and what console output to copy. If the user specifically scopes the change to only `<Retailer>Plan.java` and `<Retailer>PlanTest.java`, keep all helper DTOs, constants, extracted JSON, dead-link notes, and validation nested inside those two files rather than creating production classes or `WebContent` artifacts. Because large JSON text blocks can exceed Java's constant-pool string limit, split embedded JSON into multiple chunks and join at runtime. The `@Script` should validate the embedded list count, duplicate store ids, required address/zip/coordinate fields, known sample stores, and documented dead/redirecting sitemap URLs. Keep the browser snippet bounded at 5-10 concurrent detail fetches.

When a new tactic is useful, add it to this skill or `references/repo-tactics.md` before wrapping up. Capture the source shape, required headers/proxies, id choice, normalization gotcha, and how the `@Script` probe proves completeness.

When the tactic is a reusable extraction family, add a concise entry to `references/store-extraction-patterns.md` with the signal, extraction method, completeness trap, best repo reference, and Java shape to preserve.

## Normalization

Populate fields only when known:

- `storeId`
- `name`
- `address`
- `geoAddress`
- `latitude`
- `longitude`
- `phone`
- `zip`
- `category`
- `countryCode`

Use the retailer's stable store number/id over transient UUIDs unless the UUID is clearly the only id accepted by availability APIs. Deduplicate by the id that availability scanning will use. If the site has multiple locator surfaces, such as a marketing/Yext locator plus an ecommerce fulfillment locator, prefer the id accepted by the availability route even when the prettier locator has a slightly different count. Document the mismatch and sample ids in the `@Script` summary.

If a locator or checked-in store artifact has only a marketing id, phone-derived id, or display address, do not guess the fulfillment code from phone suffixes or list order. Try selecting that store in the PDP/store-switch UI, then inspect visible pickup copy, selected-store headers, hydration payloads, or inventory calls for strings like `In Stock at <code> - <name>`, `storeCode`, `locationCode`, or `deliveryPointOfService`. If only a sample fulfillment code is found, keep the store artifact intact, document the mismatch, and mark full store-id productionization as incomplete unless the availability route can still derive codes at runtime.

## Script Probes

Add JUnit methods annotated with both `@Test` and `@Script`; these are feasibility probes that should not run in CI by default. Assert:

- `loadStores()` is non-empty
- every sampled store has `storeId` and address
- coordinates exist when the site exposes them
- no duplicate store ids exist after normalization
- a known sample store from Chrome appears
- count matches the site total when the site exposes a total

When the task is to reproduce a prior PR, load the checked-in `WebContent/META-INF/<retailer>/current.json` with `JSON.get().parseList(..., Store.SStore.class)` and compare the live normalized output field-by-field after sorting by `storeId`. Do not rely only on `Store.SStore.equals`; compare `storeId`, `name`, `address`, `geoAddress`, coordinates, `phone`, `category`, `countryCode`, and formatted zip so normalization drift is obvious.

If a route fails, keep the method and probe but disable it:

```java
@Disabled("FEASIBILITY FAILING: store API 403s through STATIC, UNBLOCKER, and ZENROWS_RENDER")
```

Include a nearby comment with the last tried URL, headers/payload shape, proxy list, response code/body signal, and the next route to investigate.
