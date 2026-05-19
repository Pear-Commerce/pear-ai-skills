---
name: retailer-production-integration
description: Create, modify, wire, or productionize Pear retailer integration classes in api.pearcommerce.com, including UPCRetailerZipAvailabilityRecomputer availability updaters, BatchAvailabilityUpdater classes, ItemIdInfoResolver classes, RetailPartner setup migrations, store imports, and @Script production verification after a retailer feasibility plan proves usable routes. Use after focused feasibility when the user asks to create updater/scanning/resolver/store-import support for retailer Y or to implement retailer Y; the end state should be production classes, not both production classes and plan files.
---

# Retailer Production Integration

Use this skill when the user asks to create, update, wire, or productionize any Pear retailer production integration class:

- `UPCRetailerZipAvailabilityRecomputer` subclasses, often referred to as availability updaters
- `BatchAvailabilityUpdater` subclasses
- `ItemIdInfoResolver` subclasses
- `RetailPartner` setup migrations and store import wiring needed by those classes

If no proven feasibility plan, PR, or route exists, first use the relevant feasibility skill unless the user explicitly asks for a disabled skeleton. For requests phrased as "create an updater", "create scanning", "create a resolver", "create availability", or "implement retailer Y", the feasibility work is the route-finding phase and this skill is the implementation phase. Production code should be based on live, proxy-backed routes that already passed feasibility, not on local Chrome, local curl, local app, `NO_PROXY`, copied payloads, screenshots, or fixtures.

## Required Skills

Start with:

- `$pear-engineering-workflow` for worktree, review, test, and Pear repo rules; follow its worktree decision before editing any repo files
- `$pear-proxy` when moving any `LoggedJurl`/`JurlProxyFallback` route into production
- `$pear-pr-review-flow` before creating or updating the PR

Use focused feasibility skills as needed to understand the source plan:

- `$retailer-upc-resolution-feasibility`
- `$retailer-availability-scanning-feasibility`
- `$retailer-store-import-feasibility`

## Operating Goal

Turn a proven retailer feasibility scan into production code:

1. Read the existing `test/com/pear/retailerFeasibility/**/<Retailer>Plan.java` and `*PlanTest.java`.
2. Find nearby production patterns with `rg` before adding new abstractions.
3. Create or reuse a retailer-owned module package such as `src/com/pear/<retailer>/`.
4. Add an idempotent `@SimpleORMDataMigration` in that module that lazily creates or updates the `RetailPartner` row.
5. Create the `ItemIdInfoResolver`, moving live route code and DTOs out of the plan.
6. Create the `UPCRetailerZipAvailabilityRecomputer`, moving availability and store import logic out of the plan.
7. Create a `BatchAvailabilityUpdater` only when it is efficient and justified.
8. Add an `@Script` production verification test that can rerun the original route checks.
9. Delete the feasibility plan files after their useful code and rerun logic have moved into production tests/classes.
10. Use `$pear-pr-review-flow` to create, update, and monitor the PR.

End state for create/implement requests: production resolver/updater/batch/store/migration classes plus production `@Script` coverage. Do not leave both those production classes and `test/com/pear/retailerFeasibility/**` plan files in the PR unless the user explicitly asks to preserve a research artifact.

## Retailer Module Layout

Keep retailer-specific production code together. For a new standalone retailer, create a package like `src/com/pear/<retailer>/` and put the retailer client/API helpers, DTOs, `ItemIdInfoResolver`, `UPCRetailerZipAvailabilityRecomputer`, optional `BatchAvailabilityUpdater`, store import artifact helpers, and retailer-specific `@SimpleORMDataMigration` class in that package. Prefer a `<Retailer>DataImports` class in the same module for setup and future retailer migrations instead of adding new retailer setup methods to broad catch-all classes such as `DataImports`.

Do not scatter new retailer classes across `com.pear.itemurlupdater`, `com.pear.upcresolution`, and `com.pear.admin` just because their base classes live there. Import the base classes into the retailer package. Put the production `@Script` test in the matching `test/com/pear/<retailer>/` package unless an existing platform module already has a stronger local convention.

## Class Goals

`RetailPartner` setup migrations register the retailer in Pear's data model. Their goal is to create or complete the retailer row, enum wiring, ecommerce URL, display assets, color, and availability/import flags without overwriting meaningful non-default data that may already exist.

`ItemIdInfoResolver` classes translate Pear product identity into retailer product identity. Their goal is to take a UPC and, when needed, product name/brand context, then return the retailer item id, PDP URL, and supporting product metadata with enough UPC evidence for UPCResoGraph to trust the match. They should not own availability scanning unless the retailer route truly combines identity and stock.

`UPCRetailerZipAvailabilityRecomputer` subclasses compute current buyability for an already-resolved retailer item in a location context. Their goal is to use store-id-based checks for local inventory, separate shipping checks when present, produce correct `IN_STORE` and/or `SHIP_TO_HOME` statuses, expose PDP/add-to-cart URLs, and provide the retailer store import methods needed for those checks.

`BatchAvailabilityUpdater` classes are throughput-oriented companions for bulk availability refreshes. Their goal is to reuse the same availability semantics as the recomputer while reducing request cost for many item/store checks, either through a real batch endpoint or a simple delegating implementation when all underlying inventory calls use static/cheap proxy routes.

## RetailPartner Migration

Retailer setup is part of productionization. Add an idempotent `@SimpleORMDataMigration` in a retailer-owned data import class, usually `src/com/pear/<retailer>/<Retailer>DataImports.java`. If the retailer is part of an existing shared platform module, use that platform's data import class. Avoid adding new standalone retailer setup methods to broad catch-all classes such as `src/com/pear/admin/DataImports.java`.

Keep migration method names stable after merge because `DataMigrationRecord` keys off method name. If moving a not-yet-merged PR migration into a better module, preserve the method name unless there is a deliberate reason to make it a new migration.

Use lazy create/update:

- load with `RetailPartner.forEnumName(enumName)`
- create only when missing
- set any unset fields needed for the integration
- do not overwrite non-default fields that may have been changed by another migration, admin action, or user

Required fields:

- `name`
- `enumName`
- `ecommerceUrl`

Usually set:

- `live = true` once the production integration is intended to run
- `partnerType = PartnerType.NONE` unless a real partner/API/pixel relationship exists
- `itemUpdateConfiguration = new ItemUpdaterConfiguration()` when absent
- `itemUpdateConfiguration.itemUpdaterClass` only when no updater is discovered by `retailerEnums()` or when cleaning a known stale/default value; do not treat it as taking precedence over `retailerEnums()` discovery
- `itemAvailabilityDependsOnZip = true` for store-specific availability checks, `false` for location-independent checks
- `locationAgnosticShipToHome = true` when ship-to-home availability exists and does not vary by location
- `availabilitySharedImagesAndIds = null` for a standalone retailer unless it intentionally shares a platform resolver/updater
- `servicesEverywhere = false` and `servicesEverywhereCanada = false` for now unless the user or existing platform pattern says otherwise

Logo and display:

- Find the best real retailer logo and upload it to S3 through the repo's normal logo/assets flow. This is mandatory for production retailer setup, not best-effort.
- Do not leave a direct third-party logo URL, local file path, data URL, or runtime migration upload as the production value. If local credentials, CI, or the workstation cannot upload, use a temporary script or `devops/jsp.sh` on a live box to perform the upload through Pear infrastructure, then hardcode the resulting Pear asset URL.
- After uploading, verify the Pear asset URL returns HTTP 200 and an image content type, remove any temporary upload script/JSP/test, and use only that uploaded URL in the migration.
- Set `style.logo`, `logoUrl`, `buttonColor`, and `logoType` as well as practical.
- Choose `logoType` based on the asset shape, usually `SQUARE` for square/rectangular marks and `ROUND` only when the logo is naturally circular.

Leave unset/false unless specifically needed:

- `instacartId`
- `instacartCategory`
- `unata`
- `doordashId`
- `isVendor`

## ItemIdInfoResolver Rules

For direct successful UPC/item-id routes from the feasibility plan, prefer a direct resolver:

- `canResolveDirectly()` returns `true`
- `canGenerateCandidates()` returns `false`
- `allowImageTinEyeDirectCompare()` returns `false`
- `requiresName()` returns `true` only when the route needs the UPC's name/brand text to search
- `isItemDetailsSource()` returns `false`
- `isUPCResoGraphDataSource()` remains `true`
- `canCheckInStock(...)` returns `false` unless the resolver truly performs stock checks

Make `requiresName()` match the actual live route inputs, not just the method signature you happened to copy from the plan. If `_resolveItemIdInfo(...)`, a client helper, or search route consumes `item.name()`, `buildLikelyNameOrBrandSearchTerm(...)`, or any name/brand hint to find candidates, `requiresName()` must be `true` and the production `@Script` test should use multiple UPC/name pairs. If the route is exact-UPC/barcode-only, `requiresName()` can be `false`, but do not pass a name-shaped parameter through the client API; keep the helper signature UPC-only and add a no-name resolver assertion so reviewers can trust the contract.

Move live request/parsing code from the plan into the resolver. Return `SRetailerItemData` with item id, name, image, price, UPC evidence, and retailer source when available. Set `secondaryId` when the retailer needs a second stable product slug/SKU/catalog id to reconstruct PDP or add-to-cart URLs; do not force availability updaters to depend on a scraped `url` string when stable ids can build the URL. Validate UPC evidence with `UPC.isAUPCMatch(...)` or equivalent normalization. For production code, keep passing routes proxy-backed and do not include `Type.NO_PROXY`.

When `secondaryId` is introduced for URL reconstruction, keep resolver outputs internally consistent: set `secondaryId` and also set `url` using the same helper/slug inputs so stored resolver data, review fixtures, and availability URL generation agree. If an updater should later read `secondaryId`, call the deterministic URL builder with `secondaryId`, not with a re-derived value that could drift.

## Availability Recomputer Rules

New availability updater classes should extend `UPCRetailerZipAvailabilityRecomputer`. In user-facing prose this is the availability updater; in code use the actual base class name.

Registration:

- Implement `retailerEnums()` on the updater with the retailer enum(s). `UPCRetailerZipAvailabilityRecomputer.getInstance(...)` discovers updater classes from `retailerEnums()` and that discovery is the primary production registration path.
- `RetailPartner.itemUpdateConfiguration.itemUpdaterClass` is metadata/fallback cleanup for blank, stale, or generic defaults. It is useful to keep tidy, but it does not outrank a matching `retailerEnums()` updater. PR descriptions and tests should not imply stale `itemUpdaterClass` metadata would block `retailerEnums()` discovery.
- Production tests should assert `UPCRetailerZipAvailabilityRecomputer.getInstance(enum)` returns the intended updater. Do not rely on `itemUpdaterClass` alone as proof the production updater is registered.

Implement availability checks as store-id based going forward:

- `canUseStoreId(...)` should return `true` for new production availability recomputers; it means Pear will use store-id-based checks.
- `recomputeAvailability(...)` should use the supplied `storeId` for pickup/local inventory checks.
- Set `inStoreStatus` only when the retailer returns a store-specific pickup/in-store result or the in-stock result changes with store.
- Set `shipToHomeStatus` only when the retailer returns a separate shipping/ecommerce availability result.
- Do not mirror in-store status into ship-to-home or ship-to-home status into in-store.

URL methods:

- `getPdpUrl(...)` should first build a deterministic PDP URL from `SItemDataWrapper.getItemId()` plus known retailer URL strings/patterns. If item id alone is insufficient, have the resolver set `SRetailerItemData.secondaryId` to the stable slug/SKU/catalog id needed for URL construction, then build from `itemId` + `secondaryId`.
- Do not default to `Optional.ofNullable(itemData.getSRetailerItemData()).map(data -> data.url).orElseGet(itemData::getLink)` as the primary PDP strategy. `SRetailerItemData.url`, `UPCRetailerData.linkUrl`, and `itemData.getLink()` are fallback evidence only after deterministic id-based construction is impossible or unavailable.
- For retailer-specific PDP links, read direct retailer item data first: `item.getRetailerDataIfPresent(retailer.enumName, false, true)` or the closest local pattern. Do not silently fall back to `item.getPlatformDataIfPresent(retailer.availabilitySharedImagesAndIds)` from `getPdpUrl(...)` / `getPdpUrlRetailer(...)`; platform-shared data can carry the wrong sibling retailer's merchant id, option id, slug, store context, or saved URL. Only use shared-platform data when the user explicitly asks for that behavior or the integration's contract truly says the direct retailer row is absent, and then document and test the translation.
- Do not fall back to `availability.getPDPUrlSavedFromAvailabilityCheck()` when deterministic URL reconstruction from stored item data is available. A saved availability URL is often the stale thing being fixed, especially for platform retailers where old scans stored merchant-scoped query params.
- If no stable id-based PDP pattern exists, use the resolved URL as a fallback and document why URL reconstruction cannot be done from stored ids.
- Availability recompute methods should not persist PDP URLs. Never call `availability.setPDPUrlSavedFromAvailabilityCheck(...)`, including with `result.productUrl`, `getPdpUrl(...)`, `StringUtils.defaultIfBlank(result.productUrl, getPdpUrl(...))`, resolver URLs, or link fallbacks. Do not add or retain shared post-recompute auto-fill blocks that persist `getPdpUrl(...)` onto the availability. Keep PDP URL construction in `getPdpUrl(...)`/resolver data, and let availability scans focus on availability fields.
- `getAtcUrl(...)` builds add-to-cart/direct-to-cart links.
- `supportsMultipleAddToCart(...)` means `getAtcUrl(...)` can accept multiple items and build one link containing all of them.
- Ignore `getUrlForConfiguration(...)`; do not design the integration around it.
- `supportsOnTheFlyAvailabilityCheck(...)` is unused; implement the required override only to satisfy the abstract class/local pattern.

Store import methods:

- Put store import logic in `getStoresForZip(...)` and/or `getAllStores(...)`.
- `canImportStoresFromRetailer(...)` returns `true` when those methods are implemented.
- `storeImportCountryCodes(...)` should return the country codes where the retailer operates.
- Do not override `determineCountryCodes(...)` unless the user asks; it should usually derive from `storeImportCountryCodes(...)` and retailer fields.
- Treat `canUseStoreIdAndDatabaseContainsRetailerImportedStores(...)` as final infrastructure; do not override or change it during retailer production work.

It is acceptable to load stores from the normalized JSON artifact produced during feasibility for the first production pass because it is fast and stable. Keep the original live store scraping code in the `@Script` production test so the store list can be regenerated and verified later.

Do not touch infrastructure helpers unless the task is explicitly about infrastructure:

- `addUnsavedAvailabilitiesToResolveInBackground(...)`
- `sendComputeRequest(...)`
- `submitToAvailabilitiesService(...)`
- `submitToAvailabilitiesSqs(...)`
- `realtimeAvailabilities()`
- `getCurrentPreprocessQueueLength()`
- `ON_BOX_RETAILER_IDS()`
- `copyFields(...)`
- updater `getInstance(...)`, `getClass(...)`, `getDefinedClass(...)`, and `initReflections()`

## BatchAvailabilityUpdater Rules

Create a batch updater only when one of these is true:

- the retailer supports efficient batched lookups
- inventory scanning uses only static/cheap proxy types, especially all `STATIC`

If the availability recomputer already uses all-static proxies and per-item/per-store checks are acceptable, prefer a delegating batch updater that calls the recomputer rather than duplicating logic. Otherwise, implement a true `BatchAvailabilityUpdater` only when the retailer API returns many item/store records per request or another existing batch pattern closely matches.

## Production @Script Test

Add a focused `@Script` test, usually under `test/com/pear/itemurlupdater/**` or `test/com/pear/upcresolution/**` following nearby patterns. The test should cover:

- `RetailPartner.forEnumName(...)` resolves the migrated retailer.
- `ItemIdInfoResolver.getInstance(...)` returns the new resolver.
- multiple UPC/name pairs resolve to expected item ids and URLs.
- `requiresName()` matches the resolver implementation: name-dependent routes are tested with names, and `requiresName=false` routes are tested with at least one UPC that has no name set.
- `getStoresForZip(...)` or `getAllStores(...)` returns real stores.
- the original live store scraping/import code can be rerun, even if production uses the JSON artifact.
- in-store availability sets `IN_STORE` status when store-specific inventory exists.
- ship-to-home availability sets `SHIP_TO_HOME` status when separate shipping availability exists.
- if `locationAgnosticShipToHome = true`, the ship-to-home test should not pass a `storeId`.
- `RetailPartner.getAvailabilityUpdater(...)` returns the intended recomputer.
- batch updater behavior when one is added.

For PDP URL fixes, strongly prefer an abridged resolution-to-availability script instead of only a pure URL-helper unit test. Treat this as the expected production `@Script` proof whenever the change touches PDP URL reconstruction, saved URL fallback removal, platform URL translation, or `secondaryId` handoff behavior; if you do not add it, explain why the shorter test still covers the production data path. The script should:

- build resolver-like `SRetailerItemData` containing `itemId`, `secondaryId`, and the resolver's `url`
- manually seed direct `UPCRetailerData` / `SItemDataWrapper` on a `UPC` for `retailer.enumName`
- construct `UPCRetailerZipAvailability`, including a stale/wrong saved PDP URL when guarding against saved-url fallback
- call the availability updater URL path, or the shortest availability scan path that reaches it, and assert the final URL
- cover both new/current and legacy retailer examples for shared-platform updaters or retailers with historical URL formats
- lazily create or in-memory construct test `RetailPartner`, `UPC`, and `UPCRetailerData` as needed, but do not depend on unguaranteed shared seed rows
- explicitly prove the updater does not read platform fallback data or saved availability URLs when the intended source is direct retailer `UPCRetailerData`

Reuse the plan test's sample UPCs, names, store ids, expected item ids, expected URLs, proxy route assertions, and comments where practical. Keep the test out of CI with `@Script`.

## Completion

Before opening the PR:

- remove the superseded feasibility plan files once production classes/tests contain the reusable logic
- run focused tests or explain why they could not run
- run the Pear engineering cleanup pass
- ensure no passing production code uses `Type.NO_PROXY`
- summarize required proxy types, store import source, item-id route, availability route, and whether batch updating was added
- create/update and monitor the PR with `$pear-pr-review-flow`
