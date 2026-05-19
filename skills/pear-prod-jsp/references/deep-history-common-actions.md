# Deep History Common Actions

These patterns come from older Alex and Eric JSPs in `s3://assets.pearcommerce.com/jsp-log/`. Treat them as production-context recipes, not as copy-paste permission to keep the old shape. Always keep the current preview page plus `Run` button workflow from the main skill, and put the real work behind `run=true`.

## AppConfig Version Diff

Use this when the question is "what changed in live AppConfig?" or "which config value is active on this server?"

```jsp
<%@ page import="com.fasterxml.jackson.databind.JsonNode" %>
<%@ page import="com.flipkart.zjsonpatch.JsonDiff" %>
<%@ page import="com.pear.aws.AWSAppConfigUtil" %>
<%@ page import="com.pear.config.Resources" %>
<%@ page import="com.pear.lang.HttpRequestUtil" %>
<%@ page import="com.pear.spring.SpringApplicationContextProvider" %>
<%@ page import="io.json.compare.JSONCompare" %>
<%@ page import="software.amazon.awssdk.services.appconfig.AppConfigClient" %>
<%@ page import="software.amazon.awssdk.services.appconfig.model.GetHostedConfigurationVersionRequest" %>
<%@ page import="software.amazon.awssdk.services.appconfig.model.GetHostedConfigurationVersionResponse" %>
<%@ page import="java.util.stream.Collectors" %>

long version = HttpRequestUtil.getLong(request, "version");
long previousVersion = HttpRequestUtil.getLong(request, "previousVersion");
AppConfigClient appConfig = SpringApplicationContextProvider.getApplicationContext().get()
    .getAutowireCapableBeanFactory()
    .getBean(AppConfigClient.class);

GetHostedConfigurationVersionResponse current = appConfig.getHostedConfigurationVersion(
    GetHostedConfigurationVersionRequest.builder()
        .applicationId(AWSAppConfigUtil.APPLICATION_ID)
        .configurationProfileId(AWSAppConfigUtil.PROFILE_ID)
        .versionNumber((int) version)
        .build());
GetHostedConfigurationVersionResponse previous = appConfig.getHostedConfigurationVersion(
    GetHostedConfigurationVersionRequest.builder()
        .applicationId(AWSAppConfigUtil.APPLICATION_ID)
        .configurationProfileId(AWSAppConfigUtil.PROFILE_ID)
        .versionNumber((int) previousVersion)
        .build());

JsonNode jsonDiff = JsonDiff.asJson(
    Resources.global().objectMapper.readTree(previous.content().asUtf8String()),
    Resources.global().objectMapper.readTree(current.content().asUtf8String()));
out.println("<h2>AppConfig " + previousVersion + " -> " + version + "</h2>");
out.println("<pre>" + HttpRequestUtil.textToHTML(jsonDiff.toPrettyString()) + "</pre>");
out.println("<pre>" + HttpRequestUtil.textToHTML(JSONCompare.diffs(
    previous.content().asUtf8String(),
    current.content().asUtf8String()).stream().collect(Collectors.joining("\n"))) + "</pre>");
out.println("urza-read-path=" + AWSAppConfigUtil.configValues.get("urza-read-path") + "<br>");
out.println("simple-orm=" + AWSAppConfigUtil.configValues.get("simple-orm") + "<br>");
```

## Snowflake Or Cross-Data-Source Reads

Use production credentials from the live server when the source is not reachable locally. Parameterize terms and dates in the preview, but avoid concatenating user input into SQL in the run path when a prepared-param helper is available.

```jsp
<%@ page import="com.pear.lang.JSON" %>
<%@ page import="com.pear.persistence.JDBCUtil" %>
<%@ page import="java.sql.Connection" %>
<%@ page import="java.util.List" %>

String sql = "select CONVERSATION_KEY, CONVERSATION_DATETIME "
    + "from GONG.GONG_DATA_CLOUD.CONVERSATIONS "
    + "where CONVERSATION_DATETIME >= TO_TIMESTAMP(?) "
    + "limit 100";
try (Connection con = JDBCUtil.getConnectionSnowflake()) {
    List<List<String>> rows = JDBCUtil.executeQueryAndReturnListOfStrings(con, sql, startDate);
    out.println("<pre>" + JSON._stringify(rows) + "</pre>");
}
```

For a formal JSON export, render the JSON at the top of `run=true`, then provide `output=raw` for only the JSON body.

## IOLog Timing Report

Use this after calling live methods, controller helpers, proxies, or batch updaters when the interesting output is "what IO did this call do?"

```jsp
<%@ page import="com.pear.persistence.IOLog" %>

IOLog.setEnabled(true);
long start = System.nanoTime();
try {
    // live method, controller call, scrape, or updater
} finally {
    out.println("<h2>IO timings</h2>");
    out.println("<pre>" + IOLog.buildTimingReport(true, 0, 500, true) + "</pre>");
    IOLog.setEnabled(false);
    out.println("elapsedMs=" + ((System.nanoTime() - start) / 1_000_000.0));
}
```

## Runtime Context And Local Endpoint Probe

Useful for "which server did I hit?", "is this task on the jobs node?", and "does the internal controller path behave from inside the JVM?"

```jsp
<%@ page import="com.alexwyler.jurl.LoggedJurl" %>
<%@ page import="com.pear.config.Resources" %>
<%@ page import="com.pear.config.ServerEnv" %>
<%@ page import="org.apache.commons.text.StringEscapeUtils" %>

out.println("env=" + ServerEnv.global().env + "<br>");
out.println("server=" + ServerEnv.global().server + "<br>");
out.println("isJobs=" + Resources.global().isJobs() + "<br>");
out.println("isDashboard=" + Resources.global().isDashboard() + "<br>");
out.println("isAvailabilitiesAWS=" + Resources.global().isAvailabilitiesAWS() + "<br>");

LoggedJurl jurl = new LoggedJurl()
    .url("http://127.0.0.1:8080/landing.jsp")
    .throwOnNon200(false)
    .timeout(30_000)
    .go();
out.println("localStatus=" + jurl.getResponseCode());
out.println("<pre>" + StringEscapeUtils.escapeHtml4(jurl.getResponseBody()) + "</pre>");
```

## Thread Dump And JSP Interruption

Thread dumps are a diagnostic JSP pattern. Interruption is a last-resort operational pattern for a stuck one-off JSP and should be previewed with an exact JSP name or stack substring. Avoid `Thread.stop()` unless the preview explicitly says it can destabilize the JVM and the user has chosen that exact mode.

```jsp
<%@ page import="java.util.Map" %>
<%@ page import="org.apache.commons.text.StringEscapeUtils" %>

for (Map.Entry<Thread, StackTraceElement[]> entry : Thread.getAllStackTraces().entrySet()) {
    Thread t = entry.getKey();
    out.println("<h3>" + StringEscapeUtils.escapeHtml4(t.getName()) + " " + t.getState() + "</h3><pre>");
    for (StackTraceElement ste : entry.getValue()) {
        out.println(StringEscapeUtils.escapeHtml4("  at " + ste));
    }
    out.println("</pre>");
}
```

For stuck JSP cleanup, match on `jsp.<file_with_underscores>._jspService`, call `thread.interrupt()`, wait, then print whether the thread left the JSP stack.

## ORM Dirty And Cache Refresh

Use when a direct repair or out-of-band effect means the live ORM/index cache must be refreshed. Prefer saving the entity through ORM first; dirty/flush is for narrow repair or diagnostics.

```jsp
<%@ page import="com.pear.config.Resources" %>
<%@ page import="com.pear.entities.inventory.RetailPartner" %>
<%@ page import="com.pear.entities.inventory.Store" %>
<%@ page import="java.util.List" %>

Resources.global().orm().dirty(Store.class, storeId);
Resources.global().orm().dirty(RetailPartner.class, List.of(retailerId), true);
Resources.global().orm().getIndexLoad().dirty(RetailPartner.class, "servicesEverywhere", true);

// Only for broad cache diagnostics or a planned refresh. Print this clearly in the preview.
Resources.global().instanceCache.flushImpl();
Resources.global().instanceCache.maxEntries = 100_000;
```

## Redis Checkpoints And Killswitches

Older long-running JSPs used Redis for resumable progress and a simple stop switch. Keep this pattern for large scans so a refresh or timeout does not restart from zero.

```jsp
<%@ page import="com.pear.lang.LettuceUtil" %>
<%@ page import="com.pear.concurrency.PearThreadPoolExecutor" %>
<%@ page import="java.util.Optional" %>
<%@ page import="java.util.concurrent.TimeUnit" %>
<%@ page import="java.util.concurrent.atomic.AtomicLong" %>

String progressKey = "prod-jsp:my-action:progress";
String stopKey = "prod-jsp:my-action:stop";
long checkpoint = Optional.ofNullable(LettuceUtil.get(Long.class, progressKey).get()).orElse(0L);
AtomicLong current = new AtomicLong(checkpoint);

try (PearThreadPoolExecutor pool = new PearThreadPoolExecutor(8, "prod-jsp-my-action")) {
    for (Long id : ids) {
        if (Optional.ofNullable(LettuceUtil.get(Long.class, stopKey).get()).orElse(0L) > 0) {
            out.println("stopped at id=" + id + "<br>");
            break;
        }
        if (current.incrementAndGet() <= checkpoint) {
            continue;
        }
        pool.submitAndBlockWhileQueued(() -> {
            // process id
            return null;
        });
        LettuceUtil.set(progressKey, current.get());
    }
    pool.shutdown();
    pool.awaitTermination(120, TimeUnit.SECONDS);
}
```

## ManagedResourcesConfig Job Or Updater Trigger

Eric's later JSPs often used `ManagedResourcesConfig.createInstance(...)` to get a production-wired job or updater without manually fetching Spring beans. Preview the class, scope, and expected duration, then invoke it from `run=true`.

```jsp
<%@ page import="com.pear.spring.ManagedResourcesConfig" %>
<%@ page import="com.pear.itemurlupdater.WalmartAvailabilityUpdaterJob" %>
<%@ page import="com.pear.itemurlupdater.WalmartBatchAvailabilityUpdater" %>
<%@ page import="com.pear.entities.inventory.UPC" %>
<%@ page import="java.util.List" %>

ManagedResourcesConfig.createInstance(WalmartAvailabilityUpdaterJob.class).executeImpl(null);

WalmartBatchAvailabilityUpdater updater =
    ManagedResourcesConfig.createInstance(WalmartBatchAvailabilityUpdater.class);
updater.setUpcs(new UPC().load(List.of(upcId)));
updater.batchUpdateAvailabilities();
```

This same shape shows up for `PulseAvailabilitiesJob`, `PartnerInstacartBatchJob`, `TargetSimpleBatchUpdater`, `AmazonFreshBAU`, and retailer-specific item-id/availability updaters.

## Partner UPC R2 And Retailer Data Refresh

Use this for scoped PartnerUPC and retailer-data materialization from the live server. Always preview vendor ID, UPC list, R2 write scope, and the follow-up job.

```jsp
<%@ page import="com.pear.persistence.JDBCUtil" %>
<%@ page import="com.pear.util.PartnerUPCR2PopulatorUtil" %>
<%@ page import="com.pear.jobs.UpdatePartnerUPCRetailerDataJob" %>
<%@ page import="java.util.List" %>

long vendorId = 2712772419102684L;
List<Long> upcIds = JDBCUtil.executeQueryAndReturnLongs(
    "select id from UPC where UPC in ('076840004102') and vendorId = ?",
    vendorId);
PartnerUPCR2PopulatorUtil.createR2RecordsForUPCs(upcIds, vendorId);
new UpdatePartnerUPCRetailerDataJob().executeImpl(null);
out.println("r2Upcs=" + upcIds.size());
```

## Retailer Endpoint Probe At Scale

Use a bounded or cached probe when the goal is "are these live item IDs still resolving?" Print grouped success/failure counts and per-item errors.

```jsp
<%@ page import="com.alexwyler.jurl.LoggedJurl" %>
<%@ page import="com.alexwyler.jurl.JurlHttpStatusCodeException" %>
<%@ page import="com.pear.config.Resources" %>
<%@ page import="com.pear.http.JurlProxyFallback" %>
<%@ page import="com.pear.persistence.JDBCUtil" %>
<%@ page import="io.vavr.Tuple3" %>
<%@ page import="java.util.List" %>
<%@ page import="java.util.Map" %>
<%@ page import="java.util.concurrent.TimeUnit" %>
<%@ page import="java.util.stream.Collectors" %>
<%@ page import="static com.pear.http.JurlProxyFallback.Type.UNBLOCKER" %>

Map<Boolean, List<Tuple3<Long, String, Boolean>>> grouped =
    JDBCUtil.executeQueryToTuple(
        "select upcId, itemId from UPCRetailerData where retailerEnum = ? and itemId is not null",
        Long.class,
        String.class,
        "BestBuy").parallelStream()
    .map(t -> {
        String url = "https://www.bestbuy.com/site/" + t._2 + ".p";
        try {
            new JurlProxyFallback(List.of(UNBLOCKER), () -> new LoggedJurl()
                    .url(url)
                    .followRedirects(false)
                    .throwOnNon200(false)
                    .asChrome())
                .useJurlCache(true, TimeUnit.DAYS.toMillis(30))
                .goThen(j -> {
                    if (j.getResponseCode() != 404 && j.getResponseCode() > 301) {
                        throw new JurlHttpStatusCodeException(j);
                    }
                    return j;
                }).get();
            return new Tuple3<>(t._1, t._2, true);
        } catch (Exception e) {
            Resources.global().logger.warn("probe failed " + url, e);
            return new Tuple3<>(t._1, t._2, false);
        }
    }).collect(Collectors.groupingBy(t -> t._3));
out.println("success=" + grouped.getOrDefault(true, List.of()).size()
    + " failure=" + grouped.getOrDefault(false, List.of()).size());
```

## Coverage Selection Or Location Probe

Eric's DoorDash scripts used a greedy zip/store coverage pass before expensive endpoint calls. Reuse that shape for any retailer where a small set of locations should cover many stores.

```jsp
<%@ page import="com.pear.lang.JSON" %>
<%@ page import="java.util.ArrayList" %>
<%@ page import="java.util.Comparator" %>
<%@ page import="java.util.HashMap" %>
<%@ page import="java.util.HashSet" %>
<%@ page import="java.util.List" %>
<%@ page import="java.util.Map" %>
<%@ page import="java.util.Set" %>

Map<Long, Set<String>> zipToStoreIds = new HashMap<>();
// Fill from mapping rows or retailer API metadata.
Set<String> covered = new HashSet<>();
List<Long> selectedZips = new ArrayList<>();
while (covered.size() < allStores.size()) {
    Long bestZip = zipToStoreIds.entrySet().stream()
        .max(Comparator.comparingInt(e -> {
            Set<String> copy = new HashSet<>(e.getValue());
            copy.removeAll(covered);
            return copy.size();
        }))
        .map(Map.Entry::getKey)
        .orElse(null);
    if (bestZip == null) break;
    selectedZips.add(bestZip);
    covered.addAll(zipToStoreIds.get(bestZip));
}
out.println("selectedZips=" + JSON._stringify(selectedZips));
```

Then use `Parallel.createBoundedPlatformThreadPool(...)`, `Parallel.submit(...)`, and `Parallel.getAll(...)` for the actual probes.

## Scraper User Or Browser Profile Seeding

Use only when the production class expects persisted scraper users/browser profiles. Preview the count and identities, store only the minimum required fields, and avoid printing credentials or cookies.

```jsp
<%@ page import="com.pear.cartscraper.WholeFoodsBatchAvailabilityUpdater" %>
<%@ page import="com.pear.cartscraper.WholeFoodsBatchAvailabilityUpdater.WholeFoodsCartScraperUser" %>
<%@ page import="java.util.HashMap" %>

WholeFoodsCartScraperUser user = new WholeFoodsCartScraperUser();
user.email = "account@example.com";
user.password = "masked-in-preview";
user.getCookiesMap = new HashMap<>();
user.postCookiesMap = new HashMap<>();
// Parse cookie strings into maps, but never print them.
user.save();

new WholeFoodsBatchAvailabilityUpdater().batchUpdateAvailabilities();
```

## Request Header Capture And Code Generation

Eric's `HttpRequest.requestHeaders` JSPs generated sanitized, generalized headers or JSON bodies from captured traffic. Use this when the main output is a formal artifact, so `run=true` should show the artifact first and `output=raw` should return only it.

```jsp
<%@ page import="com.pear.lang.JSON" %>
<%@ page import="com.pear.persistence.JDBCUtil" %>
<%@ page import="java.util.ArrayList" %>
<%@ page import="java.util.List" %>
<%@ page import="java.util.Map" %>

List<String> headerJsonStrings =
    JDBCUtil.executeQueryAndReturnStrings("select requestHeaders from HttpRequest limit 1000");
List<Object> generated = new ArrayList<>();
for (String reqHeaders : headerJsonStrings) {
    Map<String, Object> map = JSON.parseMap(reqHeaders);
    // Normalize volatile tokens, JWTs, base64 blobs, timestamps, IDs, and gzip/base64 JSON.
    generated.add(map);
}
String artifact = JSON._stringify(generated);
if ("raw".equalsIgnoreCase(request.getParameter("output"))) {
    response.setContentType("application/json; charset=UTF-8");
    out.print(artifact);
    return;
}
out.println("<h2>Artifact</h2><pre>" + artifact + "</pre>");
```

## OCR Or Barcode Probe

Use when a production-only dependency or image processing path needs to run from the server. Prefer image URLs or S3 downloads over local desktop paths.

```jsp
<%@ page import="com.pear.upcresolution.utilities.BarcodeReader" %>
<%@ page import="net.sourceforge.tess4j.ITesseract" %>
<%@ page import="net.sourceforge.tess4j.Tesseract" %>
<%@ page import="javax.imageio.ImageIO" %>
<%@ page import="java.awt.image.BufferedImage" %>
<%@ page import="java.io.File" %>

BufferedImage image = ImageIO.read(new File("/tmp/input.jpg"));
ITesseract tesseract = new Tesseract();
String text = tesseract.doOCR(image);
out.println("<h2>OCR</h2><pre>" + text + "</pre>");
// For barcode-specific probes, call the local BarcodeReader utility and print codes/confidence.
```

## Recipe Import Or Reimport

Archived recipe JSPs used Redis progress, proxy fallback, `recipeService.importRecipe(...)`, and idempotency skips by `dateLastImported`. Keep those elements and print created/skipped/error counts.

```jsp
<%@ page import="com.pear.config.Resources" %>
<%@ page import="com.pear.lang.LettuceUtil" %>
<%@ page import="com.pear.recipe.model.SImportRecipeResponse" %>
<%@ page import="com.pear.recipe.model.entity.Recipe" %>
<%@ page import="com.pear.recipe.service.ingestion.LdJsonRecipeIngestor" %>
<%@ page import="java.util.concurrent.TimeUnit" %>

long vendorId = 123L;
String progressKey = Resources.global().env + "-last-successful-recipe-import-id";
for (String recipeUrl : urls) {
    Recipe existing = new Recipe().loadSingleWhere("sourceUrl = ?", recipeUrl);
    if (existing != null && existing.dateLastImported != null
        && existing.dateLastImported.getTime() > System.currentTimeMillis() - TimeUnit.HOURS.toMillis(1)) {
        out.println("skip recent " + recipeUrl + "<br>");
        continue;
    }
    SImportRecipeResponse importResponse = Resources.global().recipeService.importRecipe(
        vendorId,
        recipeUrl,
        new LdJsonRecipeIngestor(Resources.global().logger),
        false,
        true,
        null,
        null);
    LettuceUtil.set(progressKey, importResponse.recipe.id);
    out.println("imported recipeId=" + importResponse.recipe.id + " url=" + recipeUrl + "<br>");
}
```

## Converting Old Scratchpad Branches

Old JSPs often contain many `if (true) { ... return; }` and `if (false) { ... }` blocks. When reusing them:

- Pick one branch and delete the others from the new scratch JSP.
- Move the selected branch into an explicit `run=true` step.
- Put exact class names, IDs, SQL, row counts, cache keys, and expected duration on the no-param preview.
- For every loop, print per-item status plus a final summary.
- For every catch that continues, log and print the item identity. For broad scans, add a consecutive-failure stop guard.
