---
name: retailer-verify
description: Verify Pear retailer availability and PDP link behavior end to end. Use when a user asks to prove that a retailer/UPC can produce an available result, that an availability updater saves the right URL, that a UPC-only auto-created offer or landing page shows the retailer button, or that clicking a retailer button redirects to the expected PDP. Covers CityHive and other retailer-specific updater checks using JSPs, logs, retailer-list APIs, and browser verification.
---

# Retailer Verify

## Overview

Use this skill to verify a retailer integration from Pear server behavior through the shopper landing page. Codex should drive the workflow from the normal workspace/browser whenever possible: discover candidates, inspect code/config, manually verify retailer PDPs, call public/internal APIs, interpret outputs, and do the landing-page click-through. JSPs are a small server-side bridge, not the main orchestration surface. The usual proof chain is: find an eligible UPC, manually prove the retailer's own PDP is in stock, run the retailer's availability updater over real ZIP/store targets when needed, save one available result, load a UPC-only offer landing page, confirm the retailer button appears, click it, and verify the final PDP URL.

If Pear has no usable UPC with retailer ids yet, discover an in-stock product on the retailer's site first, then create or load only the UPC row under the existing Admin vendor (`vendorId = 8`) before running availability. This is not retailer setup and must not create or modify `Vendor` rows. Use an abridged import for direct UPC resolvers that produce their own item id, and use the full UPC resolution graph for candidate-based resolvers.

For JSP execution, prefer TEST first when possible because TEST targets the production database and is convenient for app logs. Treat TEST JSP writes as production DB writes. For the shopper-facing proof, still check production Offers (`https://offers.pearcommerce.com`) and the production API/read path unless the user explicitly asks to inspect the test frontend.

When curling Pear API hosts during verification, include the trusted-edge header used by the Admin/Offers Cloudflare invalidation scripts before treating a Cloudflare 403/block page as real API behavior:

```bash
PEAR_TRUSTED_EDGE_VALUE="${PEAR_TRUSTED_EDGE_HEADER:-${PEAR_TRUSTED_EDGE:-a1360351-32b2-4410-9c87-ec294e780c25}}"
curl -fsS -H "x-pear-trusted-edge: ${PEAR_TRUSTED_EDGE_VALUE}" "https://api.pearcommerce.com/v1/retailer-list/<offerId>?zip=<zip>&countryCode=<countryCode>"
```

Use this for `api.pearcommerce.com` and `test.api.pearcommerce.com` only. Do not add it to retailer sites, `partners.pearcommerce.com`, raw Offers picker page loads, Cloudflare's own API, or unrelated domains.

## Required Companion Skills

Use `pear-prod-jsp` only when the live Pear server context is actually needed: production DB reads that are not otherwise available, production classpath/ORM checks, availability updater execution, or DB modifications. Keep its preview-page and visible `Run` button approval rules, especially for any write/updater step.

Use `browser` for landing-page and click verification. Open the JSP preview URL without query params, click the visible `Run` button only after approval or when the user explicitly asked you to run it, then load the landing page and click the retailer button in the browser.

## Workflow

1. Identify the retailer and updater path.
   - Confirm the target is a `RetailPartner`, not only a brand `Vendor`. A `Vendor` lookup is diagnostic only; do not create or modify `Vendor` rows while setting up or verifying a retailer. If the name exists only as a `Vendor`, stop before writing data and report that a retailer integration row/resolver/updater is missing.
   - Find the `RetailPartner` enum/id and integration type.
   - Do not test platform/shared rows unless that platform is explicitly requested. For example, a retailer row with `availabilitySharedImagesAndIds = doordash`, a DoorDash ecommerce URL, or DoorDash-style item ids is a DoorDash-platform check, not a direct retailer check, even if `name` or `urlOverride` mentions the retailer. If the user asks for "Tractor Supply Co." and not DoorDash, use the direct Tractor Supply retailer row only.
   - Locate the updater class, resolver class, and PDP URL construction method. Determine the availability updater from code, not from `RetailPartner.itemUpdateConfiguration.itemUpdaterClass` alone. `RetailPartner.getAvailabilityUpdater(...)` first allows `ItemIdInfoAvailabilityUpdater` when `ItemIdInfoAvailabilityUpdater.canRun(retailer)` is true, then asks `UPCRetailerZipAvailabilityRecomputer.getInstance(retailer.enumName)`, whose registry is populated from each updater's `retailerEnums()` method. Only if those paths do not return an updater does `itemUpdateConfiguration.itemUpdaterClass` act as a fallback. If you only looked at the DB config, say it is a fallback/config value, not the selected updater.
   - When proving updater selection, prefer a code/JSP/server check that calls `retailer.getAvailabilityUpdater(true)` and prints the returned class plus `UPCRetailerZipAvailabilityRecomputer.getClass(retailer.enumName)`. Do not report "the updater is X" from SQL `itemUpdateConfiguration` without this check.
   - Treat `UPCRetailerData.itemId` as the direct retailer-specific id for the direct retailer resolver/updater/PDP builder. Treat `UPCRetailerData.instacartItemId` as the Instacart product id for `InstacartAvailabilityUpdater`, Instacart batch updater/list-scraper checks, and shared Instacart fallback URZAs. Debug in that order: direct retailer `itemId` and selected updater first; Instacart `instacartItemId`, Instacart URZAs, and batch/list checks only after the direct path is missing or invalid.
   - Confirm what makes a UPC eligible: retailer item id, product slug/name, non-Instacart/non-carting PDP URL, live retailer, known carries, store/ZIP dependency, and any country constraints.

2. Decide whether a JSP is needed.
   - Prefer Codex/local code search, browser verification, existing scripts, existing APIs, and CLI tools for discovery and interpretation.
   - Use a read-only JSP only when the missing fact lives in the production DB/server classpath and cannot be obtained through an existing safer path. Keep read-only JSPs narrow and targeted; avoid putting broad search/orchestration logic in them.
   - Use a write/updater JSP when you need to approve and execute production DB modifications or live updater execution. Default page is a no-side-effect preview with env, purpose, selection, actions, data touched, idempotency guards, verification, and a visible `Run` button. Real work is behind `run=true`.
   - Print a unique log prefix, for example `[retailer-verify-cityhive]`, and log candidate, attempt, and final result lines for long server-side runs.
   - Prefer PearSimpleORM/entity saves over direct SQL for saved availability rows.
   - Use exact upsert keys for the saved winner, usually `(retailerId, upcId, zip, storeId)`.
   - Save only the first available result. Do not save misses unless the user asked for broad data generation.

3. Select and pre-verify candidates.
   - Prefer recent `AVAILABLE` `UPCRetailerZipAvailability` rows for that retailer/integration, joined to valid `UPCRetailerData`.
   - Reject rows that belong to a different shared/platform integration than the one requested, such as DoorDash, Instacart, or another platform, unless the user explicitly requested that platform.
   - Fall back to recent `UPCRetailerData` rows with item IDs for live retailers.
   - Filter out hidden or non-ready UPCs unless the request explicitly calls for them.
   - For PDP verification, reject candidate URLs that point to Instacart, generic search, out-of-stock pages, or non-product pages.
   - Before using any UPC as the smoke-test candidate, manually open the retailer PDP in the browser and verify the exact URL/itemId is currently in stock for the target ZIP/store context. Do this even when Pear already has ids or availability rows; it trims the scan to UPCs that can actually win.

4. Create/import a UPC when no existing Pear candidate has usable ids.
   - Use the retailer's own site to find a product that is actually available. Prefer PDPs that reveal a UPC/GTIN in the page, structured data, network responses, product details, or visible packaging. If needed, use the product name/brand/size from the retailer page to confirm the UPC from a reliable external product source.
   - Treat retailer-page UPC evidence as fragmentary when appropriate. If the page exposes `mpn`, `gtin`, `UPC`, or retailer catalog UPC fields, split obvious numeric sections/tokens and compare each token to candidate Pear UPC rows with `UPC.isAUPCMatch(token, upc.UPC)`. Do not use raw string equality, substring checks, or hand-written no-country/no-check-digit comparisons as the evidence gate. This evidence can select or validate a candidate, but still requires browser stock verification before writes or availability scans.
   - Manually verify the retailer PDP is in stock in the browser before creating/importing anything. Record the PDP URL, item id, UPC/GTIN, product name, ZIP/store context, and evidence of stock.
   - Create or load the UPC under the existing Admin vendor (`vendorId = 8`) with the appropriate UPC fields and product metadata. Keep it non-hidden and suitable for a UPC-only offer unless there is a reason not to. Do not create a retailer `Vendor`; retailer identity belongs in `RetailPartner`, and scratch UPC ownership belongs on the existing Admin vendor only.
   - If the retailer has a direct UPC resolver, meaning the resolver's own code can generate a trusted `SRetailerItemData.itemId` through `_resolveItemIdInfo(...)` rather than only returning search candidates, run an abridged UPC import/resolution JSP. The abridged path should call that resolver for the one UPC, then set the appropriate `UPCRetailerData` fields (`itemId`, `urlOverride` or `sRetailerItemData.url` when appropriate, `itemName`, `imageUrl`, `knownCarries`, `availabilitySharedImagesAndIds`, `idSource = upc_resolution`, and related `SRetailerItemData`) and persist the UPC retailer data.
   - If the resolver uses candidates, meaning it returns possible items through `_getItemIdInfoCandidates(...)` and depends on UPC resolution graph scoring to select the match, run the full UPC resolution graph/search first for that UPC and retailer/platform. Only continue after the graph writes the retailer ids needed by the availability updater.
   - After either import path, re-check `UPCRetailerData` for the UPC and retailer and browser-verify the saved URL/itemId still opens an in-stock PDP before starting availability scans.

5. Select ZIP/store targets.
   - Start with the candidate's known recent available ZIP/store.
   - Add recent availability history for the same UPC/retailer.
   - Add live `Store` rows and `ZipRetailerZone` rows for the retailer.
   - Keep the scan bounded: typical maxes are 100-150 candidate pairs, 10-20 targets per pair, and 50-100 total updater attempts.

6. Run any needed server-side JSP on TEST and watch logs.
   - TEST points at the production database. Use TEST for JSP/log execution when server context is needed, but keep the same production-data caution and idempotency guards you would use on PROD.
   - Keep JSPs as small execution bridges. Do not move browser/site exploration, broad candidate interpretation, or landing-page verification into JSPs.
   - Deploy with an explicit env:
     ```bash
     PATH=/opt/homebrew/bin:$PATH devops/jsp.sh -j /tmp/retailer-verify-thing.jsp -e TEST
     ```
   - Keep that command running: it holds split-tunnel AWS Client VPN open. Open its printed private-IP URL in the browser with no query params and verify the preview. On the first workstation run, relay any `./devops/setup-client-vpn.sh` instruction to the user rather than bypassing the guarded setup.
   - For long-running scans, start logs before clicking `Run`:
     ```bash
     PATH=/opt/homebrew/bin:$PATH devops/logs.sh -e TEST 2>&1 | grep -F --line-buffered '[retailer-verify-prefix]'
     ```
   - Click the visible `Run` button. If the browser request times out or 504s, keep using the log prefix as the output channel.
   - After verification or failure, Ctrl-C the persistent `jsp.sh` command and confirm `Closing AWS Client VPN...`.

7. Save and report the winner.
   - The JSP should output/log JSON with at least:
     - `upc`, `upcId`, product name
     - `retailerEnum`, `retailerId`, retailer name
     - `zip`, `storeId`, country
     - saved availability id
     - status, in-store status, ship-to-home status
     - expected PDP URL
     - UPC-only offer id and logical UPC id
     - landing page URL, including the exact environment host used
     - reusable proof URL for later sharing, including `zip`, `countryCode`, `include=<RetailerEnum>`, and `debug=true`
     - retailer-list API URL
   - Ensure/create the UPC-only canonical offer if needed. For Pear UPC-only checks, `Offer.createSingleUPCOffer(upc, Offer.OfferType.LANDING_PAGE, true)` is the usual creation path when `Offer.loadByOfferOrVendor(upc.id)` is missing.

8. Verify server-side read path.
   - Check the saved availability row in the production DB or via JSP/retailer-list API. TEST JSPs read that same production DB.
   - Confirm the saved availability URL equals the expected PDP URL.
   - For external `curl` to `api.pearcommerce.com` or `test.api.pearcommerce.com`, include `x-pear-trusted-edge` first. If it is still blocked by Cloudflare, use the browser or an internal JSP/API call from the app server.
   - If the retailer is not naturally selected by geo constraints but the row is valid, use the landing page/API `include=<RetailerEnum>` query parameter to verify the retailer-specific button path.

9. Verify the landing page.
   - Load the UPC-only picker URL with the ZIP and country. Use production Offers unless the user explicitly asks for TEST, the feature is currently only deployed to TEST, or the proof is intentionally a TEST-front-end smoke check:
     ```text
     https://offers.pearcommerce.com/picker/<offerId>?zip=<zip>&countryCode=<countryCode>
     ```
     ```text
     https://test.offers.pearcommerce.com/picker/<offerId>?zip=<zip>&countryCode=<countryCode>
     ```
   - Add `include=<RetailerEnum>&debug=true` when proving the included retailer button path or when geo filtering hides the retailer:
     ```text
     https://offers.pearcommerce.com/picker/<offerId>?zip=<zip>&countryCode=<countryCode>&include=<RetailerEnum>&debug=true
     ```
     ```text
     https://test.offers.pearcommerce.com/picker/<offerId>?zip=<zip>&countryCode=<countryCode>&include=<RetailerEnum>&debug=true
     ```
   - Use the browser DOM snapshot to confirm the retailer button/link text appears, for example `Shop at <Retailer Name>`.

10. Click through and compare PDPs.
   - Click the visible retailer button/link, not a guessed redirect URL.
   - Wait for navigation and check for a new tab if the click opens one.
   - Verify the final URL path and product id match the expected PDP. Query params such as `pearclid`, `utm_source`, `offerId`, or `ref=pearcommerce` are normal and should not fail the check.
   - If the retailer canonicalizes the product title/slug or adds an `option-id`, compare stable URL parts: domain, `/shop/product/...`, and retailer item/product id.
   - Capture a screenshot when it helps prove the PDP loaded.

11. Preserve the reusable proof.
   - In the final response and any handoff notes, record the UPC, `upcId`, UPC-only offer id, ZIP, country, retailer enum, retailer name, expected PDP URL, exact picker URL, button text observed, and final clicked retailer URL.
   - When the user asks later for "the test.offers URL" or a URL that "works all the way through to retailer visit," return the exact browser-verified picker URL and clicked PDP target from the most recent successful proof. Do not rerun DB writes or availability updaters just to answer that lookup unless the previous result is missing, stale, or the user asks to reverify.
   - Label TEST proof URLs plainly as TEST front-end URLs. Remember that TEST JSP/log execution can target the production DB, but `test.offers.pearcommerce.com` is still a TEST shopper surface and should not be described as production shopper proof.

## JSP Implementation Notes

For an abridged direct-resolver import JSP, keep the scope to one browser-verified UPC and one retailer:

```jsp
UPC upc = UPC.getOrCreateLenient(upcString);
upc.vendorId = 8L;
upc.hidden = false;
upc.save(false);

ItemIdInfoResolver resolver = ItemIdInfoResolver.getInstance(retailer.enumName);
Map<String, SRetailerItemData> resolved = new HashMap<>();
resolver._resolveItemIdInfo(resolved, upc, ItemIdInfoResolver.Goal.FIND_ITEM_ID, targetZip, targetStoreId);
SRetailerItemData itemData = resolved.get(retailer.enumName);

SItemDataWrapper sidw = upc.getOrCreateRetailerData(retailer.enumName, false);
sidw.setValuesFrom(itemData);
sidw.setSRetailerItemData(itemData);
sidw.getOrCreateDelegate().knownCarries = true;
sidw.getOrCreateDelegate().knownNotCarries = false;
sidw.getOrCreateDelegate().availabilitySharedImagesAndIds = retailer.availabilitySharedImagesAndIds;
sidw.getOrCreateDelegate().idSource = UPCRetailerData.IdSource.upc_resolution;
upc.persistUpdatedUPCRetailerData(false);
```

Treat that snippet as a shape, not a copy-paste contract: use the resolver's actual public/local helper methods and the repo's current import patterns. Do not bypass the full graph for candidate resolvers.

Use the real updater where possible:

```jsp
UPCRetailerZipAvailability temp = UPCRetailerZipAvailability.createUnsavedPlaceholder(
    "Retailer verify JSP", retailer, upc, targetZip, targetStoreId);
temp.countryCode = targetCountryCode;
updater.recomputeAndValidate(temp);
```

For the saved winner:

```jsp
UPCRetailerZipAvailability saved = orm.loadSingleWhere(
    UPCRetailerZipAvailability.class,
    "retailerId = ? and upcId = ? and zip <=> ? and storeId <=> ?",
    retailer.id,
    upc.id,
    targetZip,
    targetStoreId);
if (saved == null) {
    saved = UPCRetailerZipAvailability.createUnsavedPlaceholder(
        "Retailer verify JSP winner", retailer, upc, targetZip, targetStoreId);
}
UPCRetailerZipAvailabilityRecomputer.copyFields(saved, temp);
saved.setPDPUrlSavedFromAvailabilityCheck(expectedPdp);
saved.setStatus(UPCRetailerZipAvailabilityRecomputer.determineUnifiedStatus(saved), "JSP retailer verify");
saved.save(true, true);
orm.dirty(UPCRetailerZipAvailability.class, saved.id, true);
```

Make the JSP environment-aware:

```jsp
boolean testEnv = StringUtils.equalsIgnoreCase(String.valueOf(ServerEnv.global().env), "TEST");
String jspApiBaseUrl = testEnv ? "https://test.api.pearcommerce.com" : "https://api.pearcommerce.com";
String shopperApiBaseUrl = "https://api.pearcommerce.com";
String offersBaseUrl = "https://offers.pearcommerce.com";
String testOffersBaseUrl = "https://test.offers.pearcommerce.com";
```

Log structured final output:

```jsp
Resources.global().logger.info(LOG + "RESULT " + JSON._stringify(result));
Resources.global().logger.info(LOG + "NO_RESULT " + JSON._stringify(result));
```

## Common Pitfalls

- Do not bypass the JSP preview by constructing `?run=true`; click the visible `Run` button.
- Do not depend on a long browser request staying open; use `devops/logs.sh` with a unique log prefix.
- Do not start an availability scan until the exact UPC URL/itemId has been manually verified as in stock in the retailer site through the browser.
- Do not create or modify `Vendor` rows for retailer verification. The Admin vendor (`vendorId = 8`) should already exist and is only used as the owner for a scratch UPC row when needed.
- Do not create Admin-vendor UPCs for a target that is only a `Vendor` and has no live `RetailPartner` plus resolver/updater path. There would be no valid `UPCRetailerData.retailerEnum` to attach the ids to.
- Do not use platform/shared rows as a substitute for a direct retailer verification. If the only available rows are DoorDash/Instacart/shared-platform rows, report that direct verification is blocked and name the missing direct resolver/updater/id path.
- Do not treat a populated `instacartItemId` as proof that the direct retailer-specific `itemId` path exists. It proves only the Instacart product id path; verify or rule out direct retailer `itemId` and updater behavior separately before relying on Instacart fallback.
- Do not identify an availability updater solely from `RetailPartner.itemUpdateConfiguration.itemUpdaterClass`; that is fallback metadata. Updater discovery is primarily code-driven through `UPCRetailerZipAvailabilityRecomputer` subclasses' `retailerEnums()` methods, with `ItemIdInfoAvailabilityUpdater.canRun(...)` checked before the recomputer registry in `RetailPartner.getAvailabilityUpdater(...)`.
- Do not use the abridged import for candidate-only resolvers. If the resolver needs the UPC resolution graph to choose among candidates, run the full graph first.
- Do not assume a saved available row will show on a landing page without geo/inclusion constraints. Use `include=<RetailerEnum>` when the proof is about that retailer's button/link path.
- Do not treat `localhost` or `127.0.0.1` URLs generated inside a JSP as public verification URLs. TEST JSP execution can use `test.api.pearcommerce.com`, but production shopper verification should use `api.pearcommerce.com` and `offers.pearcommerce.com`.
- Do not fail a PDP verification because Pear tracking query params were appended. Compare the stable domain/path/product id.
- Do not save broad availability misses during smoke verification.
- If TEST app config/classpath prevents the run, explain that and rerun the same bounded JSP pattern on PROD. Do not rerun on PROD merely because of data availability; TEST targets the production database.
