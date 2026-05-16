---
name: retailer-availability-scanning-feasibility
description: Discover, implement, and verify Pear retailer availability scanning feasibility in api.pearcommerce.com. Use when asked to build or assess an AvailabilityUpdater, UPCRetailerZipAvailabilityRecomputer, store-level inventory check, price scraper, in-store/ship-to-home status scanner, or Java @Script probes that take store IDs and item IDs/UPCs and validate availability through JurlProxyFallback and proxies without running in CI.
---

# Retailer Availability Scanning Feasibility

Use this skill to prove that Pear can take a store id plus retailer item id/UPC and return stock status and price.

## Production-Runnable Requirement

The route is feasible only when Java can compute availability in real time from Pear production-like boxes using `JurlProxyFallback`, the proxy ladder, and retailer-owned live endpoints or documents. Local Chrome exploration, DevTools payloads, search snippets, cached/indexed PDP text, screenshots, and hardcoded fixtures are discovery aids only; they must not make a passing availability `@Script`.

A passing availability probe must fetch current status and price live at script runtime for the supplied store id plus item id/UPC. If all live routes are blocked, session-bound in a way Java cannot replay, or missing store-specific inventory data, keep the code, disable the probe, and document the blocker instead of substituting demo data. Before giving up, keep iterating through retailer-owned alternatives: inventory APIs, PDP documents after store-context setup, cart/add-to-cart validation, fulfillment endpoints, GraphQL variants, mobile/app-adjacent APIs, rendered documents, app decompilation when appropriate, and every relevant proxy/header combination.

During planning/discovery, before declaring a live route blocked, enumerate the currently available `JurlProxyFallback.Type` values from `src/com/pear/http/JurlProxyFallback.java` and run a bounded one-off probe across every relevant non-local, non-deprecated proxy type. Include static, ISP/residential, geo variants, BrightData unblockers, ZenRows scrape/render, Scrapfly scrape/render/ASP, and provider-specific static pools. Skip only types that are explicitly local, deprecated/invalid, retailer-specific for another retailer, or documented as requiring a browser profile incompatible with Java. Record the tested type list and the response signal in the disabled probe/comment.

Do not put exhaustive proxy sweeps in the final real-time availability `@Script` or production updater path. Once discovery identifies the proxy type(s) that work, the runnable script should use a small ordered list of those known-good types, with a modest retry count and cache strategy appropriate for production. If `STATIC` is the right path but has intermittent transient failures, it is acceptable to try `STATIC` up to about 10 times and count that as one cheap production-ready proxy option before falling through to the next known-good proxy. If a script repeatedly reaches a late proxy before succeeding, treat the earlier failures as pruning evidence and move/remove those proxies unless logs show they sometimes return valid store-specific status/price evidence. If no proxy works, disable the live probe with the exhaustive planning results instead of making every test run burn through all proxies again.

## Repo Anchors

Check these first:

- `src/com/pear/itemurlupdater/UPCRetailerZipAvailabilityRecomputer.java`
- existing retailer updaters under `src/com/pear/itemurlupdater/**`
- `test/com/pear/itemurlupdater/**`
- `test/com/pear/retailerFeasibility/**` for small plan tests like `getAvailability(storeId, itemId)`
- `src/com/pear/onboarding/alexwyler/AlsBodegaAvailabilityUpdater.java` and `test/com/pear/onboarding/alexwyler/AlsBodegaTest.java` for a compact recomputer example

If the store id or item id is not known yet, use `$retailer-store-import-feasibility` and `$retailer-upc-resolution-feasibility` first.

## Repo Tactics

Read `references/repo-tactics.md` when choosing a static updater vs batch updater, deciding cache keys/TTLs, handling store context, or diagnosing status writeback. It summarizes patterns and gotchas mined from current availability updater and batch availability updater code.

## Discovery Order

Explore in local Chrome before coding:

1. Select a real store through the site's normal location/store UI.
2. Open the PDP for a sample product with a known UPC and item id.
3. Switch pickup/delivery/ship modes and observe Network requests.
4. Identify endpoints or documents that return inventory, purchasability, price, fulfillment, substitutions, or store-specific product details.
5. Record required headers, cookies, postal code/store id parameters, GraphQL operation names, request bodies, and local storage/session setup.
6. Check whether the route can be replayed statelessly in Java. If session state is required, reproduce the session setup request sequence in Java instead of relying on the browser session.

Prefer stable sources in this order: inventory API, product detail API with store id, cart/add-to-cart validation, PDP embedded store-specific JSON, rendered PDP DOM.

Do not treat stale or indexed text as availability success. It can prove what words to parse, but it cannot prove that Pear can scan live inventory later.

## Java Probe Shape

Follow the repo's feasibility naming pattern when creating files:

```text
test/com/pear/retailerFeasibility/<country>/<retailer>/<Retailer>Plan.java
test/com/pear/retailerFeasibility/<country>/<retailer>/<Retailer>PlanTest.java
```

Use `*Plan.java` for reusable availability exploration code: store-context setup, item/PDP request methods, parsers, DTOs, status/price mapping, proxy lists, and helpers that may later move into a `UPCRetailerZipAvailabilityRecomputer`. Use `*PlanTest.java` for the JUnit `@Script` entrypoints, sample store/item inputs, assertions, logging, `@Disabled` failure comments, and production-wiring checks. A single `*PlanTest.java` is acceptable for a tiny one-off, but prefer the split when helper logic is non-trivial or shared with UPC resolution.

When this skill runs by itself, first search for an existing retailer `*Plan.java` / `*PlanTest.java` pair. If stores or UPC resolution already created it, update that same pair with availability helpers and availability `@Script` methods while preserving existing probes and comments. If it does not exist, create the pair using the standard names so the orchestrator or other focused skills can append to it later.

When the user scopes a feasibility pass to only `<Retailer>Plan.java` and `<Retailer>PlanTest.java`, treat that as a hard file-boundary instruction. Keep helper DTOs, store-context setup probes, header/body/token tracing notes, captured long-lived public config, parsers, and disabled/passing `@Script` probes nested in those two files. Do not create production availability updaters, recomputer classes, imports, or wiring in that mode; the proven code can be pulled out later. This file-boundary allowance does not relax the production-runnable requirement: a passing availability probe still must fetch current retailer-owned store-specific status and price at runtime, not rely on embedded/demo data.

For feasibility, a plan method may be enough:

```java
static Tuple2<Status, BigDecimal> getAvailability(String storeId, String itemId)
```

or:

```java
static SRetailerItemData fetchProductAvailability(String storeId, String upcOrItemId)
```

When graduating to production, implement a `UPCRetailerZipAvailabilityRecomputer` subclass:

```java
@Override
public List<String> retailerEnums()

@Override
public String getPdpUrl(UPC item, RetailPartner retailer, UPCRetailerZipAvailability availability)

@Override
protected void recomputeAvailability(
    UPCRetailerZipAvailability urza,
    UPC item,
    RetailPartner retailer,
    String storeId
)
```

Inside `recomputeAvailability`, read the item id from `item.getOrCreateRetailerData(retailer.enumName).getItemId()`, request the retailer route, and set:

- `urza.inStoreStatus`
- `urza.shipToHomeStatus` when supported
- `urza.price` when exposed
- PDP URL fields when the updater pattern uses them

Use `Status.AVAILABLE`, `Status.UNAVAILABLE`, `Status.UNKNOWN`, and `Status.INVALID` intentionally. Avoid returning `UNKNOWN` for a known blocked request without documenting that it is a proxy/session failure.

## Jurl Pattern

Use `JurlProxyFallback` for live HTTP:

```java
Tuple2<Status, BigDecimal> result = new JurlProxyFallback(
    List.of(Type.STATIC, Type.UNBLOCKER, Type.ZENROWS_DATACENTER_SCRAPE, Type.ZENROWS_DATACENTER_RENDER),
    () -> new LoggedJurl()
        .url(inventoryUrl)
        .method(Jurl.POST)
        .asChrome()
        .timeout(60_000)
        .bodyJson(request)
        .throwOnNon200(false)
)
    .attempts(5)
    .extraCacheKey("retailer-availability-static-v1")
    .useJurlCache(true, TimeUnit.HOURS.toMillis(6))
    .goThen(jurl -> parseStatusAndPrice(jurl))
    .get();
```

Keep only response validation and parsing inside `goThen`. Build UPC/URZA objects, status semantics, and fallback endpoint choices outside it.

Use `useJurlCache(...)` for script validation when repeatedly proving the same store/item route, especially after a live response has established the proxy/header/body shape. Keep TTLs short for volatile availability and price responses. When testing a changed proxy type, header set, render option, or request body provenance, bump `extraCacheKey(...)` so stale cached responses do not mask whether the new route works. Once the working proxy list is known, cache that list with a stable key and avoid exhaustive proxy checks in the real-time updater path.

## Proxy Ladder

Try and document the first working option, but do not stop at this short list if it fails:

- static/datacenter first
- `UNBLOCKER`, plus geo/state variants if location matters
- ZenRows scrape/render, especially for Akamai or client-rendered JSON routes
- Scrapfly render/ASP render for heavier bot protection

If the inventory API is blocked through all proxies, try the rendered PDP document, add-to-cart validation, cart availability endpoint, or store-selection request sequence.

When the common ladder fails during discovery, expand to all currently available `JurlProxyFallback.Type` entries that can run on production Java. Prefer a planning-only helper that logs each type, response code, final URL, body-block signal, price/status evidence, and whether store-specific availability is present. Keep that helper separate from the passing real-time script path.

## Creative Recovery

Get creative if you have to: when the direct inventory endpoint is blocked, session-bound, or too opaque, keep trying plausible retailer-owned routes before declaring scanning infeasible. Try PDP documents after setting store context, product-detail APIs with pickup/delivery mode parameters, cart/add-to-cart validation, fulfillment or substitutions endpoints, GraphQL operation variants, local-storage/session bootstrap requests, rendered DOM extraction, mobile/app-adjacent APIs, and platform-sibling banners before declaring scanning infeasible.

When app decompilation or APK string extraction reveals API base URLs, route fragments, DTO names, or parameter names for product availability, basket, store status, or fulfillment, reconstruct the most likely retailer-owned requests and test them through Java/proxies. Treat those strings as a map, not proof: the passing availability probe still needs a live store-specific response with status and price, and any required app headers, tokens, cookies, store context, or device identifiers must be reproducible from production boxes.

When a new tactic is useful, or a creative route fails in a reusable way, update this skill or `references/repo-tactics.md` in the canonical skills repo before wrapping up, then sync/reinstall the skill. Capture the store-context setup, request body/header shape, proxy type, status/price mapping, cache key implication, and how the `@Script` probe distinguishes unavailable from blocked.

For GraphQL routes copied from browser bundles, keep the operation and fragments browser-shaped until the probe is stable. A proxy response that reaches GraphQL validation, even with errors like unused/missing fragments, is useful evidence that the proxy/header/key path reached the retailer API; fix the query shape and retest that proxy before discarding it.

## Script Probes

Add JUnit methods annotated with both `@Test` and `@Script`; these are feasibility probes that should not run in CI by default. Prove:

- a known store id plus item id/UPC returns a non-null status
- a known available item returns `AVAILABLE` when the sample is stable enough
- a known unavailable item returns `UNAVAILABLE` when available
- price is parsed when the retailer exposes store-specific price
- production wiring returns the expected recomputer class when a production updater is added

For production recomputers, construct a `UPC`, set retailer data item id, construct `UPCRetailerZipAvailability` with `retailerId`, `upcId`, `storeId`, `zip` when needed, and call the updater method directly as existing tests do.

For bot-blocking checks, a repeated `@Script` probe with a small cycle count is useful only when it proves the route is not intermittently blocked.

Never make this probe pass by parsing hardcoded/indexed/cached PDP text. If the only available stock signal is from a search result, archive, fixture, or manually copied page, treat it as diagnostic evidence and leave the live probe disabled.

If the route is not feasible yet, keep the failing probe and disable it:

```java
@Disabled("FEASIBILITY FAILING: inventory endpoint returns 403 through STATIC, UNBLOCKER, ZENROWS_RENDER")
```

Add a comment naming the sample store id, UPC/item id, endpoint/PDP URL, proxy list, last response signal, and next route to investigate.
