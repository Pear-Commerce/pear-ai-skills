# Code Entry Points

Use this reference when you need the real source files or quick search anchors.

## Contents

- [Admin Surface](#admin-surface)
- [API Surface](#api-surface)
- [Logs and Run State](#logs-and-run-state)
- [Read Path and Recompute Path](#read-path-and-recompute-path)
- [Picker And URL Visibility](#picker-and-url-visibility)
- [Data Surfaces](#data-surfaces)
- [Recommended Search Sequence](#recommended-search-sequence)

Preferred local repos:

- `$HOME/IdeaProjects/pear/admin`
- `$HOME/IdeaProjects/pear/offers` for picker and product-locator presentation behavior
- `$HOME/IdeaProjects/pear/api.pearcommerce.com`

If those exact paths are not present, inspect equivalent checked-out copies first. Use GitHub only as fallback.

Operational helpers in `api.pearcommerce.com`:

- `devops/db.sh` (direct private TLS connection over split-tunnel Client VPN; requires `devops/vpn.sh` running or `--start-vpn`; pass SQL as one quoted argument and use ordinary SQL literals)
- `devops/logs.sh`
- `devops/jsp.sh` (SSM upload/compile plus a private-IP browser preview; requires an active Client VPN from `devops/vpn.sh` or `--start-vpn`, which holds it until Ctrl-C)
- `devops/jspx` (retained-JSP compatibility execution through SSM; no public-IP SSH/rsync)

## Admin Surface

Start here when you need the inspector UI behavior:

- `admin/static/js/pear_dashboard.js`
  - `AvailabilityInspector`
  - state route and submit/poll behavior
- `admin/static/templates/availability_inspector.html`

Useful search patterns:

- `availability-inspector`
- `inspect-availabilities`
- `triggerComputes`
- `initialPollResults`
- `logRuns`
- `batchCompute`
- `BATCH COMPUTED`
- `LogicalUPCRetailerData`
- `objects/{type}/{field}/{value}`

## API Surface

Start here when you need the core inspector behavior:

- `DashboardApp.inspectAvailabilities`
- `SInspectAvailabilitiesRequest`
- `SInspectAvailabilitiesResponse`
- `RetailerListController.retailerList(...)`
- `AvailabilitiesController.resolveInflightUpcs`

Useful search patterns:

- `inspectAvailabilities`
- `SInspectAvailabilitiesRequest`
- `SInspectAvailabilitiesResponse`
- `resolve-upcs`
- `globalWarnings`
- `ZipRetailerZone`
- `RetailerZipStoreId.loadByZip`

## Logs and Run State

Use these when the question is about saved logs, run grouping, or inflight state:

- `AvailabilityLogger`
- `RealtimeAvailabilities`
- `RecentlyRequestedAvailabilitiesProcessor`
- `UPCRetailerZipAvailability.setReason(...)`

Useful search patterns:

- `getPlaintextLog`
- `CREATE_LOGGER`
- `COMPUTED`
- `SKIPPED`
- `SKIPPED_STORE_ID_PLACEHOLDER`
- `InflightStatus`
- `waitForDetermineRecomputeResults`
- `loggerId`
- `set reason:`
- `serverEnv.server`

## Read Path and Recompute Path

Use these when the question is about how the run was selected, skipped, or recomputed:

- `RetailerListController.retailerList(...)`
- `UPCRetailerZipAvailabilityRecomputer`
- `AvailabilitiesComputer2023`
- `PearApp` retailer-list assembly

Useful search patterns:

- `setGlobalOverrideFromUPCRetailerDataIfPresent_Unsaved`
- `getReasonInvalid`
- `getPdpUrl`
- `retailerLinkStrategy`
- `directToCartFallbackLink`
- `ZipRetailerZone`
- `ALLOW_ON_THE_FLY_AVAILABILITY_COMPUTE_WITH_STORE_ID`
- `RetailerZipStoreId.loadByZip`
- `getUrlForConfiguration`
- `allowSinglePDPForMultipleUPCs`
- `includeUrls`

## Picker And URL Visibility

Use these when a map pin exists but the retailer list or button is missing:

- `PearApp` URL-enabled retailer-list assembly
- `UPCRetailerZipAvailabilityRecomputer.getUrlForConfiguration(...)`
- retailer updater `getPdpUrl(...)` and `getAtcUrl(...)`
- `offers/static/js/offers/picker.js`
- widget configuration fields controlling buy-online and in-store tabs

Useful search patterns:

- `upc.status == Status.AVAILABLE && includeUrls`
- `upc.setStatus(Status.UNAVAILABLE)`
- `Trying PDP url even though we preferred DTC`
- `buyOnlineTabActive`
- `previewTab`

## Data Surfaces

Use these when the explanation depends on entity fields:

- `UPCRetailerZipAvailability`
- `UPCRetailerData`
- `LogicalUPCRetailerData`
- `RetailPartner`
- `Offer`
- `ZipRetailerZone`
- `RetailPartner_to_Zipcode`
- `Store`

Useful search patterns:

- `itemAvailabilityDependsOnZip`
- `servicesEverywhere`
- `hasZones`
- `itemUpdaterClass`
- `knownCarries`
- `urlOverride`
- `forceAvailable`
- `forceUnavailable`

## Recommended Search Sequence

When you are dropped into a repo cold, this usually finds the right place quickly:

1. Search `inspectAvailabilities`
2. Search `AvailabilityInspector`
3. Search `AvailabilityLogger`
4. Search `getPdpUrl`
5. Search `retailerLinkStrategy`
6. Search the entity name that matches the suspected failure surface:
   - `UPCRetailerZipAvailability`
   - `UPCRetailerData`
   - `LogicalUPCRetailerData`
   - `RetailPartner`
