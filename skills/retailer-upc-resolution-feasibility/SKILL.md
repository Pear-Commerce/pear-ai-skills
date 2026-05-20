---
name: retailer-upc-resolution-feasibility
description: Discover, implement, and verify Pear UPC-to-retailer-item-ID resolution feasibility in api.pearcommerce.com. Use when asked to resolve UPCs or product names to retailer item IDs, PDP URLs, SRetailerItemData candidates, ItemIdInfoResolver classes, or Java @Script feasibility probes that search retailer sites and validate UPC evidence through JurlProxyFallback and proxies without running in CI.
---

# Retailer UPC Resolution Feasibility

Use this skill to prove that Pear can take a UPC and product name, find the retailer's item id and PDP URL, and verify the result belongs to the target UPC.

When the user asks to create/update a production `ItemIdInfoResolver`, production `RetailPartner` setup migration, or graduate a proven UPC/item-id feasibility route into production, use `$retailer-production-integration`.

For "create a resolver for retailer Y" requests with no proven plan, use this skill first to prove the UPC/item-id route, then immediately use `$retailer-production-integration` to build the production resolver/migration/tests. The final PR should contain production code, not both production code and leftover `test/com/pear/retailerFeasibility/**` plan files, unless the user explicitly asks to preserve a research artifact.

## Production-Runnable Requirement

The route is feasible only when the Java code can replay it from Pear production-like boxes using `JurlProxyFallback`, the proxy ladder, and retailer-owned live endpoints or documents. Local Chrome, local curl, local app, or `Type.NO_PROXY` success from a developer laptop is discovery evidence, not proof, because the local IP is not Pear datacenter/proxy egress. Search-engine snippets, cached pages, indexed PDP text, copied DevTools payloads, hardcoded fixtures, screenshots, or demo snapshots may help diagnose a route, but they must not make a passing resolver `@Script`.

A passing UPC resolution probe must always use a proxy-backed `JurlProxyFallback.Type`; do not include `Type.NO_PROXY` in final passing feasibility scripts, resolver code, or proxy ladders unless the user explicitly asks for local-only discovery. If a route appears to work directly from the local machine, immediately replay the same retailer-owned endpoint through production-like proxy types such as `STATIC`, ISP/residential pools, provider static pools, Unblocker, ZenRows, or Scrapfly before marking it feasible. If no proxy type can replay the route, keep the code disabled and document the direct-local discovery separately.

A passing UPC resolution probe must fetch the item id and UPC evidence live from the retailer or an approved retailer-owned API at script runtime. If all live routes are blocked or incomplete, keep the code, disable the probe, and document the blocker instead of substituting canned product data. Before giving up, iterate through alternative retailer-owned routes: search APIs, PDP documents, embedded app JSON, the XHR/fetch/script API calls that hydrate the PDP itself, mobile/app-adjacent APIs, sitemap-discovered PDPs, canonical URL patterns, category/search hydration calls, and rendered document routes across the proxy ladder.

When a spreadsheet-queue retailer has production-runnable stores and availability but UPC resolution is the only blocker, do not block the feasibility PR solely for the missing UPC route. Leave the UPC `@Script` disabled with the live routes and proxy results documented, and make sure the sheet marks UPC resolution/access as `Hard` and overall/difficulty as `Hard`.

During planning/discovery, before declaring a live route blocked, enumerate the currently available `JurlProxyFallback.Type` values from `src/com/pear/http/JurlProxyFallback.java` and run a bounded one-off probe across every relevant non-local, non-deprecated proxy type. Include static, ISP/residential, geo variants, BrightData unblockers, ZenRows scrape/render, Scrapfly scrape/render/ASP, and provider-specific static pools. Skip `NO_PROXY`, explicitly local types, deprecated/invalid types, retailer-specific types for another retailer, or types documented as requiring a browser profile incompatible with Java. Record the tested type list and the response signal in the disabled probe/comment.

Do not put exhaustive proxy sweeps in the final real-time UPC resolution `@Script` or production resolver path. Once discovery identifies the proxy type(s) that work, the runnable script should use a small ordered list of those known-good types, with a modest retry count and cache strategy appropriate for production. If `STATIC` is the right path but has intermittent transient failures, it is acceptable to try `STATIC` up to about 10 times and count that as one cheap production-ready proxy option before falling through to the next known-good proxy. If a script repeatedly reaches a late proxy before succeeding, treat the earlier failures as pruning evidence and move/remove those proxies unless logs show they sometimes return valid UPC/item-id evidence. If no proxy works, disable the live probe with the exhaustive planning results instead of making every test run burn through all proxies again.

If no `STATIC` or cheap static/provider-static route works, always check Android app calls before declaring resolution impossible or settling for expensive/heavy proxy routes such as `UNBLOCKER`, Scrapfly ASP, or ZenRows render. Inspect APK/XAPK strings and app traffic for barcode search, APIM/gateway hosts, product/search endpoints, GraphQL operations, public app headers, and stable parameter names, then replay any candidate retailer-owned request through a proxy-backed Java route.

## Repo Anchors

Check these first:

- `src/com/pear/upcresolution/ItemIdInfoResolver.java`
- `src/com/pear/upcresolution/ItemIdInfoSingleResolver.java`
- `src/com/pear/upcresolution/SRetailerItemData.java`
- `test/com/pear/upcresolution/**`
- `test/com/pear/retailerFeasibility/**` for existing `searchProductsByName`, `fetchProductDetails`, and `fetchProductByUpc` patterns
- `src/com/pear/onboarding/alexwyler/AlsBodegaItemIdResolver.java` and `test/com/pear/onboarding/alexwyler/AlsBodegaTest.java` for a small resolver example

## Repo Tactics

Read `references/repo-tactics.md` when choosing direct resolution vs candidate generation, integrating with graph search, validating UPC evidence, or tuning caches and proxies. It summarizes patterns and gotchas mined from current resolver and graph-search code.

## Discovery Order

Explore in local Chrome before coding, but treat local browser and direct local HTTP success as route discovery only:

1. Search the retailer site by UPC.
2. If UPC search fails, search by product name, brand, and distinctive size words.
3. Open likely PDPs and find UPC/GTIN evidence in visible text, `application/ld+json`, `__NEXT_DATA__`, `__NUXT__`, product detail JSON, script variables, data attributes, or PDP API responses.
4. If Chrome shows UPC/GTIN on a PDP but Java cannot replay the PDP document, trace where that PDP value came from before giving up: inspect Network XHR/fetch, script bundles, hydration JSON, API base URLs, product-id parameters, and delayed calls that populate product specs or structured data. Recreate the underlying retailer-owned PDP loader/API in Java when it is stable and production-runnable.
5. Inspect product image/media URLs and alternate PDP images when structured routes lack UPC fields. A retailer-owned image can show the physical barcode and reveal that the sample UPC is wrong or that an exact UPC search route exists. Use this as discovery evidence to correct the sample and then prove the runtime route through live retailer-owned search/API responses; do not make a passing script depend on manual visual inspection.
6. Inspect search and PDP Network requests for stable item ids, product ids, SKUs, canonical URLs, and UPC fields.
7. If on-site search is poor, use search-engine `site:` discovery only to find candidate retailer URLs. The resolver still must fetch a retailer-owned live page/API and verify UPC evidence there.

Never accept a name-only match as resolved. The Java test must confirm the target UPC with `UPC.isAUPCMatch(...)` or equivalent UPC normalization, or clearly mark the route incomplete.

## Java Probe Shape

Follow the repo's feasibility naming pattern when creating files:

```text
test/com/pear/retailerFeasibility/<country>/<retailer>/<Retailer>Plan.java
test/com/pear/retailerFeasibility/<country>/<retailer>/<Retailer>PlanTest.java
```

Use `*Plan.java` for reusable resolver exploration code: search/detail request methods, parsers, DTOs, UPC matching helpers, proxy lists, and candidate ranking that may later move into an `ItemIdInfoResolver`. Use `*PlanTest.java` for the JUnit `@Script` entrypoints, sample UPC/name inputs, assertions, logging, `@Disabled` failure comments, and comparison notes. A single `*PlanTest.java` is acceptable for a tiny one-off, but prefer the split when helper logic is non-trivial or shared with availability.

When this skill runs by itself, first search for an existing retailer `*Plan.java` / `*PlanTest.java` pair. If stores or another surface already created it, update that same pair with UPC resolver helpers and UPC `@Script` methods while preserving existing probes and comments. If it does not exist, create the pair using the standard names so the orchestrator or availability skill can append to it later.

When the user scopes a feasibility pass to only `<Retailer>Plan.java` and `<Retailer>PlanTest.java`, treat that as a hard file-boundary instruction. Keep helper DTOs, parsers, proxy experiments, route notes, captured long-lived public config, and disabled/passing `@Script` probes nested in those two files. Do not create production resolver classes or registration/wiring in that mode; the proven code can be pulled out later. This file-boundary allowance does not relax the production-runnable requirement: a passing UPC resolution probe still must fetch live retailer-owned UPC evidence at runtime, not rely on embedded/demo data.

For feasibility, create methods such as:

```java
static List<SRetailerItemData> searchProductsByName(String searchTerm)
static SRetailerItemData fetchProductDetails(SRetailerItemData item)
static SRetailerItemData fetchProductByUpc(String upc)
```

When graduating to production, create a resolver that extends `ItemIdInfoSingleResolver` and implements:

```java
@Override
public String retailerEnum()

@Override
public List<SRetailerItemData> _getItemIdInfoCandidates(
    RetailPartner retailer,
    UPC item,
    Goal goal,
    String zip
)
```

Populate `SRetailerItemData` fields when available:

- `retailerEnumSource`
- `itemId`
- `url`
- `upc`
- `name`
- `brand`
- `size`
- `price`
- `image` or `images`
- `description`
- `secondaryId` for SKU or variant id when useful

Always fill `SRetailerItemData.url` when the route returns a PDP link or when the PDP can be deterministically built from the parsed ids. Keep `itemId` compact. Do not set `SRetailerItemData.itemId` to a full `http://` or `https://` PDP URL just because the route found a link. Store the retailer's stable product id, SKU, slug, variant id, or path fragment in `itemId`; store the full PDP in `url`; and use `secondaryId` for the extra stable slug/SKU/catalog value needed to rebuild the URL. A URL-shaped `itemId` is a last-resort exception only when the retailer exposes no stable id or id-plus-secondary-id combination, and the disabled/passing probe must document that exception explicitly.

For resolver search text, prefer existing helpers like `buildLikelyNameOrBrandSearchTerm(item)`.

When graduating to an `ItemIdInfoResolver`, make the eventual `requiresName()` value match the proven route. If the route searches by name/brand, calls a helper that builds a name search term, or passes `item.name()`/a name hint into the client method to find candidates, `requiresName()` must be `true`. If the route is exact-UPC/barcode-only, do not keep a name parameter in the production client API just because the feasibility helper had one; use a UPC-only signature and add a no-name resolver test.

## Jurl Pattern

Use `JurlProxyFallback` for live HTTP and preserve browser headers only when they matter:

Default browser-discovered search, PDP, and product API routes to `new LoggedJurl().asChrome()` so Java sends a browser-like header profile. If a plain `LoggedJurl` gets blocked, times out, returns an app/challenge shell, or fails while Chrome succeeds, retry with `.asChrome()` before escalating to heavier proxies or marking the UPC route hard. Keep `.asChrome()` on the final resolver/script route when it is part of the proven production replay.

If `.asChrome()` still fails, or if v1 `.asChrome()` adds document-navigation headers that collide with copied API/XHR headers, try `LoggedJurl.withBrowserProfile(...)` with an explicit CORS/API header set. Browser profiles reproduce Chrome's TLS/HTTP2 fingerprint and can matter for UPC search, PDP hydration, and product detail APIs even when all visible headers look right. Prefer `ChromeShim.getMostRecentChromeRelease().getBrowserProfile()` on production-like boxes. If local feasibility scripts have no `BrowserProfileConfiguration` rows, use a documented long-lived captured/check-in Chrome profile fallback rather than skipping the tactic, and comment where it came from plus that production should use the latest DB-backed profile when present.

```java
return new JurlProxyFallback(
    List.of(Type.STATIC, Type.UNBLOCKER, Type.ZENROWS_DATACENTER_RENDER, Type.ZENROWS_RESIDENTIAL_RENDER),
    () -> new LoggedJurl()
        .url(searchUrl)
        .method(Jurl.GET)
        .asChrome()
        .timeout(60_000)
        .throwOnNon200(false)
)
    .attempts(5)
    .extraCacheKey("retailer-upc-static-v1")
    .useJurlCache(true, TimeUnit.DAYS.toMillis(30))
    .goThen(jurl -> parseCandidates(jurl.getDocument()))
    .get();
```

Inside `goThen`, non-null return means success; `null` return and throw both mean failed attempt. Keep response validation and parsing that decide whether search/PDP evidence is usable/cacheable inside `goThen`. Do matching, candidate ranking, and fallback search-term loops outside it unless the parsing result itself determines retry/failure.

Use `useJurlCache(...)` for search/PDP documents during script validation so known-good routes are not re-scraped on every suite run. If you are changing only proxy type, headers, render settings, or another transport detail to prove production viability, bump `extraCacheKey(...)` for that experiment; otherwise a cached response from the old route can make the new route look successful. Once a proxy list is proven, keep the stable extra cache key and do not include exhaustive proxy sweeps in the passing resolver path.

Validate proxy-rendered HTTP 200 bodies before treating a UPC route as live evidence. Cloudflare/Forter-style sites can return `Checking Connection`, `Just a moment`, JavaScript-disabled shells, or generic app shells without product/search data while still producing 200 responses through render proxies. The `goThen` validator should require item id plus UPC/GTIN evidence, reject known challenge/app-shell text by returning `null` or throwing, and use a bumped `extraCacheKey` whenever the body validator changes so stale cached shells cannot masquerade as a working route.

For retailer search or PDP APIs behind Azure/APIM, public long-lived subscription keys traced from browser bundles may need to be sent both as `Ocp-Apim-Subscription-Key` and as a `subscription-key` query parameter. If proxied Java sees a "missing subscription key" response while local Chrome/curl works, try the query-param form before abandoning that proxy route.

For IBM/WCS storefronts or other legacy ecommerce sites using Algolia autocomplete, a blocked PDP/search page may still expose a header or header-fragment endpoint with a public `algoliaConfig` object. Look for `appID`, `APIKey`, product index names, default filters, and `siteRoot` in rendered HTML, header fragments, and autocomplete bundles. If the Algolia hit contains UPC/GTIN plus a stable product object id and PDP action URL, it is a valid live UPC-resolution route; treat the public search key as long-lived config and comment where it came from. Still verify the target UPC from the live Algolia response, not from a cached PDP or search snippet.

For Spartacus/SAP Commerce Cloud (OCC) storefronts, do not assume the OCC prefix is `/rest/v2` or `/occ/v2`. Inspect app bundles, `cx-state`, and Spartacus config for `backend.occ.prefix`, `baseUrl`, and base site; some sites use `/api/v2/<baseSite>/products/search?query=...&fields=FULL` and `/api/v2/<baseSite>/products/{code}?fields=FULL`. UPC search may return no results even when the detail API exposes `upc`, so use name/brand search to collect item ids, then fetch product detail or the rendered PDP `cx-state` for each candidate and require live UPC/GTIN evidence before resolving. Cache search/detail GETs once the proxy list is proven, but keep the final resolver tied to retailer-owned OCC responses rather than browser-copied payloads.

## Proxy Ladder

Try and document the first working option, but do not stop at this short list if it fails:

- static/datacenter first
- `UNBLOCKER`, `UNBLOCKER_GEO`, or `UNBLOCKER_STATE`
- ZenRows scrape/render, using render when product/search data is client-side
- Scrapfly render/ASP render for heavier bot protection or pages that require JavaScript

Before accepting an expensive/heavy proxy as the only workable route, or before calling the route impossible, check Android app calls/APK strings for a mobile or APIM endpoint that can be replayed through `STATIC` or another cheap proxy-backed type.

If an API returns 403/429/blocked through the ladder, try the PDP document route, embedded app JSON, search HTML, or a different query path.

When the common ladder fails during discovery, expand to all currently available `JurlProxyFallback.Type` entries that can run on production Java. Prefer a planning-only helper that logs each type, response code, final URL, body-block signal, and whether the page contains the UPC/item-id evidence. Keep that helper separate from the passing real-time script path.

## Creative Recovery

Get creative if you have to: when UPC search, name search, or PDP parsing does not expose enough evidence, keep trying plausible retailer-owned routes before declaring resolution infeasible. If a local browser-rendered PDP exposes the UPC, assume there may be a data source that served it to the page and trace that source before marking resolution hard: XHR/fetch calls, hydration payloads, product-spec APIs, recommendation/product-detail APIs, GraphQL operations, script-bundle constants, tag-manager injected data, and lazy-loaded structured data are all fair game. Try brand/size query variants, canonical PDP URL patterns, embedded product JSON, structured data, search autocomplete APIs, category/search result hydration calls, sitemap or search-engine `site:` discovery for candidate URLs, product image/media barcode evidence, mobile/app-adjacent APIs, platform-sibling banners, app decompilation when appropriate, and cached retailer metadata before declaring resolution infeasible.

When a sample UPC was sourced externally and every retailer-owned data route says "no UPC," sanity-check the sample itself. Product photos, packaging images, variant swatches, and exact UPC search behavior can reveal that the external UPC belongs to a sibling pack size or is simply wrong. If a retailer-owned image shows a barcode, use it to pick the right sample UPC and then make the passing script prove resolution with a live exact-UPC search/API route; keep the image observation in comments as discovery provenance.

When the direct retailer domain is blocked or thin but the retailer is listed in checked-in platform metadata, treat the platform as a first-class data source before giving up. For Instacart-style storefronts, first fetch the live shop/session token from the retailer slug, postal code, and coordinates, then replay the platform search/product operation that hydrates the storefront. Instacart `SearchResultsPlacements` rows can expose `productId` plus `legacyId` UPC evidence; validate `legacyId` with `UPC.isAUPCMatch(...)`, keep any long-lived persisted-query hashes documented, and use the repo's existing Instacart session/proxy patterns instead of relying on the blocked direct site.

When app decompilation or APK string extraction reveals API base URLs, route fragments, DTO names, or parameter names, reconstruct the most likely retailer-owned requests and test them through Java/proxies. Treat those strings as a map, not proof: the passing resolver still needs a live response that contains item id plus UPC evidence, and any required app headers, tokens, cookies, or device identifiers must be reproducible from production boxes.

For mobile apps with barcode search, inspect the app listing and APK/XAPK static strings for scanner components, accepted barcode symbologies, feature flags, endpoint constants, and APIM/gateway hosts, and app barcode/APIM strings are a reusable tactic when they can be replayed through a proxy. If the app routes barcode scans into the same catalog/search service, replay an exact UPC as the app would send it, preserving stable app/web headers such as `channel`, `index`, `x-api-version`, `zoneid`, store/zone ids, and query parameter casing. Mobile/APIM search responses may expose UPC evidence under retailer-specific fields such as `mfPartNumber`, `mfPartNumber_ntk`, `mfPartNumberNtk`, `gtin`, or `upc` even when PDP HTML and public web search are blocked. Normalize those fields with `UPC.isAUPCMatch(...)` or an equivalent no-country/no-check-digit comparison, and still require item id plus live UPC evidence through a proxy-backed route.

When a new tactic is useful, or a creative route fails in a reusable way, update this skill or `references/repo-tactics.md` in the canonical skills repo before wrapping up, then sync/reinstall the skill. Capture how the route finds item ids, where UPC evidence lives, which proxy/header shape works, and how the `@Script` probe verifies the UPC match.

## Script Probes

Add focused JUnit methods annotated with both `@Test` and `@Script`; these are feasibility probes that should not run in CI by default. Prove the route:

- search by name returns candidates with item ids and URLs
- PDP/detail fetch exposes UPC evidence
- direct UPC route works when available
- end-to-end resolver returns the expected compact `itemId` and expected `url` for the sample UPC/name

If multiple live `@Script` probes in one class share proxy/cache state or retailer sessions with store and availability probes, annotate the class or methods with `@Execution(ExecutionMode.SAME_THREAD)` so JUnit parallelism does not make the feasibility suite flaky.

When using the production resolver, prefer `UPCResolutionUtilities.testMultiRunUPCResolution(...)` for an end-to-end check, as in `AlsBodegaTest`.

Assertions should include the expected item id when known and always verify the returned UPC against the target UPC when the site exposes UPC data.

Never make this probe pass by parsing hardcoded/indexed/cached PDP text. If the only available UPC evidence is from a search result, archive, fixture, or manually copied page, treat it as diagnostic evidence and leave the live probe disabled.

If the route is not feasible yet, keep the code and disable the failing probe:

```java
@Disabled("FEASIBILITY FAILING: PDP exposes item id but no UPC evidence after STATIC/UNBLOCKER/ZENROWS")
```

Add a comment naming the sample UPC/name, attempted URLs/endpoints, proxy list, failure response, and next route to try.
