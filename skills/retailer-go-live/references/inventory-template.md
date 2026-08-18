# Retailer Go-Live Inventory Template

Record one row per retailer before starting imports. This template is used by the one-by-one go-live workflow.

## Inventory columns

| Retailer | enumName | Updater class | Has `getAllStores()` | `itemAvailabilityDependsOnZip` | `locationAgnosticShipToHome` | `live` flag | Store import country | Special zone import | Status |
|---|---|---|---|---|---|---|---|---|---|

## Field definitions

- **enumName**: The value stored in `RetailPartner.enumName` (e.g. `carrefourfr`).
- **Updater class**: Fully-qualified `UPCRetailerZipAvailabilityRecomputer` subclass that implements `getAllStores()` and/or `storeImportCountryCodes()`.
- **Has `getAllStores()`**: `true` if the updater can return an authoritative `Map<Zipcode, List<Store>>` for the whole country. `false` means zone import is not store-based (e.g. Houra postal prefixes or Amazon country-wide coverage).
- **`itemAvailabilityDependsOnZip`**: Expected flag after the data migration. Zip-dependent retailers need per-store zones.
- **`locationAgnosticShipToHome`**: Expected flag. `true` means ship-to-home availability does not vary by store/zip.
- **`live`**: Whether the `RetailPartner` should be live in the target environment.
- **Store import country**: Usually `FR` for these French retailers; the value passed to `storeImportCountryCodes()`.
- **Special zone import**: Notes when the retailer does not use `importStoresFromRetailer()` (e.g. Houra uses `HouraDataImports.houraPostalCodePrefixes()`).
- **Status**: `pending`, `deployed`, `zones-imported`, `validated`, `done`.

## Example row

| Carrefour France | `carrefourfr` | `com.pear.itemurlupdater.fr.CarrefourAvailabilityUpdater` | yes | yes | no (shipToHome = INVALID) | yes | FR | none | pending |

## Starting checklist for the 12 French retailers

| Retailer | enumName | Updater class | Has `getAllStores()` | `itemAvailabilityDependsOnZip` | `locationAgnosticShipToHome` | `live` | Store import country | Special zone import | Status |
|---|---|---|---|---|---|---|---|---|---|
| Aldi France | `aldifr` | `com.pear.itemurlupdater.fr.AldiAvailabilityUpdater` | yes | yes | yes | yes | FR | none | pending |
| Amazon FR | `amazonfr` | `com.pear.itemurlupdater.fr.AmazonAvailabilityUpdater` | no | no | yes | yes | FR | Country-wide `*` coverage | pending |
| Auchan France | `auchanfr` | `com.pear.retailintegrations.auchan.AuchanAvailabilityUpdater` | yes | yes | no | yes | FR | none | pending |
| Boulanger France | `boulangerfr` | `com.pear.itemurlupdater.fr.BoulangerAvailabilityUpdater` | yes | yes | — | yes | FR | none | pending |
| Carrefour France | `carrefourfr` | `com.pear.itemurlupdater.fr.CarrefourAvailabilityUpdater` | yes | yes | no | yes | FR | none | pending |
| Chronodrive France | `chronodrivefr` | `com.pear.retailintegrations.fr.chronodrive.ChronodriveBatchAvailabilityUpdater` | yes | yes | no | yes | FR | none | pending |
| CoursesU | `coursesu` | `com.pear.retailintegrations.fr.coursesu.CoursesUAvailabilityUpdater` | yes | yes | no | yes | FR | none | pending |
| Intermarché France | `intermarchefr` | `com.pear.retailintegrations.fr.intermarche.IntermarcheFranceAvailabilityUpdater` | yes | yes | no | yes | FR | none | pending |
| Lidl France | `lidlfr` | `com.pear.lidl.LidlAvailabilityUpdater` | yes | yes | yes | yes | FR | none | pending |
| Maxi Zoo France | `maxizoofr` | `com.pear.itemurlupdater.fr.MaxiZooAvailabilityUpdater` | yes | yes | — | yes | FR | none | pending |
| Monoprix Courses | `monoprix_courses_fr` | `com.pear.retailintegrations.fr.monoprixcourses.MonoprixCoursesAvailabilityUpdater` | yes | yes | no | yes | FR | none | pending |
| Naturalia France | `naturaliafr` | `com.pear.itemurlupdater.fr.NaturaliaAvailabilityUpdater` | yes | yes | yes | yes | FR | none | pending |

### Notes
- **Houra** (`houra`) and **E.Leclerc e-commerce** (`leclerc`) are also landed but are location-agnostic; they do not require a store/zone import via `importStoresFromRetailer()`. Houra uses `HouraDataImports.houraPostalCodePrefixes()` instead.
- **E.Leclerc Drive** (`leclercdrive`) is included in the 12-store list and has a store importer; E.Leclerc e-commerce (`leclerc`) is a separate location-agnostic variant.
