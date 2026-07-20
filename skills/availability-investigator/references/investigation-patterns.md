# Investigation Patterns

Use this reference for the main diagnosis workflows.

## Contents

- [Natural-Language Product Resolution](#1-natural-language-product-resolution)
- [Existing Run First](#2-existing-run-first)
- [Rerun or Updated Scan](#3-rerun-or-updated-scan)
- [Button Failure With Successful Availability](#4-button-failure-with-successful-availability)
- [Health Verdicts](#5-health-verdicts)
- [Answer Template](#6-answer-template)

## 1. Natural-Language Product Resolution

Use this flow when the user gives product text instead of ids.

1. Resolve retailer name or enum.
2. Resolve vendor or company if mentioned.
3. Resolve product text into one or more UPC candidates.
4. Prefer a candidate that already has a URD for the requested retailer.
5. If the ask is "pick one that has a URD at retailer X", prefer UPCs that already have the requested URD and ideally recent URZA evidence too.
6. Confirm which UPC ID or UPC IDs you actually used.
7. For a supplied list, preserve its intended cardinality. Report invalid tokens, duplicates, wrong-vendor UPCs, missing URDs, and any products filtered before the inspector response.

Use multiple UPCs when the product description is ambiguous and that helps answer the question faster.

## 2. Existing Run First

Use this flow by default unless the user explicitly asks for a rerun.

1. Find the current or recent URZA for the UPC, retailer, ZIP, and store context.
2. Inspect saved logs before triggering anything new.
3. Check URD and LURD before assuming the updater itself is broken.
4. Explain whether the result looks healthy, expected-invalid, inconclusive, or broken.

For store-ID retailers such as Walmart:

- expect one seeded postal-code request to return many store-specific rows
- treat the result as a row set, not a single ZIP-only URZA
- prefer the relevant child store rows over the blank skipped placeholder row
- if the blank parent row says `invalid zip: null`, consider whether the retailer allows geo-agnostic ship-to-home placeholders while the recomputer still enforces zip validity; that pattern is usually expected, not a broken run

If the saved inspector evidence is still not enough, escalate in this order:

- read-only DB
- live logs
- live JSP

## 3. Rerun or Updated Scan

Use this flow when the user explicitly asks to recompute or to inspect an updated scan.

1. Require postal code.
2. Require country code for non-US postal codes.
3. Trigger the normal inspector recompute path.
4. Compare the updated run against the previous state when possible.
5. Show the most relevant logs from the updated scan, not just the final verdict.
6. If polling was needed, re-run inspection with computes disabled so the answer uses refreshed full details and logs rather than status-only poll output.

Do not escalate to a JSP just to kick off a normal recompute if the admin inspector path already covers the request.

When choosing log excerpts from the updated scan, prioritize:

- status transitions
- request attempts
- HTTP outcomes
- item-id decisions
- final reason or failure point

For store-zone retailers, also prioritize:

- whether store-specific child rows were created
- whether the placeholder parent row was skipped
- whether all stores look consistent or only some stores are failing

If the logs show healthy request flow such as normal search or PDP calls and the run lands in a clear terminal available or unavailable state, that is usually a good sign. If the logs show a specific failing updater step, name that step directly rather than reducing the explanation to the final status alone.

Do not blindly repeat `FORCE` because the UI still says `BATCH COMPUTED`. Treat that label as presentation. Check raw status, timestamps, new logger ids, and generated child rows first. A second force is reasonable only when those signals show the first request did not create or settle the expected work.

## 4. Button Failure With Successful Availability

Use this flow when the user says the run looks fine but the picker or locator button is broken.

Treat this as a separate diagnosis from availability health.

Inspect:

- observed `pdpURL` from the URZA or inspector response
- updater `getPdpUrl(...)` behavior if observed PDP URL is missing or bad
- offer `retailerLinkStrategy`
- URD `urlOverride`
- URD `directToCart`
- LURD override URLs and direct-to-cart flags
- the URL-selection fallback in `UPCRetailerZipAvailabilityRecomputer`
- picker/list filtering and widget default-tab behavior when a pin exists but no retailer row is visible

Typical conclusions:

- availability is healthy, but PDP URL is null
- availability is healthy, but derived PDP URL is malformed
- availability is healthy, but button behavior is being altered by offer or override config
- availability is healthy, but the button path is choosing DTC when the useful path should have been PDP, or vice versa
- availability is healthy and visible in-store, but the buy-online list omitted it because URL generation returned null
- the URL is valid, but the widget opened a different tab than the user expected

Use this three-layer test:

1. Availability: determine whether the relevant overall, in-store, or ship-to-home status is healthy.
2. URL eligibility: determine whether URL selection produced a real PDP or ATC URL. An `AVAILABLE` UPC can be demoted or omitted from a URL-enabled retailer list when this returns null.
3. Presentation: determine whether the picker is showing in-store or buy-online results and whether widget configuration selected the expected default tab.

URL semantics:

- A single-product flow can often fall back from null DTC to `getPdpUrl(...)` unless DTC is forced.
- A multi-product add-all flow can require ATC and may not be fixed by a PDP implementation alone.
- A PDP must be a verified consumer-facing URL; do not blindly slugify a product description or expose a retailer API endpoint.
- A working PDP does not mean ship-to-home is available. Keep `shipToHomeStatus=INVALID` when the updater intentionally checks only in-store availability.

## 5. Health Verdicts

Use these categories:

- Healthy:
  - terminal result plus logs and request behavior look normal
- Expected invalid:
  - the attempted input path or prerequisites are invalid, but this is not a broken system verdict
- Inconclusive:
  - result stayed `UNKNOWN` or evidence is partial
- Broken:
  - request path, parser path, PDP generation path, or updater behavior clearly failed

Important nuance:

- `INVALID` is not automatically broken.
- `UNKNOWN` is not automatically broken.

- `BATCH COMPUTED` is a UI presentation hint, not a raw URZA processing status.
- A blank `SKIPPED` parent row for a store-ID retailer is not automatically a broken run.
- A blank `SKIPPED` parent row with `invalid zip: null` can be the expected outcome when a retailer allows a geo-agnostic placeholder into the pipeline but still requires a valid zip for actual recompute work.

Use the logs and surrounding state to decide whether they represent:

- a valid rejection
- an unresolved path
- a true breakage

## 6. Answer Template

Prefer answers with this shape:

1. What was investigated.
2. Which UPC ID or UPC IDs were used.
3. What the strongest evidence says.
4. The verdict.
5. The next best step.
6. Relevant admin and PDP links.

Example sentence shapes:

- “This looks healthy. The updated run reached a terminal unavailable result and the retailer requests were returning 200.”
- “This does not look broken. The run is invalid for the attempted input path because the retailer flow cannot use this id combination.”
- “This is still inconclusive. The updated scan ended in UNKNOWN, and the next thing to inspect is the failing request path in the updater logs.”
- “The run itself succeeded, but the picker button is broken because the URZA has no usable PDP URL.”
