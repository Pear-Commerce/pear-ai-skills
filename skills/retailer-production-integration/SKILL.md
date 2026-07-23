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

- `$pear-engineering-workflow` for worktree, pre-PR review, test, and Pear repo rules; follow its worktree decision before editing any repo files
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
10. Run the pre-PR Pear engineering review gate below.
11. Use `$pear-pr-review-flow` to create, update, and monitor the PR.

End state for create/implement requests: production resolver/updater/batch/store/migration classes plus production `@Script` coverage. Do not leave both those production classes and `test/com/pear/retailerFeasibility/**` plan files in the PR unless the user explicitly asks to preserve a research artifact.

For retailer setup-only requests, add only the `RetailPartner` setup, display assets, and fields that are actually proven. Do not add an availability updater, store importer, resolver, static store stub, `locationAgnosticShipToHome = true`, or other availability flags just to make the retailer look wired. If no live availability route has been proven, the production test should assert no updater is registered for the new enum.

## Pre-PR Pear Engineering Review

Before creating retailer integration PRs, run `$pear-engineering-workflow`'s PR-improvement/review checklist on at least one representative completed retailer integration. For multi-retailer work, choose the most complete or highest-risk slice first, fix findings there, then apply the same review lessons across the remaining retailer PR branches before opening PRs. This review happens before `$pear-pr-review-flow`.

## Retailer Module Layout

Keep retailer-specific production code together. For a new standalone retailer, create a package like `src/com/pear/<retailer>/` and put the retailer client/API helpers, DTOs, `ItemIdInfoResolver`, `UPCRetailerZipAvailabilityRecomputer`, optional `BatchAvailabilityUpdater`, store import artifact helpers, and retailer-specific `@SimpleORMDataMigration` class in that package. Prefer a `<Retailer>DataImports` class in the same module for setup and future retailer migrations instead of adding new retailer setup methods to broad catch-all classes such as `DataImports`.

Do not scatter new retailer classes across `com.pear.itemurlupdater`, `com.pear.upcresolution`, and `com.pear.admin` just because their base classes live there. Import the base classes into the retailer package. Put the production `@Script` test in the matching `test/com/pear/<retailer>/` package unless an existing platform module already has a stronger local convention.

## Spring Service Boundaries

Production retailer helpers are Spring services, not static utility bags. Put live-route behavior in a retailer-owned `@Service` client such as `<Retailer>Client`, and inject that client into resolvers, availability updaters, batch updaters, controllers, jobs, and tests through explicit constructor injection. Add `@Autowired` to every non-empty constructor in new or changed Spring classes.

Do not call production behavior through `RetailerClient.resolve(...)` / `RetailerClient.fetch(...)` static methods, static memoized suppliers, static registries, `ManagedResourcesConfig.getBean(...)`, or manual `new <Retailer>Resolver()` / `new <Retailer>AvailabilityUpdater()` from production code or Spring-backed tests. Static constants, enum lists, DTO/nested model classes, regex patterns, and immutable route configuration are fine; behavior that fetches, parses, caches, maps stores, resolves UPCs, checks availability, or builds retailer data belongs on an injectable bean.

Feasibility `*Plan.java` scratch helpers may be static while exploring, but promotion to production must convert them into Spring services before the PR is considered productionized. Before finalizing a retailer PR, scan touched retailer packages for `static`, `new <Retailer...>`, `ManagedResourcesConfig.getBean`, and `Resources.global`; either remove them from behavior paths or explicitly justify the remaining constants/DTOs.

## Class Goals

`RetailPartner` setup migrations register the retailer in Pear's data model. Their goal is to create or complete the retailer row, enum wiring, ecommerce URL, display assets, color, and availability/import flags without overwriting meaningful non-default data that may already exist. These migrations must be idempotent, but should be executed only once by default (as a background task); unless needed for tests, they should not be part of default CI migration runs.

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
- `itemAvailabilityDependsOnZip = true` when any production availability signal varies by store, zip, fulfillment node, or location context; `false` only when every supported availability signal is location-independent.
- `locationAgnosticShipToHome = true` when the live `shipToHomeStatus` route exists and does not consume or vary by store, zip, fulfillment node, or location context. This is the flag that lets Pear reuse ship-to-home availability without rechecking it for every store. Set it for online-only retailers whose checker only writes global `SHIP_TO_HOME`; also set it for hybrid retailers where `IN_STORE` is location-dependent but `SHIP_TO_HOME` comes from a separate global ecommerce signal. Do not set it merely because the retailer has an ecommerce site, and do not set it when delivery/ship availability varies by store, zip, region, fulfillment node, cart context, or selected location.
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

Move live request/parsing code from the plan into the resolver. Return `SRetailerItemData` with item id, PDP URL, name, image, price, UPC evidence, and retailer source when available. Always fill `SRetailerItemData.url` when the route returns a PDP URL or when the PDP can be deterministically built from `itemId` plus `secondaryId`; resolver tests should assert the expected URL, not only the item id. Set `secondaryId` when the retailer needs a second stable product slug/SKU/catalog id to reconstruct PDP or add-to-cart URLs; do not force availability updaters to depend on a scraped `url` string when stable ids can build the URL. For production code, keep passing routes proxy-backed and do not include `Type.NO_PROXY`.

Validate UPC evidence with `UPC.isAUPCMatch(...)`, not direct string matching. Do not gate resolver success on raw `equals`, `contains`, prefix/suffix checks, or hand-written no-country/no-check-digit comparisons against the target UPC. If a retailer field can contain labels, punctuation, multiple identifiers, or a combined MPN/UPC value, extract numeric sections first and call `UPC.isAUPCMatch(...)` on each plausible section. Keep this in a named helper such as `upcEvidenceMatches(...)`, and add focused positive/negative tests for compound evidence instead of scattering ad hoc normalization through the resolver.

Never store a full `http://` or `https://` PDP URL in `SRetailerItemData.itemId` or `UPCRetailerData.itemId` during normal resolver or integration work. `itemId` should be the compact retailer product id, SKU, slug, variant id, or path fragment needed for deterministic reconstruction. Put the full PDP in `SRetailerItemData.url`, and use `secondaryId` for the second stable value when `itemId` alone is not enough. A URL-shaped `itemId` is allowed only as a deliberately documented last resort when the retailer exposes no stable id or id-plus-secondary-id pattern; that exception must be called out in the PR and covered by a test so it cannot become the default table shape.

For shared Instacart-backed retailers, keep the fields and checks separate. `UPCRetailerData.itemId` / `SRetailerItemData.itemId` is the direct retailer-specific id used by the retailer resolver, retailer availability updater, and retailer PDP URL builder. `UPCRetailerData.instacartItemId` is the Instacart product id used by `InstacartAvailabilityUpdater`, Instacart batch updaters, and Instacart list-scraper/list-computation checks. Production code and tests should prove the direct retailer `itemId` updater path first when it exists, and should only rely on `instacartItemId` after the direct path is intentionally absent, invalid, or documented as an Instacart-only integration.

When `secondaryId` is introduced for URL reconstruction, keep resolver outputs internally consistent: set `secondaryId` and also set `url` using the same helper/slug inputs so stored resolver data, review fixtures, and availability URL generation agree. If an updater should later read `secondaryId`, call the deterministic URL builder with `secondaryId`, not with a re-derived value that could drift.

## Availability Recomputer Rules

New availability updater classes should extend `UPCRetailerZipAvailabilityRecomputer`. In user-facing prose this is the availability updater; in code use the actual base class name.

Do not create a `UPCRetailerStaticAvailabilityRecomputer` subclass as a placeholder, as a PDP URL helper, or as a store-import stub. That base class has a final recompute method that writes fixed statuses, and its defaults are `AVAILABLE`; a new static updater therefore asserts item availability for every stored item unless carefully overridden. Use it only when live feasibility has proven fixed-status semantics for the retailer surface, or when maintaining a documented legacy integration. If availability is not proven yet, omit the updater entirely.

Registration:

- Implement `retailerEnums()` on the updater with the retailer enum(s). `UPCRetailerZipAvailabilityRecomputer.getInstance(...)` discovers updater classes from `retailerEnums()` and that discovery is the primary production registration path.
- `RetailPartner.itemUpdateConfiguration.itemUpdaterClass` is metadata/fallback cleanup for blank, stale, or generic defaults. It is useful to keep tidy, but it does not outrank a matching `retailerEnums()` updater. PR descriptions and tests should not imply stale `itemUpdaterClass` metadata would block `retailerEnums()` discovery.
- Production tests should assert `UPCRetailerZipAvailabilityRecomputer.getInstance(enum)` returns the intended updater. Do not rely on `itemUpdaterClass` alone as proof the production updater is registered.

Implement availability checks as store-id based going forward:

- `canUseStoreId(...)` should return `true` for new production availability recomputers; it means Pear will use store-id-based checks.
- `recomputeAvailability(...)` should use the supplied `storeId` whenever any inventory route varies by store, zip, fulfillment node, or location context.
- Map statuses by the dependency of the inventory signal, not by the retailer's marketing label. If availability changes when the store/location context changes, set that result on `inStoreStatus`, even when the endpoint name says delivery, collection, fulfillment, or availability rather than "in store".
- When the endpoint returns explicit separate in-store/pickup and ship-to-home/delivery/ecommerce availability fields, set both statuses from their own fields.
- When one result varies by store/location and another result does not vary by store/location, map the location-dependent result to `inStoreStatus` and the location-independent result to `shipToHomeStatus`.
- When the only proven result is location-independent ecommerce availability, set `shipToHomeStatus` from that result and leave `inStoreStatus` `INVALID`.
- When `shipToHomeStatus` is location-independent, make the checker able to compute that side without a store id and set `RetailPartner.locationAgnosticShipToHome = true` in the migration. Keep `itemAvailabilityDependsOnZip = true` if `inStoreStatus` still varies by store; use `itemAvailabilityDependsOnZip = false` only when every supported status is location-independent.
- Do not mirror in-store status into ship-to-home or ship-to-home status into in-store.
- Never return `AVAILABLE` from `inStoreStatus()` or `shipToHomeStatus()` just because the retailer is live, has a PDP, or accepts ecommerce orders generally. `AVAILABLE` requires live route proof for the supplied item id/UPC/PDP and fulfillment mode. If a mode is unsupported, return `INVALID`; if the route cannot currently be proven, do not register the updater.

URL methods:

- `getPdpUrl(...)` should first build a deterministic PDP URL from `SItemDataWrapper.getItemId()` plus known retailer URL strings/patterns. If item id alone is insufficient, have the resolver set `SRetailerItemData.secondaryId` to the stable slug/SKU/catalog id needed for URL construction, then build from `itemId` + `secondaryId`.
- In this section, `itemId` means the retailer-specific `UPCRetailerData.itemId`, not `instacartItemId`. For Instacart fallback URL or availability behavior, use the Instacart updater/batch/list path explicitly and test it separately from direct retailer URL reconstruction.
- Treat URL-shaped item ids as invalid input by default. Do not add fallback logic like `if itemId startsWith http return itemId`; that silently blesses bad `UPCRetailerData` rows and makes future scans depend on saved URLs. If an existing legacy retailer already has URL-shaped item ids, isolate that handling to the legacy retailer with an explicit comment and regression test.
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
- Treat the persisted store id as a cross-table contract. Inspect the current entity annotations, migrations, and schema for every downstream copy, not only `Store.storeId`: `Store.storeId` is currently `varchar(100)`, while `UPCRetailerZipAvailability.storeId` is `varchar(25)`, and the same value also flows into `RetailerZone.zoneId` and `ZipRetailerZone.zoneId`. The encoded value must fit the narrowest column in the complete production path; never approve an id merely because it fits `Store`.
- Treat the ASCII hyphen (`-`) as reserved Instacart-zone syntax. `ZipRetailerZone.isInstacart` is a generated column based on `zoneId LIKE '%-%'`, and store import copies a direct retailer's store id into `zoneId`. Therefore any hyphen anywhere in a non-Instacart store id—including the four hyphens in a UUID—can incorrectly set `isInstacart = 1` and route/filter the store as Instacart. Other legacy paths also use `contains("-")` or `LIKE '%-%'`; do not persist dashed direct-retailer store ids.
- When an upstream store id exceeds the narrowest column width or contains a hyphen, use a retailer-owned reversible compact codec rather than a lossy hash or simple dash replacement. The encoded alphabet must exclude `-`, the output must fit the narrowest downstream column, and the full upstream identifier must be recoverable. Encode at the store-import boundary before the id reaches `Store`, `RetailerZone`, `ZipRetailerZone`, or availability rows; decode immediately before every retailer API request that needs the upstream id. Keep raw upstream ids accepted during rollout.
- Test exact known upstream-to-persisted mappings, output length at or below the narrowest column width, absence of hyphens, known-value reverse decoding, full-range/random round trips when applicable, invalid/raw compatibility, import encoding, and live availability through an encoded id. For a non-Instacart retailer, explicitly prove the persisted store/zone id cannot satisfy the generated `isInstacart` predicate.

It is acceptable to load stores from the normalized JSON artifact produced during feasibility for the first production pass because it is fast and stable. Keep the original live store scraping code in the `@Script` production test so the store list can be regenerated and verified later.

The normal store import job updates retailer zones after `importStoresFromRetailer(...)` detects changed stores. Prefer wiring the retailer into that job-backed path over adding one-off zone refresh calls to every setup or JSON seed migration. Do not block a PR merely because a JSON-backed store import lacks an explicit `Store.updateZipRetailerZonesToUseStore(...)` call when the intended rollout is import-only or job-backed. Add a manual zone rebuild only when the PR bypasses the job path and immediate refreshed `RetailerZone` / `ZipRetailerZone` coverage is required.

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

For shared storefront platforms, validate that Pear `Store.storeId` rows are the same merchant/fulfillment ids the live availability endpoint accepts before choosing `MultiUPCStoreIdBatchAvailabilityUpdater`. If storefront bootstrap config or merchant config APIs expose the authoritative merchant ids and the DB store rows are stale, numeric, or locator-specific, build the batch stream from those live storefront merchant configs instead. In that case, keep missing-store inference disabled unless the store import has been fixed, and let writeback happen only where matching `RetailerZone` rows exist.

## Production @Script Test

Add a focused `@Script` test, usually under `test/com/pear/itemurlupdater/**` or `test/com/pear/upcresolution/**` following nearby patterns. The test should cover:

- `RetailPartner.forEnumName(...)` resolves the migrated retailer.
- `ItemIdInfoResolver.getInstance(...)` returns the new resolver.
- multiple UPC/name pairs resolve to expected item ids and URLs.
- `requiresName()` matches the resolver implementation: name-dependent routes are tested with names, and `requiresName=false` routes are tested with at least one UPC that has no name set.
- `getStoresForZip(...)` or `getAllStores(...)` returns real stores.
- the original live store scraping/import code can be rerun, even if production uses the JSON artifact.
- in-store availability sets `IN_STORE` status when inventory varies by store/location, regardless of whether the upstream endpoint labels it pickup, delivery, collection, or fulfillment.
- ship-to-home availability sets `SHIP_TO_HOME` status when a separate location-independent shipping/ecommerce signal exists, or when the only proven availability signal is location-independent ecommerce stock.
- when both location-dependent and location-independent inventory signals exist, the test proves they map to `IN_STORE` and `SHIP_TO_HOME` separately.
- if `locationAgnosticShipToHome = true`, the retailer setup test asserts it, and the ship-to-home recompute test should pass a blank/null `storeId` or prove that changing store ids does not change the ship-to-home status.
- `RetailPartner.getAvailabilityUpdater(...)` returns the intended recomputer.
- batch updater behavior when one is added.

For PDP URL fixes, strongly prefer an abridged resolution-to-availability `@Script` instead of only a pure URL-helper unit test. Treat this as the expected production proof whenever the change touches PDP URL reconstruction, saved URL fallback removal, platform URL translation, or `secondaryId` handoff behavior; if you do not add it, explain why the shorter test still covers the production data path. The script should:

- call the real `ItemIdInfoResolver` directly when feasible, or otherwise build resolver-like `SRetailerItemData` containing `itemId`, `secondaryId`, and the resolver's `url`
- manually seed direct `UPCRetailerData` / `SItemDataWrapper` on a `UPC` for `retailer.enumName`
- construct `UPCRetailerZipAvailability`, including a stale/wrong saved PDP URL when guarding against saved-url fallback
- run the shortest real availability scan path that reaches the updater, then assert statuses and the final URL from the updater
- seed a URL-shaped `itemId` negative case when the bug class is URL storage; assert the updater does not return that URL unless the PR documents an intentional legacy exception
- cover both new/current and legacy `RetailPartner` enum rows when the retailer has historical rows, shared-platform updaters, or historical URL formats
- lazily create or in-memory construct test `RetailPartner`, `UPC`, and `UPCRetailerData` rows as needed, but do not depend on unguaranteed shared seed rows
- explicitly prove the updater does not read platform fallback data or saved availability URLs when the intended source is direct retailer `UPCRetailerData`

Reuse the plan test's sample UPCs, names, store ids, expected item ids, expected URLs, proxy route assertions, and comments where practical. Keep the test out of CI with `@Script`.

## PR Reviewer Audit Evidence

Make every retailer-production PR description easy to audit without requiring reviewers to reconstruct identifiers from the diff. Include a dedicated test-examples or reviewer-audit section that:

- names the representative production test method(s)
- lists the exact upstream store id(s) asserted or selected
- lists the exact persisted Pear store id when it differs from the upstream id because of encoding or translation
- lists the exact retailer item id(s), secondary id(s), UPC(s), and expected PDP URL used by resolver or availability tests, including only fields relevant to that integration
- states the expected status/result for each availability example without depending on a mutable total store count
- explains any identifier transformation boundary, such as encoding on store import and decoding before retailer API calls
- states the persisted store-id length and narrowest affected column width when transformation is required, and explicitly calls out that a non-Instacart persisted id contains no hyphen so `ZipRetailerZone.isInstacart` is not incorrectly generated as `1`

Use real non-secret identifiers that already appear in tests. Never include cookies, CSRF tokens, authorization values, customer ids, or other session credentials in the PR description.

## Completion

Before opening the PR:

- remove the superseded feasibility plan files once production classes/tests contain the reusable logic
- run focused tests or explain why they could not run
- run the Pear engineering cleanup pass
- ensure no passing production code uses `Type.NO_PROXY`
- summarize required proxy types, store import source, item-id route, availability route, and whether batch updating was added
- include the required PR reviewer-audit evidence with representative store and item identifiers
- create/update and monitor the PR with `$pear-pr-review-flow`
