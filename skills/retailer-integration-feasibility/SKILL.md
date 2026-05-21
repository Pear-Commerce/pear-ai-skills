---
name: retailer-integration-feasibility
description: Coordinate Pear retailer onboarding feasibility for store importers, UPC/item ID resolvers, and store-level or online availability scanners in api.pearcommerce.com. Use when given a retailer name or URL and asked to assess or build/implement a retailer integration, create AvailabilityUpdater/recomputer support, create scanning support, create ItemIdInfoResolver/UPC resolution support, import Store.SStore data, or produce Java @Script feasibility probes that use Chrome discovery, JurlProxyFallback, and proxies without running in CI. For create/implement requests, prove the route with focused feasibility skills and then use retailer-production-integration so the end state is production classes, not leftover plan files.
---

# Retailer Integration Feasibility

Use this skill as the coordinator for a new retailer integration. The goal is to leave the repo with Java code and `@Script` probes that prove which of the three onboarding surfaces work:

- store import: retailer store ids, addresses, coordinates, and `Store.SStore`-compatible data
- UPC resolution: UPC/name to retailer item id and PDP URL
- availability scanning: store id plus item id/UPC to stock status and price, or live online ecommerce availability/price when store-level inventory is unavailable

## Focused Skills

Use the focused skills for the actual implementation loops:

- `$retailer-upc-resolution-feasibility` for UPC/name search, PDP parsing, and `ItemIdInfoResolver`
- `$retailer-availability-scanning-feasibility` for `UPCRetailerZipAvailabilityRecomputer`, store-level inventory checks, and online availability access
- `$retailer-store-import-feasibility` for store locators and store importers

When the user asks to graduate a proven feasibility route into production classes, or asks to create/update an `AvailabilityUpdater`, `UPCRetailerZipAvailabilityRecomputer`, `BatchAvailabilityUpdater`, `ItemIdInfoResolver`, or the necessary `RetailPartner` setup migration, use `$retailer-production-integration`.

When the user asks to "create an updater", "create scanning", "create a resolver", "create availability", or similar for retailer Y, treat the request as production work:

- use the appropriate focused feasibility skill first to prove the route when no passing plan already exists
- then immediately use `$retailer-production-integration` to build the production classes, migration, and production `@Script`
- end with the production classes and delete the temporary feasibility plan files after their useful code has moved

When the user asks to "implement retailer Y", run the needed feasibility surfaces first, then use `$retailer-production-integration` for the implementation pass. The desired end state is the built retailer integration, not both production classes and `test/com/pear/retailerFeasibility/**` plan files, unless the user explicitly asks to keep a research artifact.

If the user asks for all three, work in this order: UPC resolution, availability, then store import last. Full store imports are usually one-off, slower, and easier to defer; do the smallest store/context discovery needed for availability, such as choosing a visible store id from Chrome or a quick locator response, then return to the complete `Store.SStore` import after the item-id and buyability routes are proven. If no store-scoped inventory route exists, do not stop there: try to prove live online availability access from PDP/product/search/cart routes that expose current stock/out-of-stock state, price, and a buyability/add-to-cart signal. This is useful for avoiding dead PDP/checkout links, even though it is not inventory access. Do not mark online availability as passing from stock text alone if the live page/API disables buy/add-to-cart or the cart route rejects the item.

For availability status planning, classify by location dependence rather than endpoint naming. A result that changes when store, zip, fulfillment node, or location context changes is the future `IN_STORE` signal even if the retailer calls the endpoint delivery, collection, fulfillment, or availability. A separate non-location-dependent ecommerce/global stock signal is the future `SHIP_TO_HOME` signal. If both exist, document both mappings; if only the global ecommerce signal exists, document `SHIP_TO_HOME` support and `IN_STORE` unsupported.

For all live Java feasibility surfaces, local Chrome, local curl, local app, and `Type.NO_PROXY` success from a developer laptop are discovery evidence only, not proof, because the local IP is not Pear datacenter/proxy egress. Passing `@Script` probes and production-oriented resolver/updater/importer paths must use proxy-backed `JurlProxyFallback.Type` values and must exclude `Type.NO_PROXY` unless the user explicitly asks for local-only discovery. Store imports may use an explicitly approved browser-assisted one-off artifact when every Java/proxy route is blocked, but document that as reference-data extraction rather than a production-runnable Java/proxy route.

If no `STATIC` or cheap static/provider-static route works for any surface, always check Android app calls before declaring the surface impossible or settling for expensive/heavy proxy routes such as `UNBLOCKER`, Scrapfly ASP, or ZenRows render, and app barcode/APIM strings are a reusable tactic when they can be replayed through a proxy. Inspect APK/XAPK strings and app traffic for mobile search, barcode, product, availability, cart, fulfillment, store-locator, APIM/gateway, GraphQL, public app headers, and stable parameter names.

When Java can fetch live status/price but buyability is best validated through the actual shopper experience, use local Chrome during discovery. Test the PDP in more than one relevant store/postal context when the site has store context, confirm the visible buy/add-to-cart button is enabled, and click far enough to prove the cart/add confirmation when practical. Record that Chrome-observed user-path evidence in the `@Script` comments while keeping the runtime Java probe focused on production-runnable live status/price. Do not confuse Chrome-only user-path validation with store-level inventory access.

## Default Artifacts

Prefer feasibility artifacts under:

```text
test/com/pear/retailerFeasibility/<country>/<retailer>/<Retailer>Plan.java
test/com/pear/retailerFeasibility/<country>/<retailer>/<Retailer>PlanTest.java
```

This follows the repo's feasibility naming pattern. `*Plan.java` is the reusable scratch implementation: static route probes, parsers, DTOs, normalization helpers, proxy lists, artifact writers, and code that may later graduate into production classes. `*PlanTest.java` is the JUnit `@Script` harness: sample inputs, assertions, logging, `@Disabled` failure notes, and PR/reference comparisons. Use both when the work has more than a tiny one-off assertion or when code may be reused by store, UPC, and availability probes. For a very small throwaway check, a single `*PlanTest.java` can be acceptable, but do not put production-style helper logic directly into the script harness when it will grow.

Before creating a new feasibility file, search for an existing retailer `*Plan.java` / `*PlanTest.java` pair and update it when present. Focused skills must compose with this same pair: if stores already created `DartyPlanTest.java`, the UPC and availability skills should add their `@Script` methods to that existing class instead of creating parallel files. The result should be runnable from either the orchestrator skill or any individual focused skill without losing prior probes or comments.

When the user asks for production wiring, graduate the proven code into the existing owner area, usually `src/com/pear/itemurlupdater`, `src/com/pear/upcresolution`, `src/com/pear/jobs/retailer`, or a retailer-specific package already used by similar code.

For retailer setup-only work, do not infer availability. Create the retailer row and display setup only. Do not add a static availability updater, dummy store importer, location-agnostic ship-to-home flag, or constant `AVAILABLE` statuses unless a focused availability feasibility probe already proved live buyability for the supplied item and mode.

When creating the PR for a retailer feasibility pass, use a simple title:

```text
[codex] <retailer> feasibility
```

Keep the title focused on the retailer and feasibility outcome even when the branch includes production wiring for the proven route.

Disable Slack review notifications for retailer feasibility PRs by default. When creating the PR or review watcher, state explicitly that Slack review asks and automated `#engineering` nudges are disabled because the spreadsheet queue can produce many feasibility PRs. Only post to Slack if the user explicitly overrides this for a specific PR.

When a PR is created or materially corrected for a solvable retailer from the feasibility spreadsheet, update the spreadsheet row promptly before moving on. Mark Alex as owner, fill the columns you understand, link the PR, and add concise notes on routes, store count, proxy requirements, and caveats. Use Chrome to edit the sheet when the Google Sheets connector cannot write.

When updating dropdown-backed columns in the feasibility spreadsheet, preserve the sheet's native dropdown/data-validation cells. Do not paste plain text into Owner or difficulty/access columns in a way that strips validation. With the Google Sheets connector, read nearby completed rows with `dataValidation` and copy/apply those validation rules to the edited row; with Chrome, use the existing dropdown chips from prior rows or copy/paste from a nearby validated row before changing the selected value. Verify the edited row still has native dropdowns, not just matching text.

Do not mark the availability column/surface as `Hard` merely because store-level inventory is unavailable. If the scripts prove live online availability access with current stock/out-of-stock, price when exposed, and buyability/add-to-cart proof, mark availability as working/easy and explain in notes that it is online availability, not store-level inventory. Only the unsolved surface should stay hard.

If stores and availability scanning are production-runnable but UPC resolution is the only failing surface, still create the feasibility PR when the user is working through the spreadsheet queue. Keep the UPC probe disabled with clear live-route evidence, and mark the sheet's UPC resolution/access column as `Hard` and the overall/difficulty column as `Hard` instead of `Easy`.

Every combined `@Script` probe class should start with a compact comment like:

```java
/*
 * FEASIBILITY SUMMARY
 * Stores: PASS via store-locator JSON; STATIC works; 312 stores; sample storeId=123.
 * UPC resolution: PASS via name search + PDP embedded GTIN; UNBLOCKER required; sample UPC=...
 * Availability: PASS online-only via live product JSON stock/price plus enabled add-to-cart; maps to SHIP_TO_HOME; no location-dependent IN_STORE route found.
 */
```

## Operating Loop

1. Load Pear context before editing Java: use `$pear-engineering-workflow` and `$pear-proxy`, then search with `rg` for existing retailer/platform patterns.
2. Explore the retailer in local Chrome. Use DevTools Network, Sources, rendered DOM, cookies/local storage, request payloads, and copied cURL as evidence. Do not treat browser, direct-curl, or `NO_PROXY` success as proof until Java can replay it through a proxy-backed `JurlProxyFallback.Type`. When a needed header, cookie, token, version string, parameter, or body value appears in DevTools, trace where it comes from and reproduce that source in Java when practical. If the value is public and long-lived, such as a stable app id, version, API key, or functionally permanent token, it is acceptable to capture it with a comment explaining why it is safe to reuse.
3. Translate the best route into a small Java method that uses `LoggedJurl` plus `JurlProxyFallback`, with no `Type.NO_PROXY` in the passing fallback ladder.
   - Default browser-discovered document/API routes to `new LoggedJurl().asChrome()` unless there is a clear reason not to. If a non-`.asChrome()` replay gets blocked, times out, or behaves differently from Chrome, retry with `.asChrome()` before escalating to heavier proxies or declaring the route bad.
   - If `.asChrome()` still fails, or if it adds document-navigation headers that conflict with copied API/CORS headers, try `LoggedJurl.withBrowserProfile(...)` with explicit browser/API headers. Browser profiles reproduce the TLS/HTTP2 fingerprint that some retailer APIs check. Prefer `ChromeShim.getMostRecentChromeRelease().getBrowserProfile()` on production-like boxes; if local script data lacks a `BrowserProfileConfiguration`, use a documented long-lived captured/check-in Chrome profile only as a feasibility fallback and note that production should use the latest DB-backed profile when available.
   - In `goThen`, non-null return means success; `null` return and throw both mean failed attempt. Keep response usability/cacheability validation inside `goThen`.
4. Try the proxy ladder in Java: static/datacenter first, then `UNBLOCKER`, then ZenRows scrape/render, then Scrapfly render/ASP render when the page needs JavaScript or bot handling. Skip `NO_PROXY` and explicitly local types for passing probes. If `STATIC` works but flakes intermittently, retry `STATIC` up to about 10 times and count that as one cheap proxy option before falling through to the next known-good proxy. If static routes fail and the next options are expensive/heavy proxies, inspect Android app calls/APK strings before accepting that cost or declaring the surface blocked.
5. Run the focused `@Script` probe. If it fails, return to Chrome and find another route: different endpoint, document HTML, embedded app data, rendered page, cart API, or city/state traversal.
6. Repeat until the surface passes or the failing route is clearly documented and disabled.

## Creative Recovery

Get creative when the obvious browser route, copied API, or first proxy ladder fails. For UPC resolution especially, if Chrome renders a PDP with UPC/GTIN evidence, trace the API or payload that served that data to the PDP before declaring resolution hard: check XHR/fetch calls, hydration JSON, script bundles, delayed product-spec/detail calls, GraphQL operations, tag-manager data, and lazy structured-data loaders, then replay the stable retailer-owned source in Java if production-runnable. Also try alternate store modes, full documents instead of APIs, embedded app state, sitemap/search-index data, Android app calls/APK strings, mobile or app-adjacent endpoints, cart/PDP side doors, platform-sibling banners, checked-in platform metadata such as Instacart retailer lists, checked-in PR artifacts, and rendered DOM traversal before declaring a surface infeasible. When a direct retailer domain is blocked but a platform storefront can fetch live item ids plus UPC evidence from its own hydrated search/product API, use the platform route and document that the feasibility is platform-backed rather than standalone.

When a creative tactic works, or fails in a reusable way, update the focused skill's `SKILL.md` or `references/repo-tactics.md` in the canonical skills repo before finishing. Keep the note short, name the route/platform/proxy signal, validate the skill, and sync it into the local skill target.

## Test Rules

- Mark every generated feasibility check with `@Script` so it stays out of CI unless intentionally run. Do this even when the class name ends in `Test` and even when the check uses a fixture or PR artifact.
- Keep failing probes in the test file, but disable them with `@Disabled("FEASIBILITY FAILING: ...")` and a comment naming the last observed response, proxy list, and next route to try.
- Prefer deterministic parser checks with fixtures when graduating code to production, but keep them as `@Script` while they live in retailer feasibility packages.
- Assertions must prove real behavior: non-empty stores, stable store ids, target UPC match, expected item id/URL, non-`UNKNOWN` availability when the sample is known, and price when the retailer exposes it.
- Do not mark a surface successful because it worked only in Chrome, local curl, a local app, or `Type.NO_PROXY`; passing live probes need a proxy-backed path that can run off-box.
- Do not mark a retailer failed solely because availability is online/global instead of store-specific. If Java can fetch current in-stock/out-of-stock state and price from a live retailer-owned PDP/product/search/cart route and also prove the item is buyable or add-to-cart is enabled/accepted, mark availability as passing online availability access and document that store-level inventory remains unavailable. If buy/add-to-cart cannot be proven, keep iterating or leave the probe disabled as a dead-link risk.
- Chrome-visible buyability can satisfy the user-path proof when the production Java route already fetches live status/price but the cart API is too session-heavy to replay. In that case, test multiple store/postal contexts where applicable and document the enabled button/cart confirmation in the feasibility comments.
- If one feasibility class has multiple live probes that create carts, mutate store context, or share proxy/cache/session state, annotate it with `@Execution(ExecutionMode.SAME_THREAD)` so repo-level JUnit parallelism does not create false hangs or flakes.

## Completion

Finish by reporting:

- which surfaces pass, fail, or are disabled
- the required proxy types and whether static works
- sample inputs used: retailer URL, store id, UPC/name, item id/PDP
- whether availability is store-level inventory access or online availability access
- Java files and `@Script` probes created or updated
- the exact focused Gradle/JUnit `@Script` checks run, or why they could not run
