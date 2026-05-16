---
name: retailer-upc-resolution-feasibility
description: Discover, implement, and verify Pear UPC-to-retailer-item-ID resolution feasibility in api.pearcommerce.com. Use when asked to resolve UPCs or product names to retailer item IDs, PDP URLs, SRetailerItemData candidates, ItemIdInfoResolver classes, or Java @Script feasibility probes that search retailer sites and validate UPC evidence through JurlProxyFallback and proxies without running in CI.
---

# Retailer UPC Resolution Feasibility

Use this skill to prove that Pear can take a UPC and product name, find the retailer's item id and PDP URL, and verify the result belongs to the target UPC.

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

Explore in local Chrome before coding:

1. Search the retailer site by UPC.
2. If UPC search fails, search by product name, brand, and distinctive size words.
3. Open likely PDPs and find UPC/GTIN evidence in visible text, `application/ld+json`, `__NEXT_DATA__`, `__NUXT__`, product detail JSON, script variables, data attributes, or PDP API responses.
4. Inspect search and PDP Network requests for stable item ids, product ids, SKUs, canonical URLs, and UPC fields.
5. If on-site search is poor, try a deterministic PDP URL pattern or a Google `site:` search only after checking retailer-owned routes.

Never accept a name-only match as resolved. The Java test must confirm the target UPC with `UPC.isAUPCMatch(...)` or equivalent UPC normalization, or clearly mark the route incomplete.

## Java Probe Shape

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

For resolver search text, prefer existing helpers like `buildLikelyNameOrBrandSearchTerm(item)`.

## Jurl Pattern

Use `JurlProxyFallback` for live HTTP and preserve browser headers only when they matter:

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
    .useJurlCache(true, TimeUnit.DAYS.toMillis(30))
    .goThen(jurl -> parseCandidates(jurl.getDocument()))
    .get();
```

Keep only response validation and parsing inside `goThen`. Do matching, candidate ranking, and fallback search-term loops outside it unless the parsing result itself determines retry/failure.

## Proxy Ladder

Try and document the first working option:

- static/datacenter first
- `UNBLOCKER`, `UNBLOCKER_GEO`, or `UNBLOCKER_STATE`
- ZenRows scrape/render, using render when product/search data is client-side
- Scrapfly render/ASP render for heavier bot protection or pages that require JavaScript

If an API returns 403/429/blocked through the ladder, try the PDP document route, embedded app JSON, search HTML, or a different query path.

## Script Probes

Add focused JUnit methods annotated with both `@Test` and `@Script`; these are feasibility probes that should not run in CI by default. Prove the route:

- search by name returns candidates with item ids and URLs
- PDP/detail fetch exposes UPC evidence
- direct UPC route works when available
- end-to-end resolver returns the expected `itemId` for the sample UPC/name

When using the production resolver, prefer `UPCResolutionUtilities.testMultiRunUPCResolution(...)` for an end-to-end check, as in `AlsBodegaTest`.

Assertions should include the expected item id when known and always verify the returned UPC against the target UPC when the site exposes UPC data.

If the route is not feasible yet, keep the code and disable the failing probe:

```java
@Disabled("FEASIBILITY FAILING: PDP exposes item id but no UPC evidence after STATIC/UNBLOCKER/ZENROWS")
```

Add a comment naming the sample UPC/name, attempted URLs/endpoints, proxy list, failure response, and next route to try.
