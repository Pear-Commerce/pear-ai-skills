# Store Import Repo Tactics

Use this reference after the quick skill flow when the task is moving from a browser discovery into code that should behave like Pear production.

## Where Store Import Lives

- Store import hooks usually live on an availability updater, even though the work is not inventory scanning.
- The production hooks are `canImportStoresFromRetailer(RetailPartner)`, `storeImportCountryCodes(RetailPartner)`, `getStoresForZip(Zipcode, RetailPartner)`, and `getAllStores(RetailPartner)`.
- `RetailerStoreLocationsSyncJob` periodically chooses stale retailers and calls `importStoresFromRetailer` when the updater says it can import stores.
- `UPCRetailerZipAvailabilityRecomputer.importStoresFromRetailer` owns persistence, merge, delete, geocode, and retailer-zone refresh behavior.
- `RetailerZipStoreId` is a separate zip-to-store-id mapping cache/table. Some resolver imports populate it, but that is not the same as a complete Store import.

## Production Import Flow

`importStoresFromRetailer(retailer)` does more than call a locator:

- Loads zipcodes for `storeImportCountryCodes`, defaulting to US when the updater does not override.
- Loads existing live `Store` rows for the retailer where `vendorId=0`.
- Calls `getAllStores(retailer)` once if available; otherwise calls `getStoresForZip(zipcode, retailer)` for each zipcode.
- Dedupes by `storeId`, then merges into existing stores by exact `storeId` or address/zip match.
- Copies name, logo, address, phone, `secondaryStoreId`, zip, lat/lng, and country code when provided.
- Geocodes stores with missing or bad zip/lat/lng using address when possible.
- Saves stores asynchronously with bounded importer parallelism from AppConfig.
- Deletes existing live imported stores that are missing from the returned retailer list.
- Calls `Store.updateZipRetailerZonesToUseStore(retailer.id, 1, 15, storesFromRetailer)` when stores changed, so downstream URZAs use the imported stores.

Because missing stores can be deleted, never enable `canImportStoresFromRetailer` for production until the discovered source is complete enough for the retailer estate or the importer intentionally scopes the country/brand.

## Choosing `getAllStores` vs `getStoresForZip`

Prefer `getAllStores(retailer)` when the site or file can return the full estate:

- It avoids N by zipcode HTTP calls during imports.
- It reduces proxy cost and bot-blocking surface area.
- It lets you dedupe globally before the importer sees stores.
- It is the better fit for static CSV/JSON files, search-index dumps, app bootstrap payloads, and APIs with no real zip dependency.

Use `getStoresForZip(zipcode, retailer)` when the locator genuinely needs a zipcode, lat/lng, or radius:

- Keep the radius large enough to avoid sparse-store misses. RuralKing uses a lat/lng locator with a broad radius.
- Include the zipcode or rounded lat/lng in the Jurl cache key.
- Prove that cross-zip duplicates dedupe to the same stable `storeId`.
- Make the method return `null` or empty only when that zipcode truly has no nearby stores; do not swallow bot blocks as empty lists.

## Field Semantics

Populate these fields with the values the rest of the system will need:

- `storeId`: the id accepted by inventory/availability routes. This is the primary key for downstream scanning.
- `secondaryStoreId`: alternate id such as location UUID, display id, node id, or fulfillment id.
- `name`: human-readable store name.
- `address` or `geoAddress`: enough for geocoding and debugging.
- `zip`: normalized with `Store.setZip(...)` or `Zipcode.format(...)`.
- `countryCode`: required for non-US and helpful for multi-country retailers.
- `latitude` and `longitude`: preserve when exposed; importer only geocodes missing/bad values.
- `phone` and `category`: optional but useful for debugging and brand splits.

Do not use a transient session id as `storeId`. If inventory needs one id and display/location pages expose another, use inventory id as `storeId` and keep the other value in `secondaryStoreId`.

## Common Source Patterns

Static file backed:

- `StoreLoaders` loads retailer CSV/JSON from `assets.pearcommerce.com` or `retailer-store-locations` and handles header mapping, country normalization, lat/lng scaling, and generated hash fallback ids.
- CVS, Petco, HEB, Ace, Sams, and Walmart Canada patterns read JSON from `WEB-INF/classes`, normalize stores, then group by `Zipcode.of(store.getFormattedZip())`.
- Use `Lazy.memoize` or a synchronized `initialized` guard plus a concurrent map to avoid reparsing large files.
- For file import tests, assert fixture size, sampled store ids, no duplicate ids, and expected zip grouping.

Public/API locator:

- Meijer uses `/bin/meijer/store/search?locationQuery=<zip>&radius=50`, static proxies, 60 day cache.
- RuralKing uses zipcode lat/lng against a WCS locator with a broad radius, 60 day cache, and maps store names as ids.
- Kroger uses the official location API, bearer refresh logic, NO_PROXY, rate limiting, one day cache, and strict validation of location ids.
- Albertsons/Safeway uses a local locator by lat/lng with `staticUnblocker`, seven day cache, and parses store ids from returned ids/deeplinks.
- Freshop uses `api.freshop.com/1/stores` and keeps a backup JSON file.
- Walgreens fetches all store ids and details with a rate limiter and long store-detail caching.
- Storefront Gateway banners often expose `https://storefrontgateway.<banner>.com/api/stores` with a top-level `{total, items}` payload. Mirror Chrome headers such as `origin`, `referer`, and `x-site-host`; parse `items`; validate `total == items.size()`; prefer `retailerStoreId` over the UUID `id` as `storeId`; normalize `country: Canada` to `CA`; strip phone punctuation; and build `address`/`geoAddress` from address lines, city, province/state, and postal code. If a shared base plan exists, reuse DTOs where they fit, but verify the response wrapper before assuming older `availablePickupStores`/`availablePlanningStores` shapes.

Rendered/page-backed:

- Mercatus parses rendered `/stores` pages, uses render-capable Scrapfly with a wait, caches for 60 days, and extracts ids from DOM ids like `store-list-item-14567`.
- HyVee has both a file-backed importer and a rendered `/aisles-online/stores` directory fallback.
- CVS locator needs a session/x-api-key route for live scraping, but production import currently prefers the file-backed JSON.

## Caching And Concurrency

- Store lists are slow-moving. Typical TTLs are 30 to 120 days; validation pages can be 180 days.
- Use `extraCacheKey` or `customJurlCacheKeySupplier` when a request body, zip, retailer enum, country, headers, store mode, or parser version changes the response.
- Use `waitForActiveIdenticalRequests(true)` when many zips can collapse into the same request.
- Use rate limiters for official APIs or high-volume detail calls.
- The importer parallelism is AppConfig-backed (`availabilities/store-importer-parallelism`, default 8). Keep per-request timeouts and proxy attempts bounded.
- Two local caches can make tests look stale: `databaseContainsRetailerImportedStores` caches for 10 minutes, and `RetailerZipStoreId` caches store ids by retailer/zip for 30 minutes.

## Gotchas

- A zipcode locator can return only nearest stores, not all stores. Completeness matters because production import deletes missing existing imported stores.
- Some chains share platforms. Keep `retailerEnums` and `countryCode` straight so one banner does not import another banner's stores.
- The first store id returned for a zip may be used on the fly when no Store rows exist yet. If a locator returns unstable ordering, this can produce noisy availability checks before import completes.
- Address matching lets the importer merge a store whose id changed, but stable `storeId` still matters for inventory scans and retailer zones.
- Store id `0`, blank ids, or duplicate ids usually become downstream availability failures. Filter or derive ids deliberately.
- If the API works in Chrome but not AWS/proxy, try the full document, app bootstrap JSON, rendered route, state/city route, or mobile/app API before declaring infeasible.
- For non-US retailers, override `storeImportCountryCodes`; otherwise the importer will iterate US zipcodes.

## Test Tactics

Build tests that exercise the same code shape production will use:

- Unit-style parser tests for fixture/static JSON.
- PR reproduction tests that load `WebContent/META-INF/<retailer>/current.json`, sort both live and expected stores by `storeId`, and assert every normalized `Store.SStore` field that the artifact contains.
- Live `@Script` tests for `getStoresForZip` with one dense zip and one sparse zip.
- A completeness assertion when the site exposes total stores or state counts.
- A dedupe assertion for `storeId`.
- A sample assertion for a store found manually in Chrome.
- A country assertion for non-US/multi-country imports.

If a source is incomplete or blocked, keep the probe code and disable the failing live test with a comment listing endpoint, payload, headers, proxy ladder tried, response signal, and next route.

## Productionization Checklist

- `canImportStoresFromRetailer` returns true only after completeness is credible.
- `canUseStoreId(zip, retailer)` returns true when availability scanning needs store ids.
- `getAllStores` is implemented when the source is full-estate.
- `getStoresForZip` is implemented when the source is zip/lat/lng dependent.
- `storeImportCountryCodes` is set for non-US/multi-country retailers.
- Jurl cache keys include zip/body/parser version as needed.
- Store fixture/API result includes stable `storeId`, zip, address, and country.
- Tests document the first working proxy type and disabled failures document all attempted routes.
