---
name: availability-investigator
description: Investigate Pear availability behavior across UPCRetailerZipAvailability (URZA), UPCRetailerData (URD), LogicalUPCRetailerData (LURD), offer config, retailer settings, saved availability logs, and updater code. Use when a user asks why a product is available, unavailable, invalid, or unknown; asks to inspect or rerun the admin /availability-inspector flow; asks for relevant logs from an updated scan; wants natural-language product, retailer, and zip inputs resolved into one or more UPCs; or needs to debug picker and product-locator failures such as a map pin with no retailer-list row, null PDP URLs, retailerLinkStrategy issues, or broken getPdpUrl behavior.
---

# Availability Investigator

## Overview

Use this skill to explain Pear availability outcomes with evidence from code, data, and logs. Resolve the product, retailer, and location first, inspect existing URZA and related state before rerunning, and treat button-link failures as a separate diagnosis from availability success.
Prefer an API-first investigation flow. Use the same API endpoints the admin inspector uses, and treat the admin UI as an optional convenience surface for links, visual parity, or manual follow-up rather than as a hard dependency.

For any actual run or rerun, require a postal code. If the postal code is not US, also require country code. This is the request location; a location-agnostic retailer can still intentionally resolve part of the internal availability state to a null or canonical zip.

The admin UI still expects ids and a retailer typeahead. This skill should translate natural-language product, retailer, vendor, and location requests into the inspector and API inputs the code actually uses.

Do not assume one inspector request produces one URZA row. For store-ID retailers such as Walmart, one postal-code request can fan out into many store-specific URZAs through `ZipRetailerZone` or `RetailerZipStoreId.loadByZip(...)`, plus a skipped placeholder row. The requested postal code is often the seed for the zone lookup, not the exact zip shown on every resulting row.
For some retailers, including Walmart in current Pear data, `locationAgnosticShipToHome` can allow a blank-zip placeholder URZA to exist in the request flow even though the retailer still has `itemAvailabilityDependsOnZip = true`. In that case the shared recomputer can still skip the placeholder as `invalid zip: null` while the real store-specific child rows compute normally. Treat that as expected unless the child rows also look broken.

Preferred local source-of-truth repos on Pear workstations are `$HOME/IdeaProjects/pear/admin` and `$HOME/IdeaProjects/pear/api.pearcommerce.com`. For picker or product-locator rendering questions, also inspect `$HOME/IdeaProjects/pear/offers` when present. If those paths do not exist, discover equivalent checked-out copies such as `admin`, `admin.pearcommerce.com`, `api.pearcommerce.com`, `offers`, or `Pear-Commerce/...`. Use the GitHub repo copies only as fallback.

## Terms

Use Pear terms naturally and explicitly:

- `URZA` = `UPCRetailerZipAvailability`
- `URD` = `UPCRetailerData`
- `LURD` = `LogicalUPCRetailerData`

## Resource Map

Read these references only when needed:

- Read [references/admin-availability-inspector.md](references/admin-availability-inspector.md) when building direct `/v1/inspect-availabilities` requests, returning admin links, or interpreting inspector/API responses and saved logs.
- Read [references/data-surfaces.md](references/data-surfaces.md) when you need the fields and meaning of URZA, URD, LURD, retailer settings, offer config, or zip/store mappings.
- Read [references/investigation-patterns.md](references/investigation-patterns.md) for the main diagnosis workflows: natural-language resolution, existing run analysis, reruns and updated scans, button failures, and health verdicts.
- Read [references/code-entry-points.md](references/code-entry-points.md) when you need the real source files, methods, or repo search patterns behind the behavior.
- Read [references/live-investigation.md](references/live-investigation.md) when the question needs real database reads, live server logs, or a JSP-backed live Java investigation.
- Read [references/starter-prompts.md](references/starter-prompts.md) when you want realistic test prompts or reusable question templates.

## Workflow

1. Normalize the request.
   - Resolve retailer by name or enum. Do not require the user to know `retailerId`.
   - Resolve product text to one or more UPC candidates.
   - Prefer UPCs that already have a relevant URD for the requested retailer.
   - Confirm which UPC ID or UPC IDs you actually used.
   - For a supplied UPC list, parse and validate every token and report the intended, valid, resolved, and returned counts. Catch missing commas, URL-encoded spaces, duplicated ids, and ids that do not belong to the expected vendor before running.
   - If the user is asking for a run or rerun, require postal code. If non-US, require country code.

2. Choose the investigation mode.
   - Existing run or known `availabilityId`: inspect the current URZA, logs, and related data first.
   - Existing product and retailer question with no explicit rerun: inspect current URZA row set, URD, LURD, retailer config, and logs first.
   - Rerun or updated scan request: compare the updated scan row set and logs against the previous state.
   - Button, retailer list, or default tab broken but map pins exist: inspect availability, URL eligibility, and presentation separately. Check PDP/ATC behavior, `retailerLinkStrategy`, overrides, and widget/tab configuration.
   - Config-only question: inspect URD, LURD, offer, retailer, and location surfaces without triggering a rerun unless asked.

3. Prefer read-only evidence first.
   - Use the existing API inspect flow, saved URZA logs, database state, and source code before triggering new work.
   - If the user explicitly asks for a fresh run, use the same inspect/recompute API path the admin uses.
   - Prefer direct API calls over browser-driving the admin page when both are available.
   - After polling status-only results, call the inspect endpoint again with computes disabled to retrieve refreshed details and saved logs.
   - If broader or riskier writes would be needed outside the normal inspector path, pause and ask.

4. Explain the result in Pear terms.
   - Tie the answer back to URZA status, URD ids and overrides, LURD overrides, retailer settings, updater selection, store/zip mappings, and logs.
   - Distinguish availability health from button health.
   - Distinguish expected `INVALID` outcomes from broken runs.
   - Treat `UNKNOWN` as a signal to inspect further, not an automatic failure verdict.
   - Use environment or server provenance from saved logs when it helps explain where a run came from, but do not treat provenance alone as the health verdict.

5. Return the most useful artifacts.
   - Return the admin availability inspector link when relevant.
   - Return vendor, UPC, retailer, and LURD admin links when they will help the user continue debugging.
   - Return PDP links when available.
   - If the user asks for updated scan logs, surface the most relevant excerpts from the latest run instead of dumping everything.
   - If helpful, mention whether the newest relevant log lines point to a dashboard host, an availability worker path, or another runtime context.

## Live Investigation Rules

Use this evidence order unless the user explicitly asks for something riskier first:

1. Existing inspector output, saved URZA logs, and current code paths.
2. Read-only database checks.
3. Live server logs.
4. Live Java inspection through a JSP preview page.
5. A new compute or other write-like action.

Production-safe defaults:

- Prefer read-only evidence first, even when the user suspects the updater is broken.
- Prefer `TEST` or equivalent non-production environments for exploratory probes when they can answer the question.
- Use production data or production live code only when the question truly depends on it or the user asks for it.
- Treat normal inspector recomputes as allowed only when the user asked for a fresh run or updated scan.
- For broader writes outside the normal inspector path, stop and get explicit user approval first.

When you do use live evidence, say where it came from:

- saved inspector output
- database read
- live server logs
- JSP/live Java probe

## Investigation Rules

- Use multiple UPCs when that is the best way to answer the user’s product description, but say which UPCs were investigated.
- Preserve cardinality through multi-UPC investigations. Do not silently investigate three rows when the user supplied five products; explain whether any were malformed, unresolved, missing URD, filtered before recompute, or absent from the response.
- For store-ID retailers, treat the inspector results as a set of store-specific URZAs, not a single zip-only result. Say which store rows mattered most.
- Prefer the PDP URL observed on the inspected URZA or inspector response over a derived link.
- If the observed PDP URL is missing, null, malformed, or suspicious, inspect the updater’s `getPdpUrl(...)` path and label any derived link as derived.
- Treat “availability succeeded but the picker or locator button is broken” as a first-class diagnosis. The problem may live in offer config, retailer link strategy, PDP URL generation, URD or LURD overrides, or direct-to-cart behavior rather than the availability result itself.
- Do not assume an overall `AVAILABLE` URZA is sufficient for retailer-list visibility. When URLs are included, the retailer-list path can demote or omit an available UPC if URL generation returns null.
- Treat `getPdpUrl(...)`, `getAtcUrl(...)`, and availability statuses as separate contracts. A working PDP can restore a single-product retailer-list row through PDP fallback, but it does not prove direct-to-cart or ship-to-home support and must not be used to change `shipToHomeStatus` to `AVAILABLE`.
- Validate that a generated PDP is a stable consumer-facing product page. Do not assume an API product id or a slug derived from a description is a valid PDP without checking it.
- If a map pin or in-store result exists but the retailer list is empty, compare the in-store and buy-online paths and inspect widget/default-tab configuration before blaming the availability scan.
- A blank-zip or blank-store skipped row for a store-ID retailer is often the seed placeholder URZA, not the real store-specific result. Do not treat that row as the only outcome when store rows were also produced.
- If that placeholder row shows `SKIPPED` with `invalid zip: null`, and the retailer also allows geo-agnostic ship-to-home behavior, explain that the placeholder was admitted earlier in the pipeline but rejected by the shared zip validation step. Judge health from the child rows.
- `details.logs` from `/v1/inspect-availabilities` is the main saved-log artifact. `/v1/resolve-upcs` is status-only and should be used to watch inflight rows, then followed by another inspect call when refreshed logs or details are needed.
- `BATCH COMPUTED` is not proof that a force request is still running. Check raw processing state, timestamps, child rows, and the newest saved run before retrying. Retry only when the evidence shows the expected compute was not triggered or did not settle.

## Output Expectations

Structure answers around:

1. What you investigated.
2. Which UPC ID or UPC IDs you used.
3. The strongest evidence from URZA, URD, LURD, retailer config, offer config, and logs.
4. Any useful provenance from the saved logs such as environment or server label.
5. A verdict such as healthy, inconclusive, expected invalid, or broken.
6. The next best debugging action.
7. Relevant admin and PDP links.

When the user asks for logs from an updated scan, emphasize the newest relevant run and focus on:

- status markers and final reason
- search, PDP, or availability endpoint behavior
- HTTP response clues such as `200`, `400`, or `500`
- itemId or instacartItemId decisions
- the point where the run became available, unavailable, invalid, unknown, or broken

For zone-expanded retailers, prefer the most relevant store-specific rows and explain whether the row set shows:

- many store-specific rows successfully created
- a batch-computed display state
- a skipped placeholder parent row
- mixed store outcomes across the same seeded postal-code request

## Examples

- “Tell me why the original Cheerios 15oz at Walmart in 53211 is out of stock.”
- “Select a General Mills UPC with a Target URD and tell me if the run was successful.”
- “Show me the relevant logs from the updated scan.”
- “Why is this availability invalid?”
- “The run looks successful, but the picker button is broken.”
