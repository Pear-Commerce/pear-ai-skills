---
name: retailer-store-import-feasibility
description: Discover, implement, and verify Pear retailer store import feasibility in api.pearcommerce.com. Use when asked to scrape a retailer store locator, find store IDs, create a store importer, produce Store.SStore-compatible data, save retailer store JSON, or build Java tests that prove store loading works through JurlProxyFallback and production-like proxies.
---

# Retailer Store Import Feasibility

Use this skill to prove that Pear can load a retailer's stores with stable store ids and location data.

## Repo Anchors

Check these first:

- `src/com/pear/entities/inventory/Store.java` for `Store.SStore`
- `test/com/pear/retailerFeasibility/**` for prior `Plan` and `StoreUpdater` examples
- `test/com/pear/retailerFeasibility/us/tops/TopsStoreUpdater.java` for HTML traversal
- `test/com/pear/retailerFeasibility/us/dollargeneral/DollarGeneralPlan.java` for proxy-backed rendered scraping
- `$sstore-store-extractor` when the user wants a full JSON export under `WebContent/META-INF`

## Discovery Order

Explore in local Chrome before coding:

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

Expose a method such as:

```java
static List<Store.SStore> loadStores()
```

or use `List<Store>` when the code is already close to a production `StoreUpdater`.

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
    .useJurlCache(true, TimeUnit.DAYS.toMillis(30))
    .goThen(jurl -> parseStores(jurl.getDocument()))
    .get();
```

For rendered pages, add the render-capable proxy types and a `waitFor` selector when useful:

```java
.setProxyAttribute("waitFor", "div.store-card")
```

Keep only response validation and parsing inside `goThen`; normalize, dedupe, geocode, and save outside it when possible so logic errors do not burn every proxy attempt.

## Proxy Ladder

Try and document the first working option:

- static/datacenter: `STATIC`, `SMARTPROXY_STATIC`, `SOAX_STATIC`, `NETNUT_STATIC`, `DATAIMPULSE_STATIC`, `RAYOBYTE_STATIC_DC`, `PROXYEMPIRE_STATIC`
- BrightData: `UNBLOCKER`, `UNBLOCKER_GEO`, `UNBLOCKER_STATE`
- ZenRows: `ZENROWS_DATACENTER_SCRAPE`, `ZENROWS_RESIDENTIAL_SCRAPE`, then render variants
- Scrapfly: `SCRAPEFLY_DATACENTER_RENDER_GEO`, `SCRAPEFLY_RESIDENTAL_RENDER_GEO`, or ASP render variants for heavier bot protection

If an API works in Chrome but fails from Java through this ladder, try the full document/rendered page or a state/city HTML route before giving up.

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

Use the retailer's stable store number/id over transient UUIDs unless the UUID is clearly the only id accepted by availability APIs. Deduplicate by the id that availability scanning will use.

## Tests

Add tests that assert:

- `loadStores()` is non-empty
- every sampled store has `storeId` and address
- coordinates exist when the site exposes them
- no duplicate store ids exist after normalization
- a known sample store from Chrome appears
- count matches the site total when the site exposes a total

Use `@Script` for live retailer tests. If a route fails, keep the method and test but disable the test:

```java
@Disabled("FEASIBILITY FAILING: store API 403s through STATIC, UNBLOCKER, and ZENROWS_RENDER")
```

Include a nearby comment with the last tried URL, headers/payload shape, proxy list, response code/body signal, and the next route to investigate.
