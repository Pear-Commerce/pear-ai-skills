# Data Surfaces

Use this reference when you need to know which Pear entity or setting explains a result.

## Contents

- [URZA](#urza)
- [URD](#urd)
- [LURD](#lurd)
- [Retailer Settings](#retailer-settings)
- [Offer and Logical UPC Surfaces](#offer-and-logical-upc-surfaces)
- [Location and Store Mapping](#location-and-store-mapping)
- [Quick Diagnosis Map](#quick-diagnosis-map)

## URZA

`UPCRetailerZipAvailability` (`URZA`) is the run/result record.

Use URZA to answer:

- What availability result was saved?
- What ZIP and store was used?
- Did the run compute, skip, or stall?
- What PDP URL or ATC URL did the run produce?

Fields to prioritize:

- `status`
- `inStoreStatus`
- `shipToHomeStatus`
- `processingStatus`
- `reason` / `message`
- `dateComputedStart`
- `dateComputed`
- `zip`
- `storeId`
- `countryCode`
- `url`
- `directToCartUrl`
- `price`

## URD

`UPCRetailerData` (`URD`) is the UPC-to-retailer data and id state.

Use URD to answer:

- Does this UPC have the retailer ids needed to run?
- Is there a URL override?
- Does Pear think the retailer carries this UPC?
- Is there data-quality evidence that explains the run?

Fields to prioritize:

- `itemId`
- `instacartItemId`
- `urlOverride`
- `price`
- `knownCarries`
- `knownNotCarries`
- `sRetailerItemData`
- `directToCart`

## LURD

`LogicalUPCRetailerData` (`LURD`) is the logical-UPC-level override and button behavior layer.

Use LURD to answer:

- Is the retailer forced available or forced unavailable for this logical UPC?
- Is there an override URL that bypasses normal PDP generation?
- Is direct-to-cart behavior being forced?

Fields to prioritize:

- `overrideUrl`
- `ifUnavailableOverrideUrl`
- `overridePrice`
- `directToCart`
- `forceAvailable`
- `forceUnavailable`
- `ifUnavailableDirectToCart`

## Retailer Settings

`RetailPartner` explains retailer-specific availability behavior.

Use retailer settings to answer:

- Does this retailer depend on ZIP or stores?
- Is the retailer live?
- Which updater path should be selected?
- Is this an Instacart-like path or shared-platform path?

Fields to prioritize:

- `itemAvailabilityDependsOnZip`
- `locationAgnosticShipToHome`
- `servicesEverywhere`
- `servicesEverywhereCanada`
- `hasZones`
- `live`
- `instacartId`
- `availabilitySharedImagesAndIds`
- `ecommerceUrl`
- `itemUpdateConfiguration.itemUpdaterClass`

Interpret `locationAgnosticShipToHome` carefully:

- the user must still provide a postal code for an inspector run
- the setting can cause the internal ship-to-home path or placeholder URZA to use a null/canonical location
- it does not automatically bypass every shared zip-validation branch
- judge the intended ship-to-home row separately from store-specific in-store rows

## Offer and Logical UPC Surfaces

Use offer and logical UPC state to answer:

- Which logical UPCs and UPCs are in scope?
- Could offer-level retailer linking or logical-UPC overrides explain button behavior?

Fields and methods to prioritize:

- `Offer.getLogicalUPCsToUPCs(...)`
- `Offer.retailerLinkStrategy`
- `Offer.directToCartLink`
- `Offer.directToCartRetailer`
- `Offer.directToCartFallbackLink`
- `Offer.directToCartNoItemsAvailableMessagePage`
- `Offer.preferRetailerPDPOverInstacartDTCForInstacartFallbackRetailers`
- `Offer.preferInstacartDTCOverKrogerDTC`
- offer retailer constraints
- logical UPC to UPC composition

For picker presentation, also inspect widget configuration in the offers surface when applicable, including whether the buy-online tab is active by default. A default tab can explain what the user sees, but it does not change the underlying availability result.

Relevant `Offer.retailerLinkStrategy` values from the code:

- `DTC`
- `PDP`
- `DTC_EXCEPT_TARGET_AND_KROGER`
- `DTC_EXCEPT_TARGET_AND_KROGER_INCLUDING_DESKTOP_TARGET`

## Location and Store Mapping

Use these surfaces when ZIP, zone, or store behavior looks suspicious:

- `ZipRetailerZone`
- `RetailerZipStoreId`
- `RetailPartner_to_Zipcode`
- `Store`

Use them to answer:

- Does the retailer serve this ZIP?
- Is there a valid zone mapping?
- Is a storeId required but missing?
- Could a missing or stale store import explain the run?
- Did one seeded postal-code request fan out into multiple store-specific URZAs?
- Is a skipped placeholder row expected because store-specific children were created?

## Quick Diagnosis Map

Use this mapping when you need to decide where to look first:

- Missing ids or bad retailer data:
  - start with URD
- Forced availability or forced unavailability:
  - check LURD, then URD URL overrides
- Successful run but broken button:
  - check URZA URL, URZA direct-to-cart URL, offer `retailerLinkStrategy`, offer direct-to-cart settings, LURD override URLs, URD direct-to-cart, updater `getPdpUrl(...)`
- Map pin or in-store row but no retailer-list entry:
  - first confirm in-store versus buy-online mode, then check whether the URL-enabled list path received a non-null PDP/ATC URL and whether widget configuration opened the expected tab
- Available URZA but null URL:
  - inspect `getAtcUrl(...)` preference and `getPdpUrl(...)` fallback; do not convert ship-to-home to available merely to make the retailer visible
- Invalid ZIP or retailer cannot serve ZIP:
  - check retailer settings, `ZipRetailerZone`, `RetailerZipStoreId`, `RetailPartner_to_Zipcode`, `Store`
- Multiple rows for one postal-code request:
  - treat the request as a zone/store fanout and inspect the store-specific URZA set before concluding anything from a single row
- Unknown or inconclusive run:
  - check URZA logs, updater path, HTTP behavior, parser failures, item-id selection
- Fewer results than supplied UPCs:
  - validate delimiters and ids, vendor ownership, URD presence, retailer constraints, and filtering before recompute
