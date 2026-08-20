# Live Investigation

Use this reference when the answer depends on real Pear data, live server logs, or live Java behavior.

## Contents

- [Preferred Local Repos And Helpers](#preferred-local-repos-and-helpers)
- [Evidence Ladder](#evidence-ladder)
- [Database Guidance](#database-guidance)
- [Live Log Guidance](#live-log-guidance)
- [JSP Guidance](#jsp-guidance)
- [Investigation Recipes](#investigation-recipes)

## Preferred Local Repos And Helpers

Use the actual Pear workstation repos and helper scripts when present:

- `$HOME/IdeaProjects/pear/api.pearcommerce.com`
- `$HOME/IdeaProjects/pear/admin`

Important helper paths in `api.pearcommerce.com`:

- `devops/db.sh`
- `devops/logs.sh`
- `devops/jsp.sh`
- `devops/jspx`

## Evidence Ladder

Prefer this order:

1. Existing inspect API response and saved URZA logs.
2. Source-code inspection in `admin` and `api.pearcommerce.com`.
3. Narrow read-only DB queries.
4. Live server logs.
5. JSP-backed live Java inspection.
6. Fresh run or broader write action.

Say explicitly when the evidence moved up this ladder.

## Database Guidance

Use `api.pearcommerce.com/devops/db.sh` for real data checks instead of guessing.

Default posture:

- prefer read-only SQL
- prefer narrow filters
- summarize findings instead of dumping large tables
- prefer `TEST` or the safest environment that still answers the question

Common patterns (all open split-tunnel Client VPN, resolve the current private target, use TLS, and close the VPN when MySQL exits):

- `devops/db.sh --dev "<SQL>"`
- `devops/db.sh --prod "<SQL>"`
- `devops/db.sh --read "<SQL>"`

Pass SQL as one quoted shell argument. Ordinary SQL string literals now work because `db.sh` connects locally through Client VPN rather than an SSM/eval chain.

Good tables and joins for this skill:

- `UPCRetailerZipAvailability`
- `AvailabilityLogRow`
- `UPCRetailerData`
- `LogicalUPCRetailerData`
- `RetailPartner`
- `ZipRetailerZone`
- `RetailerZipStoreId`
- `RetailPartner_to_Zipcode`
- `Store`
- `Offer`
- `LogicalUPC`

Use DB reads to answer questions like:

- is there already a URZA for this UPC, retailer, ZIP, and store context
- does the UPC have URD for the retailer
- is there a LURD override forcing URL or availability behavior
- does the retailer serve this ZIP through `ZipRetailerZone` or `RetailPartner_to_Zipcode`
- does the saved state match what the inspector is showing
- did the seeded postal code fan out into multiple store-specific URZAs
- is the blank skipped row just the parent store placeholder

## Live Log Guidance

Use `api.pearcommerce.com/devops/logs.sh` when saved inspector logs are not enough and the user needs current server-side behavior.

Common patterns:

- `devops/logs.sh -e TEST`
- `devops/logs.sh -e PROD`

Use live logs to answer questions like:

- did a fresh recompute start and finish
- which step is failing right now
- are there current exceptions that are not visible in saved URZA logs
- did a JSP or other helper emit the expected progress markers

If following a broad or noisy environment, focus on the smallest useful time window and the most distinctive retailer, UPC, URZA, or log prefix clues.

## JSP Guidance

Use `api.pearcommerce.com/devops/jsp.sh` only when the answer requires live Java behavior rather than just data or saved logs. It uploads/compiles through SSM, opens Client VPN, prints a private instance-IP URL, and stays open until Ctrl-C; load and follow `$pear-prod-jsp` for the full browser and cleanup workflow.

Good fits:

- live `Resources` or `Persistence`
- Spring bean behavior
- cache-dependent behavior
- updater method behavior that is hard to prove from SQL alone
- calling or inspecting live code paths such as PDP generation

Required safety:

- the no-parameter page must be a preview with zero side effects
- real work must live behind a visible `Run` button
- do not bypass the preview by jumping straight to `run=true`
- open the preview page in a browser before any run
- prefer `TEST` when possible

Use JSPs for this skill when you need to inspect things like:

- updater `getPdpUrl(...)` output in live context
- live retailer or offer config interactions
- cache or bean state that explains a mismatch between code and saved data

For ORM-backed writes inside a JSP, prefer `Persistence.global().orm()` and entity `save()` patterns rather than raw SQL.

## Investigation Recipes

## API-First Flow

Use this flow by default when the skill has authenticated access to the Pear API:

1. POST `/v1/inspect-availabilities` with the resolved ids, retailer, postal code, country code, and `triggerComputes`.
2. Read `details`, `message`, `processingStatus`, `status`, `pdpURL`, `atcURL`, and `details.logs`.
3. If `initialPollResults` shows inflight rows, poll `/v1/resolve-upcs` with those availability ids.
4. Re-call `/v1/inspect-availabilities` with `triggerComputes=NO` and `poll=true` to refresh full details and updated saved logs.
5. Use the admin page only when the user wants a link, visual parity, or a live UI follow-up.

For multi-UPC requests, verify the count at each stage: supplied tokens, parsed UPC ids, resolved UPCs, initial rows, and final details. Do not treat missing products as an availability verdict until input parsing and filtering are explained.

Send the force request to the environment the user asked to test. Logger prefixes and server labels can reveal that a run came from production, test, dashboard, or another host, but provenance alone does not prove which configuration was intended.

Environment and origin clues:

- `AvailabilityLogger` plaintext logs can reveal the Pear environment via logger markers such as `PROD-...` or `TEST-...`.
- Some messages also include the server label, such as `DASHBOARD-i-...`, which can help correlate a run with live server logs or explain that a run was triggered from the dashboard path.
- This provenance is helpful context, especially for “which path ran this?” questions, but it should not replace the availability verdict itself.

### Why did this availability result happen

Start with:

- inspect API response
- saved URZA logs
- URD, LURD, retailer, and ZIP/store mapping data

Move to DB or live logs only if the saved inspector evidence is not enough.

### Show me relevant logs from the updated scan

Start with:

- newest saved inspector run for the relevant URZA or URZA set

For store-ID retailers:

- identify the relevant child store rows first
- do not anchor only on the blank skipped placeholder row
- summarize whether the zone fanout itself succeeded before diving into one store’s logs

If the user wants a fresh run:

- trigger the normal inspector recompute path
- use live logs only if the saved run output is incomplete or suspicious

### The run succeeded but the picker button is broken

Start with:

- `detail.pdpURL`
- `detail.atcURL`
- `Offer.retailerLinkStrategy`
- offer direct-to-cart fields
- `URD.urlOverride`
- `URD.directToCart`
- `LURD.overrideUrl`
- `LURD.ifUnavailableOverrideUrl`
- URL-enabled retailer-list filtering
- picker in-store versus buy-online mode
- widget default-tab configuration

If the availability is healthy but no URL is produced, inspect the updater's PDP/ATC fallback. Verify any proposed PDP against the retailer's public site; product-resolution APIs do not necessarily expose a stable consumer URL.

Use a JSP only if the missing proof is in live PDP generation or other runtime-only behavior.
