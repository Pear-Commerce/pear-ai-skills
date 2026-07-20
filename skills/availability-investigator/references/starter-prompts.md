# Starter Prompts

Use these prompts to test the skill the way Pear engineers are likely to use it.

## Contents

- [Quick Start](#quick-start)
- [Best First Tests](#best-first-tests)
- [Concrete Investigation Prompts](#concrete-investigation-prompts)
- [Reusable Templates](#reusable-templates)
- [What A Good Ask Includes](#what-a-good-ask-includes)

## Quick Start

When invoking the skill directly, start prompts like:

- `Use $availability-investigator to ...`

If the environment already routes to the skill naturally, the `$availability-investigator` prefix is optional.

## Best First Tests

These are good first prompts because they cover the main surfaces without being too broad.

1. `Use $availability-investigator to tell me why the original Cheerios 15oz at Walmart in 53211 is out of stock. Start with existing inspector evidence and do not rerun unless you need to.`
2. `Use $availability-investigator to select a General Mills UPC with a Target URD and tell me if the latest run looks healthy. Show me which UPCId you used and why you picked it.`
3. `Use $availability-investigator to show me the most relevant logs from the updated scan for this availability result and tell me where the run went wrong, if anywhere.`
4. `Use $availability-investigator to tell me whether this INVALID result is expected or actually broken. Explain the difference using the saved logs and the retailer or item-id path.`
5. `Use $availability-investigator to explain why the picker button is broken even though the availability run looks successful. Check PDP URL, ATC URL, retailerLinkStrategy, URD, and LURD.`
6. `Use $availability-investigator to explain why CO-OP has an in-store map pin but no retailer-list row. Separate availability, URL eligibility, and picker-tab presentation.`

## Concrete Investigation Prompts

### Explain A Result

- `Use $availability-investigator to tell me why original Cheerios 15oz at Walmart in 53211 is unavailable. Include the strongest URZA, URD, and log evidence and link me to the relevant admin pages.`
- `Use $availability-investigator to investigate why this result is UNKNOWN for Target in 60611. Do not treat UNKNOWN as broken unless the logs or updater path support that conclusion.`
- `Use $availability-investigator to explain whether this UNAVAILABLE result looks healthy or if the updater is failing upstream.`

### Pick A UPC For Me

- `Use $availability-investigator to pick a General Mills UPC with a Target URD, inspect the latest availability run, and tell me whether the run looks healthy.`
- `Use $availability-investigator to find a Cheerios UPC for Walmart in 53211. Prefer a UPC that already has URD for Walmart and confirm which UPCId you used.`
- `Use $availability-investigator to use multiple UPC candidates if needed for Cheerios at Target in 10001, but tell me exactly which UPCs you investigated and which one best matched the request.`

### Updated Scan Or Fresh Run

- `Use $availability-investigator to show me the relevant logs from the updated scan for this UPC and retailer. Focus on the newest run and the exact failure point.`
- `Use $availability-investigator to run a fresh availability inspection for this product at Walmart in 53211 and compare it to the previous state.`
- `Use $availability-investigator to force a fresh run for this UPC at Target in 60611 and tell me whether search, PDP, and availability requests look healthy in the logs.`

### INVALID And UNKNOWN Nuance

- `Use $availability-investigator to tell me if this INVALID result is expected because the retailer flow cannot use this item-id path, or if something is actually broken.`
- `Use $availability-investigator to explain why this run stayed UNKNOWN. Tell me whether it is inconclusive, expected, or actually broken, and point to the updater step that supports that answer.`
- `Use $availability-investigator to inspect this Instacart-related result and tell me whether INVALID is expected for this retailer and id combination.`

### Button Or PDP Problems

- `Use $availability-investigator to explain why the locator button is not working even though the run looks AVAILABLE. Inspect observed PDP URL first, then getPdpUrl if needed.`
- `Use $availability-investigator to diagnose whether the picker button problem is caused by Offer.retailerLinkStrategy, URD.urlOverride, LURD.overrideUrl, or a null PDP URL.`
- `Use $availability-investigator to tell me whether this is an availability problem or just a button-link problem.`
- `Use $availability-investigator to tell me whether implementing getPdpUrl will fix this retailer-list problem, and whether the flow also needs getAtcUrl or ship-to-home support.`
- `Use $availability-investigator to explain why a retailer appears on the map or in-store tab but not in the buy-online retailer list.`

### Retailer Or ZIP Mapping Problems

- `Use $availability-investigator to check whether this retailer actually serves ZIP 53211 or if the result is being affected by missing ZipRetailerZone or RetailPartner_to_Zipcode mappings.`
- `Use $availability-investigator to tell me whether store-zone mapping or retailer settings are the reason this run is invalid or unavailable.`
- `Use $availability-investigator to inspect whether the updater is choosing the wrong store or ZIP context for this retailer.`
- `Use $availability-investigator to check whether locationAgnosticShipToHome should create a null-zip internal run even though I supplied a postal code to the inspector.`

### Multi-UPC And Non-US Inputs

- `Use $availability-investigator to inspect these five UPCIds for this Canadian retailer at V7W 3C6 with countryCode CA. Confirm that all five ids parsed and explain any missing result before recomputing.`
- `Use $availability-investigator to repair this inspector URL so all supplied UPCIds and the Canadian postal code are encoded correctly.`

### Overrides And Config

- `Use $availability-investigator to check whether URD, LURD, or offer config is forcing this result or changing the link behavior.`
- `Use $availability-investigator to tell me whether forceAvailable, forceUnavailable, overrideUrl, ifUnavailableOverrideUrl, or direct-to-cart settings explain this outcome.`
- `Use $availability-investigator to explain if this is data quality, updater behavior, or override configuration.`

## Reusable Templates

Use these when you want to swap in a different product, retailer, or ZIP.

### Natural-Language Result Investigation

`Use $availability-investigator to tell me why <product description> at <retailer> in <postal code> is <available/unavailable/unknown/invalid>. Start with existing evidence, confirm which UPCId or UPCIds you used, and link the relevant admin pages.`

### Pick A Matching UPC

`Use $availability-investigator to find a <vendor or brand> UPC that has URD for <retailer>, inspect the latest run in <postal code>, and tell me whether the run looks healthy.`

### Fresh Run

`Use $availability-investigator to run a fresh availability inspection for <product description or UPCId> at <retailer> in <postal code> <and country code if non-US>. Compare it to the prior run and show the most relevant updated-scan logs.`

### INVALID Or UNKNOWN Triage

`Use $availability-investigator to explain whether this <INVALID or UNKNOWN> result is expected, inconclusive, or broken. Point to the exact updater step, request path, or configuration evidence that supports the conclusion.`

### Button Failure

`Use $availability-investigator to explain why the picker or locator button is broken for <product description or UPCId> at <retailer> in <postal code>. Check observed PDP URL, ATC URL, offer link strategy, URD, and LURD before concluding the run itself is broken.`

## What A Good Ask Includes

The best prompts usually include:

- product description, UPCId, availabilityId, or enough product context to resolve one
- retailer name
- postal code
- country code if the postal code is non-US
- whether you want read-only investigation first or a fresh run
- whether you want links, logs, or both
