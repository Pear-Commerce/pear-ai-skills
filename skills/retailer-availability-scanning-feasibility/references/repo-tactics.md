# Availability Scanning Repo Tactics

Use this reference after browser discovery when deciding whether to write a static `AvailabilityUpdater`, a batch updater, or both.

## Where Availability Scanning Plugs In

- Static/on-demand scanning lives in `UPCRetailerZipAvailabilityRecomputer` subclasses under `src/com/pear/itemurlupdater`.
- Production entrypoint calls `recomputeAvailability(...)`, which wraps subclass logic, sets PENDING statuses, saves the URZA, writes logs, and computes unified status.
- Subclasses usually implement `recomputeAvailabilityRetailer(...)` when extending `InstacartFallbackAvailabilityUpdater`, or `recomputeAvailability(...)` directly for simpler bases.
- Batch scanning lives in `BatchAvailabilityUpdater` subclasses and writes many URZAs from streamed `BatchAvailability` records.
- `StaticDelegatingBatchAvailabilityUpdater` can run static recomputers serially as a fallback batch path, but it is intentionally low-parallelism and expensive.

## Static Recomputer Flow

`UPCRetailerZipAvailabilityRecomputer` handles important status semantics:

- Invalid UPC or missing required zip is marked invalid before subclass code runs.
- Global URL overrides from `UPCRetailerData` mark availability available without scanner work.
- If store id is blank and the retailer depends on zip, the recomputer may call `getStoresForZip` on the fly when stores have not been imported yet.
- The subclass should set `inStoreStatus`, `shipToHomeStatus`, and `price`.
- Any status left `PENDING` becomes invalid after subclass code returns.
- Runtime exceptions convert pending statuses to the transient unknown status and mark the compute failed.
- `determineUnifiedStatus` returns AVAILABLE if either in-store or ship-to-home is available, UNAVAILABLE if either is unavailable, then transient unknown/invalid based on status priority.

Always call or mirror `validateAvailabilityInvalidStatus(...)` for missing item ids, Instacart-only ids, and route-specific invalid item ids. Use `setStatusesInvalid(...)` at the top of direct recomputers when existing patterns do.

## Choosing Static vs Batch

Add a static recomputer when:

- The route answers one store plus one item in real time.
- The site requires a session setup sequence or rendered PDP per item.
- The route is used for landing pages, store locators, or ad hoc checks.
- You need PDP/ATC URLs alongside status.

Add a batch updater when:

- The retailer/API can scan many UPCs, stores, or feed rows efficiently.
- Pulse or precompute needs regular store-level updates.
- The static path is too costly but a separate API/feed supports bulk checks.
- The site exposes region-wide, feed, GraphQL batch, or search-by-store inventory.

Some retailers have both: a static checker for correctness and a batch updater for scale. Meijer disables on-the-fly retailer checks but still has batch/Pulse value; HEB and HyVee share parsing/status helpers between static and batch paths.

## Batch Base Class Patterns

`BatchAvailabilityUpdater`:

- Loads `UPCRetailerData` by retailer enum and item id, with optional scoped `upcs`.
- Builds the expected UPC by store/zip/retailer-zone combinations.
- Streams `BatchAvailability` records and fans each item id result back to all matching UPCs.
- Backfills URD price and `knownCarries` when successful availability results provide evidence.
- Loads existing URZAs in a cached item-id-to-location map with 10 minute Caffeine TTL.
- Saves changed/new URZAs with rate-limited backpressure.
- Tracks missing expected URZAs by UPC/store and can mark missing store ids unavailable when the subclass opts in.

`MultiUPCStoreIdBatchAvailabilityUpdater`:

- Loads live `Store` rows for the target retailers, with optional `withStoreIds(...)` filtering.
- Adds a dummy store for retailers where availability does not depend on zip.
- Groups UPCs through `getUPCGroups`.
- Runs UPC groups and stores through separate bounded thread pools.
- Expects subclasses to return one `BatchAvailability` per scanned item/store where possible.
- Adds failure records for missing results or whole-batch exceptions.
- Supports rollout filtering with `batch-updater-rollout-percentage`.

`SerialUPCStoreIdBatchAvailabilityUpdater`:

- Lets you implement one `fetchBatchAvailabilityInfo(Store, UPC)` and get multi-store/multi-upc streaming for free.
- Performs pre-checks for blank item ids and Instacart-only ids.
- Wraps exceptions in `RecomputeResult.unhandledException(...)` and saves Pulse Jurl exceptions.

Use real multi-UPC endpoints when available; otherwise serial base classes are simpler and safer.

## `BatchAvailability` And `RecomputeResult`

Populate these fields:

- `itemId`: must match the `UPCRetailerData.itemId` or selected `availabilityItemIdField`.
- `storeId`: required for store-level URZAs.
- `retailerEnum`: required for multi-retailer/platform updaters; optional only when `retailerEnums()` has one value and the base can infer it.
- `zip` and `countryCode`: helpful when emitting non-canonical stores or non-US rows.
- `price`: non-zero prices can backfill URD and URZA price.
- `url`: stored on URZA when present.
- `result`: use `RecomputeResult.statuses(...)`, `lateInvalidation()`, `failureWithoutException(...)`, or `unhandledException(...)` intentionally.

`RecomputeResult.statuses(Status.UNKNOWN, ...)` becomes a failure-style Try for that side. That is useful for quality metrics, but it means a result with only UNKNOWN is not considered a successful availability check.

## Status Semantics

- `AVAILABLE`: retailer says it can be purchased/fulfilled for that mode.
- `UNAVAILABLE`: retailer route succeeded and says it cannot be purchased/fulfilled.
- `UNKNOWN`: route could not prove availability, data is missing, or response shape is incomplete.
- `INVALID`: item id/store id/UPC is invalid for this route or only Instacart id exists.
- Do not convert bot blocks into `UNAVAILABLE`; use exceptions or UNKNOWN with logging.
- Keep in-store and ship-to-home separate. Some retailers intentionally set one side INVALID/UNKNOWN when the route does not support that mode.

Examples:

- Petco batch sets ship-to-home UNKNOWN for normal runs but INVALID for Pulse when only in-store mobile API is trusted.
- HyVee computes ship-to-home from pickup location ecommerce status and in-store availability.
- CVS combines pickup and shipping lines in one commits request and falls back to UNKNOWN on parsing failure.
- HEB can use an app GraphQL route, rendered PDP with store cookie, or multi-store product search API, then maps fulfillment channels to status.

## Store Context And Response Validation

Most scanner bugs come from silently checking the wrong store:

- Reproduce store-selection cookies/headers/request sequence in Java; do not rely on local browser session state.
- Validate response store id when the response contains one. HEB rejects product data for the wrong store; Walmart Canada throws on pickup store mismatch.
- Include store id in request body, cookies, headers, and cache key when it affects inventory.
- If a route uses zip or lat/lng instead of store id, include rounded coordinates/zip in the cache key and prove mapping back to the target store.
- Load `Store` from DB when the request needs secondary id, country code, zip, lat/lng, or fulfillment id.
- If store import is not ready, static recomputer may infer a store id from `getStoresForZip`, but this is only a bootstrap convenience.

## Caching Strategy

Use shorter TTLs for volatile inventory and longer TTLs for stable metadata:

- Inventory by store/item: usually hours to one day; CVS can be one or seven days by AppConfig.
- PDP context/product metadata: seven to thirty days when it contains stable ids, catEntryIds, or embedded product data.
- Item id validity checks: often 180 days.
- Store lists: thirty to 120 days.
- Session setup: minutes to hours depending on token/cookie lifetime. Big Lots caches store session for 20 minutes because it expires quickly.

Always key inventory caches by the dimensions that change stock or price:

- store id or fulfillment node
- item id, SKU, catEntryId, group id, or variant id
- zip, country, pickup/delivery mode, banner, and request body date when present
- parser/API version when changing extraction logic

Use `waitForActiveIdenticalRequests(true)` for popular item/store calls and avoid render proxies unless the route needs JavaScript or browser XHR capture.

## Proxy And Retry Tactics

- Start with static/datacenter when API routes accept it.
- Move to `UNBLOCKER`, then ZenRows scrape/render, then Scrapfly scrape/render/ASP when blocked or client-rendered.
- Use geo/state variants when site availability changes by location or blocks non-local traffic.
- Use `.attempts(...)`, `Retry.task(...)`, and explicit response validation instead of swallowing all failures.
- Use circuit breaker toggles carefully. Some Pulse paths disable ZenRows circuit breakers because high-volume batch runs need different failure behavior.
- Preserve Chrome-like headers only when required; overfitting headers from DevTools can make tests brittle.

## Concrete Repo Patterns

- Meijer gets an `al-id` cookie from `/bin/meijer/cart/userstate`, then calls product API with `meijer-store=<storeId>;al-id=<id>`, validates item id, and caches by base URL plus store id for 12 hours.
- HyVee uses GraphQL `getProductDetailsWithPrice`, caches by `storeId` and `itemId`, and derives ship-to-home from pickup location ecommerce status.
- HEB has app GraphQL, rendered PDP with `CURR_SESSION_STORE`, and a multi-store API that can populate Jurl cache entries for nearby stores.
- CVS obtains session/x-api-key/cart id from rendered PDP/XHR data, then calls commits/ATP APIs with item/group/store ids and caches per item/group/store.
- Petco hydrates PDP context for catEntryId and price, calls store inventory by physical store id, and calls delivery date API by zip/item.
- Costco batch calls a utility batch route for a UPC group and store, returning status maps and price.
- Walmart/Walmart Canada/Sams patterns are strict about location cookies, fulfillment nodes, and response store validation.

## Price And URL Backfill

- Static recomputer backfills `UPCRetailerData.price` when a valid availability scan finds price and URD has none.
- Batch updater backfills URD price and `knownCarries` for matching UPC/retailer rows.
- Set `availability.price` or `BatchAvailability.price` only when it is non-zero and belongs to the same item/store context.
- Use resolver PDP URLs only when the updater trusts them (`trustUPCResolutionPDPUrl`) or when `getPdpUrlRetailer` can reconstruct a retailer-owned URL.
- Avoid returning generic Instacart URLs unless the retailer intentionally shares Instacart images/ids.

## Test Tactics

For static updaters:

- Construct or load a `UPC`, set retailer data item id, build `UPCRetailerZipAvailability` with retailer id, UPC id, zip, and store id.
- Call `recomputeAvailabilityRetailer(...)` or `recomputeAvailability(...)` directly as existing tests do.
- Assert in-store, ship-to-home, and price when stable.
- Include invalid item/store cases to prove `INVALID` semantics.

For batch updaters:

- Probe `fetchBatchAvailabilityInfo(Store, UPC)` directly for a known store/item.
- Use `withStoreIds(...)` and `setUpcs(...)` to constrain live `@Script` probes.
- Assert emitted `BatchAvailability.itemId`, `storeId`, `retailerEnum`, `result`, and price.
- Avoid full `batchUpdateAvailabilities()` in normal CI tests; if intentionally testing writeback, keep it as an explicit `@Script` probe because it can create/update many URZAs.

Use `@Script` and `@Flaky` consistently for live retailer/proxy probes. Disabled feasibility failures should include store id, zip, UPC/item id, endpoint/PDP URL, request body shape, proxy ladder, response signal, and next route.

## Productionization Checklist

- Store import provides the store id that inventory endpoint expects.
- UPC resolver provides the item id/SKU/variant id that inventory endpoint expects.
- Static updater validates missing item ids and invalid retailer ids.
- Cache keys include store/item/zip/mode/body where needed.
- Status mapping distinguishes unavailable from blocked/unknown.
- Response validation proves item and store context.
- Batch updater is scoped with `setUpcs`, `withStoreIds`, or `prepareForAvailabilityUpdate` when full Cartesian scans would be huge.
- AppConfig parallelism and rollout defaults are conservative.
- Tests cover available, unavailable or invalid, and price/PDP when exposed.
