---
name: retailer-availability-scanning-feasibility
description: Discover, implement, and verify Pear retailer availability scanning feasibility in api.pearcommerce.com. Use when asked to build or assess an AvailabilityUpdater, UPCRetailerZipAvailabilityRecomputer, store-level inventory check, online availability/price scraper, in-store/ship-to-home status scanner, or Java @Script probes that take store IDs and/or item IDs/UPCs and validate availability through JurlProxyFallback and proxies without running in CI.
---

# Retailer Availability Scanning Feasibility

Use this skill to prove that Pear can take a store id plus retailer item id/UPC and return stock status and price. Store-level inventory is ideal, but it is not the only useful success mode: if the retailer exposes live online ecommerce stock/out-of-stock state and price for a PDP/cart/search result that lets a shopper check out, that is valid availability access. Treat that as different from store-level inventory access, document the limitation clearly, and still move the retailer forward when the route is production-runnable.

When the user asks to create/update production `UPCRetailerZipAvailabilityRecomputer` availability updaters, `BatchAvailabilityUpdater` classes, or `RetailPartner` setup migrations, or asks to graduate a proven availability feasibility route into production, use `$retailer-production-integration`.

For "create an updater", "create scanning", "create availability", or similar retailer Y requests with no proven plan, use this skill first to prove the availability route, then immediately use `$retailer-production-integration` to build the production recomputer/batch updater/migration/tests. The final PR should contain production code, not both production code and leftover `test/com/pear/retailerFeasibility/**` plan files, unless the user explicitly asks to preserve a research artifact.

## Production-Runnable Requirement

The route is feasible only when Java can compute availability in real time from Pear production-like boxes using `JurlProxyFallback`, the proxy ladder, and retailer-owned live endpoints or documents. Local Chrome, local curl, local app, or `Type.NO_PROXY` success from a developer laptop is discovery evidence, not proof, because the local IP is not Pear datacenter/proxy egress. DevTools payloads, search snippets, cached/indexed PDP text, screenshots, and hardcoded fixtures are discovery aids only; they must not make a passing availability `@Script`.

A passing availability probe must always use a proxy-backed `JurlProxyFallback.Type`; do not include `Type.NO_PROXY` in final passing feasibility scripts, updater code, or proxy ladders unless the user explicitly asks for local-only discovery. If a route appears to work directly from the local machine, immediately replay the same retailer-owned endpoint through production-like proxy types such as `STATIC`, ISP/residential pools, provider static pools, Unblocker, ZenRows, or Scrapfly before marking it feasible. If no proxy type can replay the route, keep the code disabled and document the direct-local discovery separately.

A passing availability probe must fetch current status and price live at script runtime. Prefer the supplied store id plus item id/UPC and prove that the store id affects the response when the retailer supports pickup or local inventory. If no store-scoped route exists but the site exposes current online stock/price that can send shoppers to a non-dead PDP or checkout path, make that probe pass as online availability access instead: the method may accept a nullable/placeholder store id, must assert the item id/UPC/PDP, current in-stock/out-of-stock signal, price when exposed, and a live buyability signal showing the PDP/add-to-cart/buy route is actually actionable. Stock text alone is not enough if the page disables the buy/add-to-cart button or the cart endpoint rejects the item. The script must comment that the route proves online availability but not store-level inventory. If all live routes are blocked or session-bound in a way Java cannot replay, keep the code, disable the probe, and document the blocker instead of substituting demo data. Before giving up, keep iterating through retailer-owned alternatives: inventory APIs, PDP documents after store-context setup, cart/add-to-cart validation, fulfillment endpoints, GraphQL variants, mobile/app-adjacent APIs, rendered documents, app decompilation when appropriate, and every relevant proxy/header combination.

For buyability, the real user path matters. When a Java replay can fetch live stock/price but the cart endpoint is opaque, session-heavy, or intentionally hard to replay, use local Chrome during discovery to verify the actual PDP/store context the shopper sees. Check more than one relevant store/postal context when store context exists, confirm the buy/add-to-cart button is visible and enabled for the sampled item, and when practical click through far enough to see the cart/add confirmation without completing checkout. Capture the Chrome-observed store contexts and result in the `@Script` comments. Keep the runtime Java route honest: the passing probe should still fetch live status/price from retailer-owned pages/endpoints, and the comments must distinguish Chrome user-path validation from production store-level inventory access.

During planning/discovery, before declaring a live route blocked, enumerate the currently available `JurlProxyFallback.Type` values from `src/com/pear/http/JurlProxyFallback.java` and run a bounded one-off probe across every relevant non-local, non-deprecated proxy type. Include static, ISP/residential, geo variants, BrightData unblockers, ZenRows scrape/render, Scrapfly scrape/render/ASP, and provider-specific static pools. Skip `NO_PROXY`, explicitly local types, deprecated/invalid types, retailer-specific types for another retailer, or types documented as requiring a browser profile incompatible with Java. Record the tested type list and the response signal in the disabled probe/comment.

Do not put exhaustive proxy sweeps in the final real-time availability `@Script` or production updater path. Once discovery identifies the proxy type(s) that work, the runnable script should use a small ordered list of those known-good types, with a modest retry count and cache strategy appropriate for production. If `STATIC` is the right path but has intermittent transient failures, it is acceptable to try `STATIC` up to about 10 times and count that as one cheap production-ready proxy option before falling through to the next known-good proxy. If a script repeatedly reaches a late proxy before succeeding, treat the earlier failures as pruning evidence and move/remove those proxies unless logs show they sometimes return valid store-specific status/price evidence. If no proxy works, disable the live probe with the exhaustive planning results instead of making every test run burn through all proxies again.

If no `STATIC` or cheap static/provider-static route works, always check Android app calls before declaring availability impossible or settling for expensive/heavy proxy routes such as `UNBLOCKER`, Scrapfly ASP, or ZenRows render. Inspect APK/XAPK strings and app traffic for product availability, cart, fulfillment, store-selection, APIM/gateway, GraphQL, public app headers, and stable parameter names, then replay any candidate retailer-owned request through a proxy-backed Java route.

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

Explore in local Chrome before coding, but treat local browser and direct local HTTP success as route discovery only:

1. Select a real store through the site's normal location/store UI.
2. Open the PDP for a sample product with a known UPC and item id.
3. Switch pickup/delivery/ship modes and observe Network requests.
4. Identify endpoints or documents that return inventory, purchasability, price, fulfillment, substitutions, or store-specific product details.
5. Record required headers, cookies, postal code/store id parameters, GraphQL operation names, request bodies, and local storage/session setup.
6. Check whether the route can be replayed statelessly in Java. If session state is required, reproduce the session setup request sequence in Java instead of relying on the browser session.

Prefer stable sources in this order: inventory API, product detail API with store id, cart/add-to-cart validation, PDP embedded store-specific JSON, rendered PDP DOM, then live online PDP/product/search JSON when it exposes checkout-relevant stock status, price, and buyability. For online-only availability, verify the add-to-cart/buy button is enabled in live HTML/JSON or that a live cart/add endpoint accepts the item; otherwise leave the probe disabled as a possible dead-link risk.

If the only reliable buyability proof is from Chrome, check the rendered PDP in multiple store/postal contexts where possible and document the exact visible signal: enabled button text, add-to-cart modal, cart line, or checkout entry point. Treat that as user-visible online buyability evidence, not as proof of a replayable production cart endpoint unless Java also reproduces it.

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

For `getPdpUrl(...)`, first try to build the retailer PDP from `item.getOrCreateRetailerData(retailer.enumName).getItemId()` and known URL strings/patterns. If item id alone is not enough, have the resolver store the second stable value in `SRetailerItemData.secondaryId` and build from `itemId` plus `secondaryId`. Do not make `SRetailerItemData.url`, `UPCRetailerData.linkUrl`, or `SItemDataWrapper.getLink()` the primary strategy; those are fallbacks only when deterministic URL construction is impossible or unavailable.

For updater URL behavior, strongly prefer an abridged resolver-to-availability `@Script` as the default proof, not only a pure URL-helper unit test. Treat it as expected whenever PDP URL reconstruction, saved URL fallback removal, platform URL translation, or `secondaryId` handoff behavior changes; if you omit it, say exactly why the shorter test still proves the production path. The script should prove the same data path production will use: create resolver-shaped `SRetailerItemData` with `itemId`, `secondaryId`, and `url`, manually seed direct `UPCRetailerData`/`SItemDataWrapper` for `retailer.enumName`, construct a `UPCRetailerZipAvailability`, then call the availability updater URL path and assert the final PDP URL. Put a stale or wrong `PDPUrlSavedFromAvailabilityCheck` on the availability when the bug is "saved URL fallback" so the test proves the updater ignores it. Cover both current/new and legacy/platform-style retailers when the platform has multiple URL formats or historical behavior. Lazily create test `RetailPartner`, `UPC`, and direct `UPCRetailerData` rows only if the script needs ORM/Spring state; otherwise construct them in memory. Do not seed platform data, do not call `item.getPlatformDataIfPresent(retailer.availabilitySharedImagesAndIds)`, and do not let a passing test rely on shared-platform fallback when the production behavior should read direct retailer data.

Inside `recomputeAvailability`, read the item id from `item.getOrCreateRetailerData(retailer.enumName).getItemId()`, request the retailer route, and set:

- `urza.inStoreStatus`
- `urza.shipToHomeStatus` when supported
- `urza.price` when exposed

Do not persist PDP URLs from availability recompute. Never call `availability.setPDPUrlSavedFromAvailabilityCheck(...)`, including with `result.productUrl`, `getPdpUrl(...)`, `StringUtils.defaultIfBlank(result.productUrl, getPdpUrl(...))`, resolver URLs, or link fallbacks. Do not add or retain shared post-recompute auto-fill blocks that persist `getPdpUrl(...)` onto the availability. Keep PDP URL behavior in `getPdpUrl(...)` and resolver data; availability scans should update stock and price signals only.

Use `Status.AVAILABLE`, `Status.UNAVAILABLE`, `Status.UNKNOWN`, and `Status.INVALID` intentionally. Avoid returning `UNKNOWN` for a known blocked request without documenting that it is a proxy/session failure.

## Jurl Pattern

Use `JurlProxyFallback` for live HTTP:

Default browser-discovered inventory, PDP, cart, and price/buyability routes to `new LoggedJurl().asChrome()` so Java sends a browser-like header profile. If a plain `LoggedJurl` gets blocked, times out, returns a bot/app shell, or fails while Chrome succeeds, retry with `.asChrome()` before escalating to heavier proxies or declaring availability infeasible. Keep `.asChrome()` on the final scanner/script route when it is part of the proven production replay.

If `.asChrome()` still fails, especially on XHR/cart/inventory APIs that reject document-navigation headers or appear TLS-fingerprint sensitive, try `LoggedJurl.withBrowserProfile(...)` with the explicit API headers traced from Chrome. Browser profiles can be the difference between a blocked shell and a real price/stock response even when the header list is otherwise correct. Prefer `ChromeShim.getMostRecentChromeRelease().getBrowserProfile()` on production-like boxes; if local feasibility scripts have no `BrowserProfileConfiguration`, use a documented long-lived captured/check-in Chrome profile fallback only for the probe and comment that production should use the latest DB-backed profile when available.

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

Inside `goThen`, non-null return means success; `null` return and throw both mean failed attempt. Keep response validation and parsing that decide whether the availability response is usable/cacheable inside `goThen`. Build UPC/URZA objects, status semantics, and fallback endpoint choices outside it.

Use `useJurlCache(...)` for script validation when repeatedly proving the same store/item route, especially after a live response has established the proxy/header/body shape. Keep TTLs short for volatile availability and price responses. When testing a changed proxy type, header set, render option, or request body provenance, bump `extraCacheKey(...)` so stale cached responses do not mask whether the new route works. Once the working proxy list is known, cache that list with a stable key and avoid exhaustive proxy checks in the real-time updater path.

Validate proxy-rendered HTTP 200 bodies before treating availability as production-ready. Cloudflare/Forter-style sites can return `Checking Connection`, `Just a moment`, JavaScript-disabled shells, or generic app shells without product, price, or availability data while still returning 200 through render proxies. The `goThen` validator should require either the supplied store id plus item id to affect the response, or a clearly documented online availability path where the supplied item id/UPC/PDP affects the response and the body exposes current online stock status, price, and a live buyability/add-to-cart signal. Reject known challenge/app-shell text by returning `null` or throwing, and use a bumped `extraCacheKey` whenever the body validator changes so stale cached shells do not hide the failed route.

For Azure/APIM-style APIs, public long-lived subscription keys from browser bundles may be accepted as either `Ocp-Apim-Subscription-Key` or a `subscription-key` query parameter. If a copied API works locally but proxied Java returns a "missing subscription key" 401, retry with the traced key in both locations before pruning the proxy. Keep the successful final script to the proxy types that actually work.

If a search index such as Algolia exposes only global online stock fields like `StockOverrideMessage`, first decide whether it is stale diagnostic text or a live retailer-owned ecommerce source used by the site. Stale/indexed/archive text alone is not enough. A live search/PDP/product JSON route may count as online availability access when it returns current in-stock/out-of-stock state and price for the supplied item/UPC and the same live site path proves the PDP can be bought or added to cart. If you cannot prove the buy/add-to-cart button or cart route works, do not mark online availability as passing yet; document it as a dead-link risk and keep iterating. When it passes, document it as online availability rather than store-level inventory. Keep searching for a store-context/cart/fulfillment route when local pickup/in-store inventory is important, but do not fail an otherwise production-runnable retailer solely because the only available stock signal is global online availability.

If a storefront exposes a hidden delivery-info endpoint, shipping modal, add-to-bag modal, or basket page that mentions click-and-collect, verify whether the supplied store id changes the response before treating it as store-level inventory. Carrier collection copy, global ecommerce stock, POQ/cart line data, or header-only store context are useful negative probes for inventory access, but they can still support online availability access when they provide current stock/out-of-stock state and price for the supplied item. Name which mode the script proves.

When updating the retailer feasibility spreadsheet after an availability fix, keep the sheet aligned with this distinction. A retailer with live online availability and buyability proof should not have the availability surface marked `Hard`; mark that surface as working/easy and put the store-level inventory limitation in notes. If UPC resolution remains unsolved, mark UPC and overall difficulty hard, but do not let that imply availability failed.

When one inventory response includes multiple fulfillment modes, parse the exact branch that proves the requested store. Direct-ship warehouses, nearby-store suggestions, or global fallback arrays can sit beside `instorepickup`/pickup data and contain positive `stockAvailable` values. The passing probe should require the requested fulfillment mode plus matching `storeCode`, `locationCode`, `deliveryPointOfService`, or equivalent id before returning `AVAILABLE`; never let a max stock quantity across the whole payload make the script pass.

For Spartacus/SAP Commerce Cloud (OCC) storefronts, do not assume the OCC prefix is `/rest/v2` or `/occ/v2`. Inspect app bundles, `cx-state`, and Spartacus config for `backend.occ.prefix`, `baseUrl`, and base site; some sites use `/api/v2/<baseSite>` for all OCC calls. The direct `/products/{code}/stock` endpoint may be undocumented or require unclear location parameters. If so, trace the cart adapter in browser chunks and try a live anonymous-cart flow: `POST <prefix>/<baseSite>/users/anonymous/carts?fields=FULL`, then `POST <prefix>/<baseSite>/users/anonymous/carts/{guid}/entries?fields=FULL` with `quantity`, `product.code`, `product.isExternalVendorVariantProduct` when required, `deliveryPointOfService.name`, and the traced pickup option such as `bopis-delivery-option-*`. Also try cart-store search after adding the item, for example `GET <prefix>/<baseSite>/users/anonymous/carts/{guid}/stores?query=<city-or-postcode>&fields=FULL&pageSize=...&countryIso=...&onlyOpen=true`; some retailers return store-specific `stores[].entriesWithStock` for the cart item there even when a second DPOS add-entry call returns 400. A passing probe should assert the requested store id/name, requested item code, price, and stock status from the store-specific branch; run two store ids when possible to prove the store id affects the response. Cache stable store/search/detail GETs, but do not cache cart writes as availability proof; if local script cache can interfere, add a harmless nonce query parameter to the cart POST URLs and comment that production can omit it.

## Proxy Ladder

Try and document the first working option, but do not stop at this short list if it fails:

- static/datacenter first
- `UNBLOCKER`, plus geo/state variants if location matters
- ZenRows scrape/render, especially for Akamai or client-rendered JSON routes
- Scrapfly render/ASP render for heavier bot protection

Before accepting an expensive/heavy proxy as the only workable route, or before calling the route impossible, check Android app calls/APK strings for a mobile availability, cart, fulfillment, or APIM endpoint that can be replayed through `STATIC` or another cheap proxy-backed type.

If the inventory API is blocked through all proxies, try the rendered PDP document, add-to-cart validation, cart availability endpoint, or store-selection request sequence.

When the common ladder fails during discovery, expand to all currently available `JurlProxyFallback.Type` entries that can run on production Java. Prefer a planning-only helper that logs each type, response code, final URL, body-block signal, price/status evidence, and whether store-specific availability is present. Keep that helper separate from the passing real-time script path.

## Creative Recovery

Get creative if you have to: when the direct inventory endpoint is blocked, session-bound, or too opaque, keep trying plausible retailer-owned routes before declaring scanning infeasible. Try PDP documents after setting store context, product-detail APIs with pickup/delivery mode parameters, cart/add-to-cart validation, fulfillment or substitutions endpoints, GraphQL operation variants, local-storage/session bootstrap requests, rendered DOM extraction, mobile/app-adjacent APIs, and platform-sibling banners before declaring scanning infeasible.

When app decompilation or APK string extraction reveals API base URLs, route fragments, DTO names, or parameter names for product availability, basket, store status, or fulfillment, reconstruct the most likely retailer-owned requests and test them through Java/proxies. Treat those strings as a map, not proof: the passing availability probe still needs a live store-specific response with status and price, and any required app headers, tokens, cookies, store context, or device identifiers must be reproducible from production boxes.

When a new tactic is useful, or a creative route fails in a reusable way, update this skill or `references/repo-tactics.md` in the canonical skills repo before wrapping up, then sync/reinstall the skill. Capture the store-context setup, request body/header shape, proxy type, status/price mapping, cache key implication, and how the `@Script` probe distinguishes unavailable from blocked.

When store ids differ between locator surfaces, validate the id against the availability endpoint before committing to the store import. A marketing locator id may be stable for maps but unusable for fulfillment; in that case use the ecommerce/fulfillment UUID or code in `Store.SStore.storeId` and note any small count difference from the marketing locator.

For GraphQL routes copied from browser bundles, keep the operation and fragments browser-shaped until the probe is stable. A proxy response that reaches GraphQL validation, even with errors like unused/missing fragments, is useful evidence that the proxy/header/key path reached the retailer API; fix the query shape and retest that proxy before discarding it.

## Script Probes

Add JUnit methods annotated with both `@Test` and `@Script`; these are feasibility probes that should not run in CI by default. Prove:

- a known store id plus item id/UPC returns a non-null status when store-level inventory is available
- or, for online availability access, a known item id/UPC/PDP returns a non-null live ecommerce status, price, and buyability/add-to-cart signal without pretending it is store-specific
- a known available item returns `AVAILABLE` when the sample is stable enough
- a known unavailable item returns `UNAVAILABLE` when available
- price is parsed when the retailer exposes store-specific price
- production wiring returns the expected recomputer class when a production updater is added

If multiple live `@Script` probes in one class create carts, mutate store context, or share proxy/cache state with UPC/store probes, annotate the class or methods with `@Execution(ExecutionMode.SAME_THREAD)` so JUnit parallelism does not make the script hang or flake.

For production recomputers, construct a `UPC`, set retailer data item id, construct `UPCRetailerZipAvailability` with `retailerId`, `upcId`, `storeId`, `zip` when needed, and call the updater method directly as existing tests do.

For bot-blocking checks, a repeated `@Script` probe with a small cycle count is useful only when it proves the route is not intermittently blocked.

Never make this probe pass by parsing hardcoded, archived, fixture, or manually copied PDP text. If the only available stock signal is from stale indexed text, treat it as diagnostic evidence and leave the live probe disabled. If the site itself uses a live search/product/PDP endpoint that returns current online stock and price, it may pass as online availability access only when the script also proves the buy/add-to-cart path is enabled or accepted at runtime and documents that store-level inventory remains unavailable.

If the route is not feasible yet, keep the failing probe and disable it:

```java
@Disabled("FEASIBILITY FAILING: inventory endpoint returns 403 through STATIC, UNBLOCKER, ZENROWS_RENDER")
```

Add a comment naming the sample store id, UPC/item id, endpoint/PDP URL, proxy list, last response signal, and next route to investigate.
