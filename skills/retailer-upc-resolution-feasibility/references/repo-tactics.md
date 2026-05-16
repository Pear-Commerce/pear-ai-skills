# UPC Resolution Repo Tactics

Use this reference when moving from "I found a possible product" to a resolver that graph search can trust.

## Where Resolvers Plug In

- `ItemIdInfoResolver` discovers resolver subclasses through Reflections and creates instances through Spring resources.
- `ItemIdInfoSingleResolver` is the usual single-retailer base.
- `ItemIdInfoRetailerResolver` supports platform/multi-retailer resolvers and sorts retailers by live status, product count, and optional DMA coverage.
- `MultiRetailerMultiIdResolver` is useful when one platform serves many retailers. It loops sorted live retailers, caps errors, and can cap platform retailer checks through graph config.
- `DomSelectorItemIdInfoResolver` is a configurable DOM/JS selector engine for search/PDP parsing.
- `SearchHydrateItemIdSingleResolver` is the pattern for cheap search results followed by parallel PDP/API hydration.
- `GoogleMetadataSingleRetailerResolver` and `GoogleCandidateSearchConfig` are fallback candidate generators when retailer-owned search is weak.

## Direct Resolution vs Candidates

Implement direct `_resolveItemIdInfo(...)` when a deterministic route can prove the exact UPC:

- UPC search returns one product with UPC/GTIN evidence.
- PDP URL can be derived from UPC or item id.
- PDP embedded JSON exposes UPC/GTIN for the target.
- A platform API can fetch product by UPC.

Implement `_getItemIdInfoCandidates(...)` when the route is search-first or name-first:

- Return multiple `SRetailerItemData` candidates with `itemId`, `url`, `name`, image, brand, size, price, and any UPC evidence.
- Let graph search rank candidates by UPC, name, brand, size, assortment, image, and price.
- Set `canGenerateCandidates()` behavior by returning candidates even when UPC evidence is partial, but do not claim a direct match without UPC evidence.

If one candidate has matching UPC evidence, direct resolution is faster and less noisy than forcing graph search to rediscover it.

## Graph Search Behavior To Respect

- `UPCResoGraphItemIdInfoResolvers` runs direct resolvers and candidate resolvers, skips duplicate resolver classes, and treats platform resolvers separately.
- In UPC-only mode, graph search prefers resolvers that do not require name. In non-UPC/name mode, it includes name-required resolvers and Google candidates.
- Resolver order matters: platform resolvers run before single-retailer resolvers, and multi-retailer checks may be capped for extreme optimism modes.
- Incremental graph mode skips resolvers when persisted item data already has IDs for that resolver's retailer.
- `resolveItemIdInfo` will invalidate a direct result with mismatched UPC unless `trustMismatchedUPC()` is explicitly true.
- `chatGPTValidateCandidates()` can ask GPT to validate top candidates, but the resolver should still provide structured evidence.
- `shouldRejectOnWordOverlap` and candidate comparison penalize weak name overlap, mismatched size/brand, price outliers, low-quality images, and extra words.

## `SRetailerItemData` Fields That Matter

Fill the fields the graph can use:

- `retailerEnumSource`: especially for platform resolvers.
- `itemId`: the id used by availability updaters.
- `secondaryId`: SKU/variant id when PDP or availability needs both ids.
- `url`: canonical PDP URL, not a generic search or Instacart URL unless the platform is intentionally Instacart.
- `upc` or `ean`: normalized product code evidence.
- `name`, `brand`, `size`, `description`: graph matching signals.
- `image` or `images`: image comparison and candidate quality signal.
- `price`: useful for candidate sanity and later URD backfill.
- `storeId`: only when the resolver route is store-scoped and the store id is meaningful for the result.

For variant-heavy retailers, store the product group id in `itemId` only if availability and PDP URL can work with it. Otherwise use the variant/SKU id as `itemId` and keep group id in `secondaryId` or encoded `itemId` as existing resolvers do.

## Evidence Patterns From The Repo

- CVS searches by normalized UPC, falls back to Google name search, then parses product script data from PDP. It encodes `groupId|variantId`, verifies UPC from image URLs, and stores `secondaryId`.
- Petco searches Google for PDPs, parses `__NEXT_DATA__` composed variants, matches UPC per variant, then uses Constructor search to recover the correct variant URL.
- HyVee uses Google search for UPC-like terms, then parses `application/ld+json` on the PDP for `sku`, `gtin13`, brand, image, price, and name.
- Costco uses rendered search with Scrapfly browser data, finds the search XHR, and converts the search API payload into `SRetailerItemData`.
- Freshop, CityHive, Mercato, Rosie, EGrowcery, Unata, and Mercatus show platform patterns where zip/store context and goal (`FIND_ITEM_ID` vs `IN_STOCK_CHECK`) change cache TTLs and request shape.

## Search Term Strategy

- Start with direct UPC search. Try normalized GTIN12, no country code/no check digit variants only when the retailer demonstrably indexes them.
- If UPC search fails, use `buildLikelyNameOrBrandSearchTerm(item)` and `buildNameCandidates(...)` so graph-known brand/vendor data contributes to search terms.
- Include distinctive size words when the site returns many variants.
- Avoid accepting the first name match. Hydrate the PDP and verify UPC/GTIN, variant SKU, or a strong combination of name/brand/size/image evidence.
- Google `site:` search is a fallback, not the first stop, unless the retailer's own search is blocked or unusable.

## DOM Selector Resolver Gotchas

`DomSelectorItemIdInfoResolver` is quick to configure but easy to misuse:

- Search selectors are assumed to line up by index. If names, URLs, prices, and images have different counts, fields can mix across products.
- Use PDP selectors or `fetchPDPAfterSearch` when search pages do not expose UPC/GTIN.
- `Source.JS` selectors parse script data and can be better than brittle visible DOM.
- For store/zip-specific results, the base fetch chooses provided zip, largest retailer zips, or fallback zips like `53202` and `60606`; include zip in cache behavior when responses differ.
- The base request path uses `skipIfRequestRecentlyFailed`, negative caching, retries, concurrent queues, and `extraCacheKey(retailerEnums)`. Override carefully if the site needs shorter cache or different proxy order.

## Caching And Proxy Tactics

- UPC/PDP metadata is slow-moving. Common TTLs are 30 days; validation routes can be 180 to 500 days; Google/GPT helpers often cache 30 to 90 days.
- Use shorter TTLs for `Goal.IN_STOCK_CHECK` when resolver data depends on store/zip availability.
- Include body, zip, store id, retailer enum, parser version, and proxy response mode in cache keys when any of those change response content.
- Use `waitForActiveIdenticalRequests(true)` for popular UPC/PDP routes to collapse concurrent graph runs.
- Use `skipIfRequestRecentlyFailed(true)` and `negativelyCacheIfAllFail(true)` for expensive/brittle endpoints so graph runs do not stampede a blocked route.
- Try static first when possible, then Unblocker, ZenRows scrape/render, and Scrapfly render/ASP render. Render only when content or XHR capture requires it.

## Validation Gotchas

- UPC mismatch invalidates direct resolver results unless `trustMismatchedUPC()` returns true. Do not override this lightly.
- UPCs hidden in image filenames can be missing country code or check digit. Normalize and compare with `UPC.isAUPCMatch(...)`.
- Some retailers return unrelated products for short UPC variants. Verify the "results for" or product data before trusting search output.
- Some PDPs expose a product group UPC while variants have different UPCs. Check variant arrays, size selectors, or composed item maps.
- A PDP URL may not change when size changes. Find the variant-specific API/search result URL if clickthrough needs the right size.
- A resolver that returns only Instacart item ids should not be treated as a retailer-owned item id unless the retailer is intentionally using Instacart IDs.
- `item.creationSteps` can cause `resolveItemIdInfo` to skip a resolver unless graph context is present, so test direct resolver methods and end-to-end graph behavior separately.

## Store/Zip-Aware Resolution

- `canCheckInStock(retailer)` indicates a resolver can use stock context, but most item ID resolvers should not perform full inventory scanning.
- If search results depend on store or zip, pass store/zip through method parameters and include them in cache keys.
- Resolver-provided `_getStoreIdsToZips` can populate `RetailerZipStoreId` and associated store/zip records, but it does not replace the store import playbook unless it returns complete store objects.

## Script Probe Tactics

- For pure parsing, use `@Script` fixture probes while code lives in retailer feasibility packages.
- For live routes, use `@Script` probes and assert `itemId`, `url`, and UPC match.
- For graph integration, prefer `UPCResolutionUtilities.testMultiRunUPCResolution(...)` when a production resolver is added.
- Test one direct UPC path and one name/PDP hydration path when both exist.
- Include a negative or mismatched UPC case when the site is known to return unrelated products.
- Disabled failing probes should name the sample UPC/name, endpoint or PDP, proxy ladder tried, response signal, and next route.

## Productionization Checklist

- Resolver class is discoverable and annotated consistently with existing resolvers.
- `retailerEnum()` or `getRetailers()` returns live enum names exactly.
- `requiresName()`, `numberOfNameVariants()`, `isUPCResoGraphDataSource()`, `chatGPTValidateCandidates()`, and Google config are intentional.
- Direct resolver returns only UPC-proven results.
- Candidate resolver returns rich `SRetailerItemData`, not just ids.
- Cache keys distinguish zip/store/body/parser version where needed.
- `@Script` probes verify item id, URL, UPC evidence, and first working proxy type.
