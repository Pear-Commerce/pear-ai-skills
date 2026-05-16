---
name: retailer-availability-scanning-feasibility
description: Discover, implement, and verify Pear retailer availability scanning feasibility in api.pearcommerce.com. Use when asked to build or assess an AvailabilityUpdater, UPCRetailerZipAvailabilityRecomputer, store-level inventory check, price scraper, in-store/ship-to-home status scanner, or Java tests that take store IDs and item IDs/UPCs and validate availability through JurlProxyFallback and proxies.
---

# Retailer Availability Scanning Feasibility

Use this skill to prove that Pear can take a store id plus retailer item id/UPC and return stock status and price.

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

## Java Probe Shape

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
    .useJurlCache(true, TimeUnit.HOURS.toMillis(6))
    .goThen(jurl -> parseStatusAndPrice(jurl))
    .get();
```

Keep only response validation and parsing inside `goThen`. Build UPC/URZA objects, status semantics, and fallback endpoint choices outside it.

## Proxy Ladder

Try and document the first working option:

- static/datacenter first
- `UNBLOCKER`, plus geo/state variants if location matters
- ZenRows scrape/render, especially for Akamai or client-rendered JSON routes
- Scrapfly render/ASP render for heavier bot protection

If the inventory API is blocked through all proxies, try the rendered PDP document, add-to-cart validation, cart availability endpoint, or store-selection request sequence.

## Tests

Add tests that prove:

- a known store id plus item id/UPC returns a non-null status
- a known available item returns `AVAILABLE` when the sample is stable enough
- a known unavailable item returns `UNAVAILABLE` when available
- price is parsed when the retailer exposes store-specific price
- production wiring returns the expected recomputer class when a production updater is added

For production recomputers, construct a `UPC`, set retailer data item id, construct `UPCRetailerZipAvailability` with `retailerId`, `upcId`, `storeId`, `zip` when needed, and call the updater method directly as existing tests do.

Use `@Script` for live retailer tests. For bot-blocking checks, a repeated test with a small cycle count is useful only when it proves the route is not intermittently blocked.

If the route is not feasible yet, keep the failing probe and disable it:

```java
@Disabled("FEASIBILITY FAILING: inventory endpoint returns 403 through STATIC, UNBLOCKER, ZENROWS_RENDER")
```

Add a comment naming the sample store id, UPC/item id, endpoint/PDP URL, proxy list, last response signal, and next route to investigate.
