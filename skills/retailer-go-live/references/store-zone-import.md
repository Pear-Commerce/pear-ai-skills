# Store / Zone Import

For each retailer that has a store importer, run `importStoresFromRetailer()` in the sandbox, validate the zones, then proceed to the next retailer. Do not batch multiple retailers unless the user explicitly asks.

## Method to call

`UPCRetailerZipAvailabilityRecomputer.importStoresFromRetailer(RetailPartner retailer)` is the single entry point. It:

1. Calls `determineCountryCodes(retailer)` (from `storeImportCountryCodes()` or inferred from `getAllStores()`).
2. Loads the authoritative store snapshot via `getAllStores(retailer)`.
3. Computes the canonical postcode anchors from the snapshot or from `Zipcode` rows with lat/lng for the country.
4. Loads existing `Store` rows for the retailer.
5. Diff-stores new/changed/removed stores and saves them.
6. Creates/updates `ZipRetailerZone` rows for the anchor postcodes.

## JSP template

Create a per-retailer JSP in `WebContent/` (sandbox only) to invoke it:

```jsp
<%@ page import="com.pear.entities.inventory.RetailPartner" %>
<%@ page import="com.pear.itemurlupdater.UPCRetailerZipAvailabilityRecomputer" %>
<%@ page import="com.pear.itemurlupdater.fr.CarrefourAvailabilityUpdater" %>
<%@ page contentType="text/html;charset=UTF-8" language="java" %>
<%
    RetailPartner retailPartner = RetailPartner.forEnumName("carrefourfr");
    UPCRetailerZipAvailabilityRecomputer.getInstance(CarrefourAvailabilityUpdater.class)
        .importStoresFromRetailer(retailPartner);
%>
```

Upload the JSP to the sandbox (via `$pear-prod-jsp` or EB deploy) and run it. Check the server logs for `[importStores carrefourfr]` output and store counts.

## Alternative: data migration

If the store import is meant to be run as a one-time `SimpleORMDataMigration` (e.g. Houra), use the migration in `*DataImports.java` and run it via the migration runner or JSP instead of `importStoresFromRetailer()`.

## What to verify after import

- No errors in the JSP output / logs.
- `Store` rows exist for the retailer: `new Store().loadWhere("retailerId = ? and live = 1", retailer.id)` returns the expected count.
- `ZipRetailerZone` rows cover the expected postcodes.
- `RetailPartner.itemAvailabilityDependsOnZip` and `locationAgnosticShipToHome` are set as expected in the target environment.

## Non-store-zone retailers

For retailers without a store importer (e.g. Amazon FR, Houra), use their specific zone setup instead of `importStoresFromRetailer()`:
- Amazon FR: `RetailPartnerPostalCodePrefix.replaceCountryCoverageWithCountryWide(retailer.id, "FR")`.
- Houra: `HouraDataImports.houraPostalCodePrefixes()`.
