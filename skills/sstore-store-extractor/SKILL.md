---
name: sstore-store-extractor
description: Extract retailer store lists into SStore-style JSON for api.pearcommerce.com. Use when asked to find all stores, scrape a store locator, discover store attributes, save a retailer store list under WebContent/META-INF, or update the store-extraction playbook with a new site pattern. Covers endpoint-first extraction, Chrome/browser-assisted discovery, paging through all locations, and writing dated JSON outputs.
---

# SStore Store Extractor

Use this skill when the goal is to extract a retailer's full store list and save it in the `api.pearcommerce.com` format.

## Output Contract

- Target shape: `Store.SStore`-compatible JSON fields.
- Stable output location: `WebContent/META-INF/<retailer>/current.json`
- Snapshot output location: `WebContent/META-INF/<retailer>/<YYYY-MM-DD>.json`
- Learning note location: `WebContent/META-INF/<retailer>/EXTRACTION.md`
- Prefer a retailer folder even if older files in the repo use flat filenames.
- Minimum fields to populate when available:
  - `name`
  - `address`
  - `geoAddress`
  - `latitude`
  - `longitude`
  - `phone`
  - `storeId`
  - `category`
  - `countryCode`
  - `zip`
- Only include fields that are actually known. Do not invent ids, coordinates, or phones.
- Every extraction must also create or update `EXTRACTION.md` in the retailer folder so future prompts can rerun the same site without rediscovering the method.
- Every extraction must also preserve the Java implementation shape needed to rerun the extractor later. Put that in `EXTRACTION.md` as a compact Java method or code skeleton, not just prose.
- If a retailer folder already exists, read its `EXTRACTION.md` first and treat it as the preferred rerun plan unless the live site proves it stale.

Check these repo files first:

- `src/com/pear/entities/inventory/Store.java`
- `WebContent/META-INF/WholeFoods_CA_Stores.json`
- `WebContent/META-INF/Metro_CA_Stores.json`

## Default Workflow

1. Inspect `Store.SStore` and one or two existing `WebContent/META-INF` store files.
2. If `WebContent/META-INF/<retailer>/EXTRACTION.md` already exists, read it before doing fresh discovery.
3. Search `test/com/pear/retailerFeasibility` and `test/com/pear/itemurlupdater` for matching platform patterns before inventing a new approach.
4. Prefer stable data sources in this order:
   - public JSON/GraphQL/search endpoints
   - `__NEXT_DATA__`, `__NUXT__`, `application/ld+json`, inline JSON blobs
   - module scripts or `decodeURIComponent(...)` payloads
   - browser-captured XHR/fetch requests from a real Chrome session
   - rendered HTML scraping as a fallback
5. Prove completeness:
   - page through every result page
   - click `Load more`, `Next`, province/state filters, city buckets, and alphabetical lists
   - switch locations if the site gates store visibility by geography
   - dedupe by stable store id when multiple buckets return the same store
6. Normalize to SStore-style JSON.
7. Write `current.json` to `WebContent/META-INF/<retailer>/current.json`.
8. Also write or refresh the dated snapshot at `WebContent/META-INF/<retailer>/<YYYY-MM-DD>.json`.
9. Create or update `WebContent/META-INF/<retailer>/EXTRACTION.md` with the rerun instructions and Java extraction outline for that retailer.
10. If the technique is meaningfully new, update this skill and `references/patterns.md`.

## Pattern Selection

Start with `references/patterns.md` and choose the closest family:

- Direct public JSON endpoint
- Next.js or other app bootstrap JSON
- Algolia or search-index-backed store lookup
- GraphQL store locator
- HTML page with embedded structured data
- Script/module payload decode
- Browser-captured authenticated XHR
- Browser-clicked pagination or region traversal

If a retailer looks similar to an existing platform, reuse that pattern first.

## Chrome Workflow

Use a real Chrome session when the site blocks normal HTTP fetches or when the locator is hidden behind client-side actions.

### Preferred browser moves

1. Open the retailer site in Chrome.
2. Navigate to the store locator or store-finder flow.
3. Click through:
   - `Find a store`
   - `Use my location`
   - province/state selectors
   - city selectors
   - `Load more`
   - `Next`
   - tabs for pickup, delivery, planning, or banners
4. Look for these DOM/script sources before scraping visible text:
   - `window.__NEXT_DATA__`
   - `window.__NUXT__`
   - `script[type="application/ld+json"]`
   - `script[type="module"]`
   - `decodeURIComponent("...")`
   - `data-storeid`, `data-lat`, `data-lng`, `data-*`
   - hidden store cards present in `document.body.innerHTML` even when `querySelectorAll(...)` returns `0`
5. If the UI is only a frontend wrapper, identify the backing XHR/fetch endpoint and pivot to that endpoint.

### JavaScript actions

When page JavaScript execution is available, use it to verify completeness and extract normalized records.

Common checks:

```js
document.querySelectorAll('[data-storeid], [data-store-id], .store-card, .location-card').length
```

```js
Array.from(document.querySelectorAll('script[type="application/ld+json"]')).map(s => s.textContent)
```

```js
Array.from(document.querySelectorAll('button, a')).map(el => el.textContent?.trim()).filter(Boolean)
```

Use small extraction snippets to inspect candidate structures before writing the final parser.

### When browser automation is constrained

- If Apple Events JavaScript is disabled, fall back to:
  - Chrome remote debugging
  - accessibility/computer-use clicking
  - copying HTML or using an already-saved fixture from the repo
- If the live site is bot-protected but the repo already contains a fixture or prior source file, prefer that fixture over brittle manual copying.

## Completeness Rules

Do not stop after the first visible page of stores.

Always check for:

- hidden pagination
- lazy-loaded lists
- state/province partitioning
- city partitioning
- delivery vs pickup vs planning store buckets
- store-switch side effects that expose additional API calls
- duplicate stores returned under multiple modes

If total count is shown on the page, reconcile your extracted count with that total.

## Normalization Rules

- `address` and `geoAddress` can match unless a better geocoded string exists.
- Preserve postal code formatting if the site provides a formatted postal code.
- Strip punctuation from phone only if existing store files for that family do the same.
- Set `countryCode` when known from site or region.
- Use the retailer banner name for `category` when it improves downstream clarity.
- Prefer stable retailer store ids over transient UUIDs only if the platform clearly exposes both. If both are valuable, keep the stable one as `storeId` and the other only if the destination schema supports it.

## File Writing

- Create the retailer folder if it does not exist.
- Always write `current.json` as the stable machine reference.
- Also keep a dated snapshot with filename format `YYYY-MM-DD.json`.
- Keep JSON pretty-printed.
- Save the final extracted list only after dedupe and field normalization.
- Always create or update `EXTRACTION.md` in the same retailer folder.

## Extraction Note Contract

`EXTRACTION.md` should be a compact rerun guide for that exact site.

Include:

- retailer name
- source URLs used
- pattern family used
- why this pattern was chosen
- exact completeness strategy
- fields mapped into the JSON
- known caveats
- a short rerun procedure
- a `Java Implementation` section with the Java method or code skeleton that would be used to extract the stores again
- enough detail in that Java section to show:
  - the request URL(s) or page URL(s)
  - the parsing approach
  - the dedupe key
  - the mapping into `Store.SStore`
- output path convention for that retailer
- what changed from the previous note, if this run replaced an older pattern

Prefer concrete notes over generic advice. The file should help a later run start from the best-known approach immediately.

## Java Preservation Rules

The goal is not only to remember how the site worked, but also how we would code the extractor in this repo.

- Prefer a compact Java method skeleton over long pseudocode.
- Keep it close to repo conventions:
  - `LoggedJurl` or equivalent fetch flow
  - `JSON.get().parse...` when parsing JSON
  - `Jsoup` or equivalent DOM parsing when parsing HTML
  - `Store.SStore` field mapping in the final normalization step
- The Java block can be partial, but it should be runnable in spirit:
  - method name
  - key DTOs or parsing helpers if needed
  - loop over source records
  - dedupe logic
  - JSON write target
- If the retailer matches an existing platform family, say which repo Java file is the closest implementation and model the snippet after it.
- If the extraction used browser-only discovery, still write the Java that would replay the discovered endpoint or parse the saved HTML shape.

## Skill Maintenance

Whenever you meet a new extraction technique:

1. Add a short pattern entry to `references/patterns.md`
2. Include:
   - retailer/platform
   - signal that revealed the pattern
   - extraction method
   - completeness trap
   - best repo file reference
3. Keep entries concise and reusable across retailers.
