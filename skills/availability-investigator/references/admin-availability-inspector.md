# Admin Availability Inspector And API Flow

Use this reference when you need the inspector input surface, direct API request shape, admin link patterns, or saved-log behavior.

## Contents

- [UI Surface](#ui-surface)
- [API Surface](#api-surface)
- [Store-Zone Fanout](#store-zone-fanout)
- [Admin Links](#admin-links)
- [Saved Log Behavior](#saved-log-behavior)
- [PDP URL Notes](#pdp-url-notes)

## UI Surface

Admin route and template:

- `admin/static/js/pear_dashboard.js`
- `admin/static/templates/availability_inspector.html`

Actual admin state route:

- `/availability-inspector?upcId&offerId&retailerId&vendorId&availabilityId&postalCode&logicalUPCId&countryCode`

Underlying admin inputs:

- `vendorId`
- `offerId`
- `logicalUPCId`
- `upcId`
- `retailerId`
- `availabilityId`
- `postalCode`
- `countryCode`
- `triggerComputes = NO | IF_NEEDED | FORCE`

The admin submit button is disabled unless all of these are true:

- at least one of `logicalUPCId`, `upcId`, `vendorId`, or `offerId` is present
- `postalCode` is present
- a retailer is selected in the typeahead

Skill-specific input rules:

- Require postal code for any actual run or rerun.
- Require country code when the postal code is not US.
- Resolve retailer name or enum to retailer id yourself; do not require the user to know `retailerId`.
- Resolve product text, vendor, and brand language yourself; the admin UI does not do that step for the user.
- For comma-delimited ids, validate every id before submitting. Preserve the user-supplied count and call out malformed separators rather than silently dropping products.

## API Surface

Primary controller entry point:

- `DashboardApp.inspectAvailabilities`

Request shape:

- `offerId`
- `vendorId`
- comma-delimited `upcId`
- comma-delimited `availabilityId`
- comma-delimited `retailerId`
- `postalCode`
- `countryCode`
- `poll`
- `triggerComputes`
- `lupcId`

Important mismatch:

- the admin URL/state parameter is `logicalUPCId`
- the API request field consumed by `DashboardApp.inspectAvailabilities(...)` is `lupcId`

Response details commonly used in investigations:

- `retailers`
- `upcs`
- `availabilityId`
- `upcId`
- `vendorId`
- `retailerId`
- `retailerEnum`
- `postalCode`
- `storeId`
- `processingStatus`
- `status`
- `inStoreStatus`
- `shipToHomeStatus`
- `dateComputeStarted`
- `dateComputed`
- `message`
- `logs`
- `pdpURL`
- `atcURL`
- `itemId`
- `instacartItemId`
- `price`
- `initialPollResults`
- warnings and global warnings

The admin UI posts to `/v1/inspect-availabilities` and then polls `/v1/resolve-upcs` to watch in-flight URZAs settle.

API-first interpretation:

- `/v1/inspect-availabilities` is the main endpoint for both inspection and recompute.
- `details.logs` in that response is the saved plaintext log artifact from `AvailabilityLogger.getPlaintextLog(...)`.
- `/v1/resolve-upcs` is status-only. It helps track inflight URZAs, but it does not replace a follow-up inspect call when you want refreshed `details`, `message`, `processingStatus`, or `logs`.
- A practical API-first loop is:
  - call `/v1/inspect-availabilities`
  - read `details` and `initialPollResults`
  - if rows are inflight, poll `/v1/resolve-upcs` with those availability ids
  - re-call `/v1/inspect-availabilities` with `triggerComputes=NO` and `poll=true` to refresh full details and logs

The controller can auto-fill postal code from an `availabilityId` or from a retailer-served ZIP in some cases, and it canonicalizes Canadian postal codes. Keep the skill stricter than the UI: require an explicit postal code for any new run or rerun.

For multi-id requests:

- construct `upcId` as a comma-delimited list with no accidental whitespace inside an id
- URL-encode the complete query when building an admin link, especially Canadian postal codes
- compare requested UPC count with parsed UPC count, resolved UPC count, and returned detail count
- investigate missing rows before rerunning; common causes include a missing comma, bad vendor scope, no matching UPC, no relevant URD, or retailer filtering

## Store-Zone Fanout

Do not assume the inspector runs one exact `postalCode -> one URZA` check.

For store-ID retailers such as Walmart:

- the requested postal code can seed a `ZipRetailerZone` or `RetailerZipStoreId.loadByZip(...)` lookup
- the inspector can create or surface multiple store-specific URZAs for the zone
- the resulting rows may show nearby ZIPs and many `storeId` values, not just the original requested ZIP
- the inspector can also show a blank-store placeholder row that was skipped after store-specific rows were produced
- for retailers that allow geo-agnostic ship-to-home behavior but still depend on zip for normal availability, that blank placeholder can show `SKIPPED` / `invalid zip: null` even when the child rows are healthy

Interpretation rule:

- the postal code in the form is the lookup seed
- the returned table is the actual store-specific result set
- the real investigation surface is often the row set, not one single row

## Admin Links

Use these when helpful:

- Availability inspector:
  - `https://admin.pearcommerce.com/availability-inspector?offerId=<offerId>&retailerId=<retailerId>&vendorId=<vendorId>&postalCode=<postalCode>`
- Vendor overview:
  - `https://admin.pearcommerce.com/<vendorId>/overview`
- UPC detail:
  - `https://admin.pearcommerce.com/<vendorId>/product/<upcId>`
- Retailer edit:
  - `https://admin.pearcommerce.com/retailer_edit/<retailerId>`
- Default `LogicalUPCRetailerData` object view:
  - `https://admin.pearcommerce.com/objects/LogicalUPCRetailerData/logicalUPCId/<logicalUPCId>`
- Faster logical UPC landing-page edit view when offer context is known:
  - `https://admin.pearcommerce.com/<vendorId>/landing_page/<offerId>/logical_upc/<logicalUPCId>`

Prefer the generic LURD object link by default. Add the landing-page link only when offer context is actually known.

## Saved Log Behavior

Inspector logs come from `AvailabilityLogger.getPlaintextLog(...)`.

Important consequences:

- `details.logs` is already a flattened plaintext view of saved rows.
- The admin UI groups that plaintext into runs using logger markers like `CREATE_LOGGER` and terminal markers like `COMPUTED` or `SKIPPED_*`.
- When the user asks for logs from an updated scan, prefer the newest relevant run rather than every historical line.

Environment and provenance clues in the plaintext logs:

- `AvailabilityLogger` markers carry a logger id that starts with the Pear environment, such as `PROD-...` or `TEST-...`.
- Individual log messages may include the server label, for example `DASHBOARD-i-... set reason: ...`, because some availability messages log `serverEnv.server`.
- These clues are useful for provenance and correlation with live logs, especially when comparing dashboard-triggered runs versus other compute paths.
- Treat provenance as supporting evidence, not the health verdict by itself.

The admin UI also synthesizes some display labels:

- `BATCH COMPUTED` is a UI label that appears when the message suggests batch or prewarm behavior and there is little or no detailed run log for the row
- `SKIPPED` can include `SKIPPED_STORE_ID_PLACEHOLDER`, `SKIPPED_INVALID`, `SKIPPED_NON_CANONICAL`, or `SKIPPED_DEDUPED`

For store-zone retailers, a blank zip/store `SKIPPED` row often represents the seed placeholder parent and should not be confused with the child store rows that actually ran.
When that row says `invalid zip: null`, a common explanation is:

- the retailer allowed a geo-agnostic placeholder to exist in the request flow
- the shared recomputer still enforced zip validity because the retailer is still `itemAvailabilityDependsOnZip = true`
- the placeholder was skipped, while the real store-specific child URZAs continued and produced the meaningful result

When a force request appears stuck on `BATCH COMPUTED`:

- do not use the label itself as the processing state
- inspect `processingStatus`, `initialPollResults`, timestamps, child URZAs, and the newest logger marker
- poll `/v1/resolve-upcs` only for inflight ids
- re-call `/v1/inspect-availabilities` with `triggerComputes=NO` to retrieve refreshed details and logs
- force again only when evidence shows no fresh compute was triggered or the expected rows never settled

Prioritize excerpts around:

- `PRE_PROCESSING`
- `COMPUTE_TRIGGERED`
- `COMPUTING`
- `COMPUTED`
- `SKIPPED_*`
- request failures
- HTTP status clues
- item-id decisions
- final reason or failure point

For store-zone retailers, prioritize:

- the newest relevant store-specific rows
- whether the row set fans out into many stores
- whether the placeholder row was skipped while child rows were computed
- whether store rows disagree with each other

## PDP URL Notes

The inspector response exposes `detail.pdpURL` from `urza.url` and `detail.atcURL` from `urza.directToCartUrl`.

Use that observed PDP URL first. Only fall back to updater-derived `getPdpUrl(...)` logic when the observed PDP URL is missing or clearly unusable.

The inspector URL fields and the retailer-list URL are not identical contracts. An URZA can be `AVAILABLE` and produce a map pin while the URL-enabled retailer-list path omits it because neither a PDP nor an ATC URL can be generated.

For a one-product logical UPC, Pear can fall back from a preferred DTC path to `getPdpUrl(...)` when DTC returns null and DTC is not forced. Multi-product add-all flows or explicitly forced DTC paths can still require `getAtcUrl(...)`.

Implementing or repairing `getPdpUrl(...)` must return a real consumer product page. It does not by itself add ship-to-home support, direct-to-cart support, or justify changing availability statuses.
