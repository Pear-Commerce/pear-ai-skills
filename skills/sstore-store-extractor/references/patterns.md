# Store Extraction Patterns

This file is the north star for extracting `SStore`-style retailer store lists in `api.pearcommerce.com`.

Use it for two things:

- choosing the extraction pattern
- deciding what Java implementation shape should be saved into the retailer's `EXTRACTION.md`

## Core References

- `src/com/pear/entities/inventory/Store.java`
- `test/com/pear/retailerFeasibility`
- `test/com/pear/itemurlupdater`
- `WebContent/META-INF/WholeFoods_CA_Stores.json`
- `WebContent/META-INF/Metro_CA_Stores.json`

## Java Note Expectation

For every retailer extraction, `EXTRACTION.md` should include a `Java Implementation` section.

That section should usually contain:

- one compact Java method skeleton
- the request or page URL constants
- the parser entrypoint
- dedupe logic
- `Store.SStore` mapping
- the file write target

Each pattern below should be read not just as a scraping technique, but as a hint for what Java code shape to preserve for future reruns.

## Pattern 1: Static HTML Or Saved Fixture

- Signal:
  - locator HTML already contains store cards and `data-*` attributes
  - live site is bot-blocked, but a repo fixture exists
- Technique:
  - parse HTML with Jsoup or equivalent
  - extract `data-storeid`, lat/lng, and visible address fields
- Completeness trap:
  - only one province or one rendered page may be saved in the fixture
- Best reference:
  - `test/com/pear/retailerFeasibility/ca/metro/MetroPlan.java`
- Example:
  - Metro fixture `test/resources/metro-ca-stores.html` parsed into `Store`
- Java shape to preserve:
  - `LoggedJurl` or fixture load
  - `Jsoup.parse(...)`
  - iterate store-card elements
  - map fields into `Store.SStore`

## Pattern 2: Direct Public JSON Endpoint

- Signal:
  - page calls a simple store-details endpoint with JSON payload
- Technique:
  - fetch endpoint directly
  - map raw DTO to store shape
- Completeness trap:
  - hidden embedded region/custom-field objects may hold province or coordinates
- Best reference:
  - `test/com/pear/retailerFeasibility/ca/longos/LongosStoreList.java`
- Java shape to preserve:
  - endpoint constant
  - DTO class for response shape
  - `JSON.get().parse...`
  - final normalization loop

## Pattern 3: Next.js App Data Endpoint

- Signal:
  - `_next/data/.../store-locations.json`
  - page props include current-page stores
- Technique:
  - derive the data URL and read JSON instead of scraping rendered DOM
- Completeness trap:
  - endpoint may be zip- or page-dependent
- Best reference:
  - `src/com/pear/itemurlupdater/retailers/heb/HEBStoreUpdater.java`
  - `test/com/pear/itemurlupdater/retailers/heb/HEBApiUrlTest.java`
- Java shape to preserve:
  - data URL derivation helper
  - JSON DTO parse
  - page/result loop if paginated

## Pattern 4: Storefront Gateway Buckets

- Signal:
  - response contains `availableDeliveryStores`, `availablePickupStores`, `availablePlanningStores`
- Technique:
  - fetch bucketed JSON
  - merge buckets
  - dedupe by retailer store id
- Completeness trap:
  - same physical store appears in multiple shopping modes
- Best reference:
  - `test/com/pear/retailerFeasibility/ca/storefrontgateway/StorefrontGatewayBasePlan.java`
- Java shape to preserve:
  - request builder with required headers
  - merge multiple store buckets
  - dedupe by retailer store id

## Pattern 5: Algolia Store Index

- Signal:
  - app uses Algolia indices such as `dxp_stores`
  - payloads include `aroundLatLng`, `filters`, `bannerCode`, `hitsPerPage`
- Technique:
  - call Algolia directly
  - fetch store attributes by id or geo search by zip centroid
- Completeness trap:
  - geo search may only return nearest stores unless you fan out over zips/regions or page results
- Best reference:
  - `test/com/pear/retailerFeasibility/ca/sobeysPlatform/DXPMobileRetailerBasePlan.java`
- Java shape to preserve:
  - Algolia POST request body
  - `bannerCode` filter setup
  - pagination or geo-fanout loop

## Pattern 6: Token Bootstrap Then Store Endpoint

- Signal:
  - first request gets an access token
  - second request hits a store API per store id
- Technique:
  - acquire token once
  - refresh on 401/403
  - hydrate stores from ids gathered elsewhere
- Completeness trap:
  - you still need a complete upstream source of all store ids
- Best reference:
  - `test/com/pear/retailerFeasibility/gb/iceland/IcelandPlan.java`
- Java shape to preserve:
  - token bootstrap method
  - retry/refresh flow
  - downstream store hydration loop

## Pattern 7: Structured Data In HTML

- Signal:
  - `application/ld+json` contains `ItemList`, `Product`, or location objects
- Technique:
  - parse structured data instead of scraping visible cards
- Completeness trap:
  - page may expose only one visible region or one search slice
- Best reference:
  - `test/com/pear/retailerFeasibility/gb/iceland/IcelandPlan.java`
  - `test/com/pear/retailerFeasibility/us/homedepot/HomeDepotUSPlan.java`
- Java shape to preserve:
  - HTML fetch
  - structured-data extraction helper
  - object-to-`SStore` mapper

## Pattern 8: Encoded Module Script Payload

- Signal:
  - city/location pages contain `script[type="module"]`
  - data is wrapped in `decodeURIComponent("...")`
- Technique:
  - locate script
  - decode payload
  - parse JSON object
- Completeness trap:
  - one city page only gives one city's stores, so you must first crawl state -> city links
- Best reference:
  - `test/com/pear/retailerFeasibility/us/dollartree/DollarTreeCityStoreScraper.java`
  - `test/com/pear/retailerFeasibility/us/familydollar/FamilyDollarCityStoreScraper.java`
- Java shape to preserve:
  - script extraction helper
  - decode step
  - parsed payload traversal

## Pattern 9: Browser-Captured XHR And Session Replay

- Signal:
  - direct API calls fail without browser-established cookies or user-context headers
- Technique:
  - load a real page in rendered mode
  - inspect captured XHR headers/cookies
  - replay store-context calls using harvested browser state
- Completeness trap:
  - changing store may require a base64 user-context or a separate store-switch POST
- Best reference:
  - `src/com/pear/upcresolution/utilities/UnataUtil.java`
  - `test/com/pear/retailerFeasibility/ca/metro/MetroPlan.java`
- Java shape to preserve:
  - browser-captured headers/cookies as constants or notes
  - replay request method
  - store list parse and dedupe

## Pattern 10: Browser Profile Or Full Chrome Header Emulation

- Signal:
  - endpoint is sensitive to browser fingerprints, cookies, or full header sets
- Technique:
  - use `.asChrome()` or a browser profile
  - preserve cookies and request headers from a real browser flow
- Completeness trap:
  - endpoint may work only after a real page visit seeds cookies or location context
- Best reference:
  - `src/com/pear/itemurlupdater/retailers/heb/HEBStoreUpdater.java`
  - `test/com/pear/retailerFeasibility/us/homedepot/HomeDepotUSPlan.java`
- Java shape to preserve:
  - full header set builder
  - `asChrome()` or equivalent browser-like request flow

## Pattern 11: Geo-Fanout Or Region Traversal

- Signal:
  - locator returns only stores near one zip/postal code
  - province/state/city filters gate the visible set
- Technique:
  - iterate zips, provinces, states, or city lists until coverage stabilizes
  - dedupe by store id
- Completeness trap:
  - nearest-store APIs can silently truncate results
  - a successful API fanout over a known-subset seed list can still be incomplete if the seed geography only covers places where stores are already expected
- Best reference:
  - `test/com/pear/retailerFeasibility/gb/sainsburys/SainsburyPlan.java`
  - `test/com/pear/retailerFeasibility/gb/tesco/TescoPlan.java`
  - `test/com/pear/retailerFeasibility/ca/metro/MetroPlan.java`
  - `WebContent/META-INF/dollarama/current.json`
- Java shape to preserve:
  - outer loop over zips/regions/cities
  - merge and dedupe map
  - completeness reconciliation

## Pattern 12: Parallel City Or Region Harvesting

- Signal:
  - site has thousands of city pages and each page is independent
- Technique:
  - collect all city links first
  - fetch city pages in a bounded thread pool
- Completeness trap:
  - aggressive parallelism can increase blocking; keep retries and dedupe
- Best reference:
  - `test/com/pear/retailerFeasibility/us/familydollar/FamilyDollarCityStoreScraper.java`
- Java shape to preserve:
  - collect links first
  - bounded parallel fetch helper
  - synchronized dedupe accumulation

## Pattern 13: WordPress Custom Post Type With Serialized Store Meta

- Signal:
  - store index is a WordPress archive such as `/stores/`
  - `wp-json/wp/v2/<post-type>` exposes the full store inventory
  - detail payloads contain fields in `spectra_custom_meta` or similar custom-meta blobs
- Technique:
  - fetch the custom post type list for completeness
  - fetch each store detail payload
  - read address/phone fields from custom meta
  - parse serialized location payloads when coordinates are packed into a PHP-serialized string
- Completeness trap:
  - top-level `meta` may look sparse while the real store data lives under a separate nested metadata object
- Best reference:
  - `https://www.farmboy.ca/wp-json/wp/v2/stores`
  - `WebContent/META-INF/farmboy/2026-05-12.json`
- Java shape to preserve:
  - list endpoint fetch
  - detail endpoint fetch
  - serialized-meta parser helper

## Pattern 14: Province -> City HTML Locator Traversal

- Signal:
  - province pages link to city pages
  - city pages render store cards with `data-fid` or comparable ids
  - coordinates are exposed only in directions links
- Technique:
  - crawl province pages first
  - collect every city slug
  - fetch every city page
  - parse store id, name, formatted address, and `daddr=<lat>,<lng>`
- Completeness trap:
  - the root locator page may look comprehensive while still requiring province and city traversal for the actual store cards
- Best reference:
  - `test/com/pear/retailerFeasibility/ca/gianttiger/GiantTigerPlan.java`
  - `WebContent/META-INF/gianttiger/current.json`
- Java shape to preserve:
  - province loop
  - city loop
  - HTML card parser

## Pattern 15: Shopify Store Index With Detail Page Hydration

- Signal:
  - a `/pages/our-stores` or similar page shows a location card grid
  - each card links to a per-store content page
  - detail pages expose address in meta description, phone in `tel:`, and often a Google Maps iframe
- Technique:
  - parse the location card grid for names and detail links
  - fetch each detail page
  - pull address from the page metadata or visible content
  - parse phone from `tel:` and coordinates from embedded map URLs when present
- Completeness trap:
  - site chrome may include many unrelated `/pages/...` links, so only trust links that come from the location card section
- Best reference:
  - `WebContent/META-INF/myvita/current.json`
- Java shape to preserve:
  - index-page parser
  - detail-page fetch helper
  - iframe coordinate parser

## Pattern 16: Static Contact Block With Multiple Stores

- Signal:
  - one page or footer explicitly says the retailer has a fixed small number of locations
  - addresses and phones are written inline in rendered HTML
- Technique:
  - parse the contact block directly
  - split stores by visible labels or separators like `OR`
  - map plain-text address and `Store Phone` values
- Completeness trap:
  - because the locations live in shared page chrome, it is easy to miss them if you only inspect the main content body
- Best reference:
  - `WebContent/META-INF/mypetparadise/current.json`
- Java shape to preserve:
  - one-page HTML parser
  - section splitter
  - text-to-`SStore` mapping helper

## Pattern 17: Squarespace Accordion Locations Page

- Signal:
  - a Squarespace locations page renders one accordion item per store
  - each accordion body contains a linked address and optional hours
- Technique:
  - parse accordion item titles
  - pair each title with the first linked address inside the accordion body
  - ignore site-level JSON-LD if it only describes the corporate address
- Completeness trap:
  - accordion blocks are not always structurally identical, so overly strict regexes can silently miss locations
- Best reference:
  - `WebContent/META-INF/amaranthfoods/current.json`
- Java shape to preserve:
  - accordion-item selector
  - address-link extraction
  - normalization helper

## Pattern 18: Hidden Browser HTML Store Blocks

- Signal:
  - the visible page text only shows one active store or a map shell
  - DOM selectors against live elements return zero cards
  - `document.body.innerHTML` still contains repeated hidden `fs--box-shop` or similar store blocks
- Technique:
  - use a real Chrome session
  - extract `document.body.innerHTML` instead of `innerText`
  - parse the hidden store-card markup directly for ids, coordinates, address fields, and phone
  - reconcile against the visible total store count if the page shows one
- Completeness trap:
  - it is easy to assume the page has no usable data because the visible DOM is sparse, even though the hidden HTML already contains the full chain
- Best reference:
  - `WebContent/META-INF/superc/current.json`
  - `test/com/pear/retailerFeasibility/ca/metro/MetroPlan.java`

## Pattern 19: Browser Directory Coverage With Best-Effort Detail Enrichment

- Signal:
  - alphabetical store-directory pages render the full chain in a real browser
  - direct HTTP fetches are Cloudflare-blocked
  - some detail pages expose useful `Store` schema, but longer automated runs start returning challenge HTML
- Technique:
  - treat the rendered directory tabs as the canonical coverage source
  - parse each directory card for store URL, name, and visible address
  - derive a stable store id from the full `/magasin/...` path
  - best-effort fetch detail pages only to enrich phone and geo fields
- Completeness trap:
  - if you rely on detail pages as the primary source, you can silently lose most of the chain once challenge pages start appearing
  - if nested paths like `/magasin/<slug>/drive` exist, the last path segment alone is not a unique store id
- Best reference:
  - `WebContent/META-INF/carrefourfr/current.json`
  - `WebContent/META-INF/carrefourfr/EXTRACTION.md`
- Java shape to preserve:
  - browser-page loop over directory tabs
  - rendered card parser
  - full-path store-id helper
  - optional detail-page schema enrichment with graceful fallback

## Chrome Session Lessons From Metro

- Live fetches may be blocked by Cloudflare while the browser page still works.
- If the page shows a total store count, use it as a reconciliation target.
- If browser JavaScript automation is blocked, a saved fixture or remote-debuggable Chrome session is often more reliable than raw HTTP scraping.
- For Metro specifically, the repo already had a useful fixture at `test/resources/metro-ca-stores.html`, which was a better source than hand-copying visible page text.

## Update Rule

When a new site introduces a new pattern, add:

- retailer or platform name
- one-paragraph extraction summary
- one completeness warning
- one code reference
