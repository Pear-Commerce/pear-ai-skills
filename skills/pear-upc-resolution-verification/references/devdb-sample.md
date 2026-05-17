# UPC Resolution Devdb Sample

Last refreshed: 2026-05-17 against `origin/master` at `8497dea611`.

Run from the relevant `api.pearcommerce.com` worktree. The Gradle `test` task sets `ENV=CI`, but the MySQL/Snowflake env vars below keep the selected scripts pointed at the shared devdb-style backing services used for local verification.

## Environment Prefix

```bash
MYSQL_CREDENTIALS_SECRET=prod-db-10-2025 \
MYSQL_HOST=analytics-database.pearcommerce.com \
MYSQL_HOST_READ=analytics-database.pearcommerce.com \
MYSQL_HOST_WRITE=analytics-database.pearcommerce.com \
SNOWFLAKE_CREDENTIALS_SECRET=snowflake-2025-12-01
```

Use GNU `timeout` when available to prevent a drifting retailer scrape from owning the terminal forever:

```bash
/opt/homebrew/opt/coreutils/libexec/gnubin/timeout 20m
```

## Known-Good Sample Command

```bash
MYSQL_CREDENTIALS_SECRET=prod-db-10-2025 \
MYSQL_HOST=analytics-database.pearcommerce.com \
MYSQL_HOST_READ=analytics-database.pearcommerce.com \
MYSQL_HOST_WRITE=analytics-database.pearcommerce.com \
SNOWFLAKE_CREDENTIALS_SECRET=snowflake-2025-12-01 \
/opt/homebrew/opt/coreutils/libexec/gnubin/timeout 20m ./gradlew test \
  --tests com.pear.upcresolution.ItemIdInfoResolverTest.getDefinedClass \
  --tests com.pear.upcresolution.CostcoItemIdInfoResolverTest \
  --tests com.pear.upcresolution.SamsClubItemIdResolverTest \
  --tests com.pear.upcresolution.UPCResoGraphTest.testCostoInStock \
  --tests com.pear.upcresolution.UPCResoGraphTest.testInstacartPDP \
  --tests com.pear.upcresolution.UPCResoGraphTest.testInstacartPDPToImage \
  --tests com.pear.retailerFeasibility.us.dollargeneral.DollarGeneralPlanTest.testFetchProductByUpc \
  --tests com.pear.retailerFeasibility.us.dollartree.DollarTreePlanTest.testSearchProductByUpc \
  --tests com.pear.retailerFeasibility.us.dollarstore.DollarTreeProductSearchTest.testSearchProductByUpc \
  --tests com.pear.retailerFeasibility.us.dollarstore.FamilyDollarProductSearchTest.testSearchProductByUpc \
  --tests com.pear.retailerFeasibility.ca.costco.CostcoCanadaPlanTest.testSearchByUpc \
  --tests com.pear.retailerFeasibility.ca.petsmart.PetsmartCAPlanTest.testScrapePetSmartCAItemDataFromUPC \
  --tests com.pear.retailerFeasibility.us.homedepot.HomeDepotUSPlanTest.testSearchByUPC \
  --tests com.pear.retailerFeasibility.gb.iceland.IcelandPlanTest.testSearchProducts_JaffaCakes_ReturnsResults \
  --tests com.pear.retailerFeasibility.gb.morrisons.MorrisonsPlanTest.testFindProduct_Pepsi_ContainsExpectedProductId \
  -PnoLint --no-build-cache --console=plain
```

## Passing Coverage

Deterministic UPC resolver coverage:

- `ItemIdInfoResolverTest.getDefinedClass`
- `CostcoItemIdInfoResolverTest`
- `SamsClubItemIdResolverTest`

Graph and image-adjacent coverage:

- `UPCResoGraphTest.testCostoInStock`
- `UPCResoGraphTest.testInstacartPDP`
- `UPCResoGraphTest.testInstacartPDPToImage`

Live UPC feasibility coverage:

- Dollar General US
- Dollar Tree US
- Family Dollar US
- Costco Canada
- PetSmart Canada
- Home Depot US
- Iceland GB
- Morrisons GB

## Known Master-Failing Exclusions

Disable or continue excluding these sampled tests unless they are refreshed and proven passing on master/base:

- `UPCResoGraphTest.smokeTest`: null graph root on master/devdb.
- `UPCResoGraphTest.testWalmart`: null graph root on master/devdb.
- `UPCResoGraphTest.testTargetBrandSearch`: Target brand scrape failure on master/devdb.
- `UPCResoGraphTest.testTinEyeDirect`: timeout on master/devdb.
- `UPCResoGraphTest.testLacroixCostco`: null graph root on master/devdb.
- `UPCResoGraphTest.testInstacart`: null graph root on master/devdb.
- `UPCResoGraphTest.testCityhive`: timeout on master/devdb.
- `UPCRetailerResolutionTest.targetFailedLarabar`: timeout on master/devdb.
- `UPCRetailerResolutionTest.instacartFailedLarabar2`: timeout on master/devdb.
- `UPCRetailerResolutionTest.instacartFailedLarabar3`: timeout on master/devdb.
- `UPCRetailerResolutionTest.instacartFailedLarabar4`: timeout on master/devdb.
- `SainsburyPlanTests.testResolvedItem_PepsiMax_HasExpectedEanAndProductUid`: expected product assertion failed on master/devdb.
- `TescoPlanTest.testProductSearch_PepsiMax_HasExpectedGtinAndProductId`: expected product assertion failed on master/devdb.
- `CoopPlanTest.testSearch_ArlaCravendaleMilk`: Co-op search scrape failure on master/devdb.

## If The Sample Fails

First rerun only the failing filter with the same env. If it still fails, compare against a clean master/base worktree. If master passes and the branch fails, debug the branch. If master also fails, update this reference and disable the specific drifting probe with a date/reason instead of broadening the disabled surface.
