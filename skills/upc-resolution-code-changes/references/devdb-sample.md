# UPC Resolution Devdb Sample

Last refreshed: 2026-05-17 against `origin/master` at `8497dea611`.

Long full-e2e sample refreshed the same day against speedup branch `f97e685c0d` on base `8487cee193`.

Run from the relevant `api.pearcommerce.com` worktree. Default any Gradle verification that touches Spring/Pear resources, SimpleORM, real entity rows, UPC resolver scripts, AppConfig, Snowflake, or live retailer data to this shared devdb-style backing service. The Gradle `test` task sets `ENV=CI`, but the MySQL/Snowflake env vars below keep the selected scripts pointed at the shared devdb-style backing services used for local verification instead of empty/local MySQL. Pure compile and pure unit tests can run without this prefix.

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

## Long Full-E2E Harness

Full `UPCRetailerResolutionTest` scripts can legitimately run longer than the repo's default 60s JUnit timeout, and a drifting full scrape can keep background resolver work alive. For the full-e2e sample, run one filter at a time with an external timeout and a local Gradle init script that disables JUnit parallelism and raises the per-test timeout.

Ensure `/tmp/upc-long-e2e.init.gradle` contains:

```groovy
allprojects {
    tasks.withType(Test).configureEach {
        doFirst {
            def filteredJvmArgs = (jvmArgs ?: []).findAll {
                !it.toString().startsWith("-Djunit.jupiter.execution.")
            }
            jvmArgs = filteredJvmArgs
            jvmArgs(
                "-Djunit.jupiter.execution.parallel.enabled=false",
                "-Djunit.jupiter.execution.parallel.mode.default=SAME_THREAD",
                "-Djunit.jupiter.execution.parallel.config.strategy=fixed",
                "-Djunit.jupiter.execution.parallel.config.fixed.parallelism=1",
                "-Djunit.jupiter.execution.timeout.default=600s"
            )
        }
    }
}

gradle.projectsEvaluated {
    allprojects {
        tasks.withType(Test).configureEach {
            maxParallelForks = 1
            forkEvery = 1
        }
    }
}
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

## Known-Good Full-E2E Filters

Run these filters one at a time with the long full-e2e harness above and the environment prefix. They passed on clean master/devdb and on the UPC resolution speedup branch on 2026-05-17.

```bash
JAVA_HOME=/Users/alexwyler/Library/Java/JavaVirtualMachines/corretto-21.0.2/Contents/Home \
MYSQL_CREDENTIALS_SECRET=prod-db-10-2025 \
MYSQL_HOST=analytics-database.pearcommerce.com \
MYSQL_HOST_READ=analytics-database.pearcommerce.com \
MYSQL_HOST_WRITE=analytics-database.pearcommerce.com \
SNOWFLAKE_CREDENTIALS_SECRET=snowflake-2025-12-01 \
/opt/homebrew/opt/coreutils/libexec/gnubin/timeout -k 30s 11m ./gradlew --no-daemon --no-configuration-cache --init-script /tmp/upc-long-e2e.init.gradle test \
  --tests <one-filter-from-the-list-below> \
  -PnoLint --no-build-cache --console=plain
```

- `UPCRetailerResolutionTest.testKrogerInStoreOnly`
- `UPCRetailerResolutionTest.instacartFailedLarabar5`
- `UPCRetailerResolutionTest.instacartFailedLarabar6`
- `UPCRetailerResolutionTest.testInstacartPostMercato`
- `UPCRetailerResolutionTest.testInstacartSpero`
- `UPCRetailerResolutionTest.testInstacartTineyeDirectCompare`
- `UPCRetailerResolutionTest.testTarget`
- `UPCRetailerResolutionTest.testWalmart3`
- `UPCRetailerResolutionTest.testChewy`
- `UPCRetailerResolutionTest.testInstacartGoogleSearch`
- `UPCRetailerResolutionTest.testMonster`
- `UPCResoGraphTest.testLiquidDeath`
- `UPCResoGraphTest.testInstacartPDPToImage`

Observed master/devdb timings from the 2026-05-17 refresh ranged from sub-second graph/PDP checks to about 8m for `testTarget` and about 6m for `testInstacartTineyeDirectCompare`.

## Passing Coverage

Deterministic UPC resolver coverage:

- `ItemIdInfoResolverTest.getDefinedClass`
- `CostcoItemIdInfoResolverTest`
- `SamsClubItemIdResolverTest`

Graph and image-adjacent coverage:

- `UPCResoGraphTest.testCostoInStock`
- `UPCResoGraphTest.testInstacartPDP`
- `UPCResoGraphTest.testInstacartPDPToImage`
- `UPCResoGraphTest.testLiquidDeath`

Full UPC-resolution e2e coverage:

- Kroger in-store-only resolution
- Larabar Instacart image-resolution cases 5 and 6
- Larabar direct TinEye comparison
- Target plus AmazonFresh/Walmart combined resolution
- Walmart availability validation
- Chewy item/availability validation
- Instacart Google-search resolution
- Instacart post-Mercato and Spero paths
- Monster Walmart/Instacart resolution

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

Exclude these sampled tests from the default known-good command unless they are refreshed and proven passing on master/base. In `api.pearcommerce.com`, known master-failing UPC-resolution devdb probes should use `LocalDevdbDrift.assumeKnownMasterFailingProbeEnabled(...)` rather than permanent `@Disabled`, so they remain skipped by default but can still be re-run during refreshes.

To force one of these probes while refreshing the baseline, set either:

```bash
RUN_KNOWN_MASTER_FAILING_UPC_RESOLUTION_DEVDB=true
```

or pass:

```bash
-Dpear.upcresolution.runKnownMasterFailingDevdb=true
```

- `UPCResoGraphTest.smokeTest`: null graph root on master/devdb.
- `UPCResoGraphTest.testWalmart`: null graph root on master/devdb.
- `UPCResoGraphTest.testTargetBrandSearch`: Target brand scrape failure on master/devdb.
- `UPCResoGraphTest.testTinEyeDirect`: timeout on master/devdb.
- `UPCResoGraphTest.testLacroixCostco`: null graph root on master/devdb.
- `UPCResoGraphTest.testInstacart`: null graph root on master/devdb.
- `UPCResoGraphTest.testInstacartRambler`: null servlet request cookie path on master/devdb.
- `UPCResoGraphTest.testInstacartSunbelt`: null servlet request cookie path on master/devdb.
- `UPCResoGraphTest.testCityhive`: timeout on master/devdb.
- `UPCRetailerResolutionTest.testRiteAid1P`: expected item ID assertion failed on master/devdb.
- `UPCRetailerResolutionTest.targetFailedLarabar`: timeout on master/devdb.
- `UPCRetailerResolutionTest.instacartFailedLarabar2`: timeout on master/devdb.
- `UPCRetailerResolutionTest.instacartFailedLarabar3`: timeout on master/devdb.
- `UPCRetailerResolutionTest.instacartFailedLarabar4`: timeout on master/devdb.
- `SainsburyPlanTests.testResolvedItem_PepsiMax_HasExpectedEanAndProductUid`: expected product assertion failed on master/devdb.
- `TescoPlanTest.testProductSearch_PepsiMax_HasExpectedGtinAndProductId`: expected product assertion failed on master/devdb.
- `CoopPlanTest.testSearch_ArlaCravendaleMilk`: Co-op search scrape failure on master/devdb.

## If The Sample Fails

First rerun only the failing filter with the same env. If it still fails, compare against a clean master/base worktree. If master passes and the branch fails, debug the branch. If master also fails, update this reference and disable the specific drifting probe with a date/reason instead of broadening the disabled surface.
