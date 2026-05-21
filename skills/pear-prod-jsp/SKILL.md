---
name: pear-prod-jsp
description: Run one-off JSPs on live Pear api.pearcommerce.com servers for production reads, live PearSimpleORM checks, S3/R2 uploads, cache/tool probes, job triggers, or production tool actions. Use when the user asks to use devops/jsp.sh, run code on production/test via JSP, inspect or mutate live ORM state without a deploy, or learn from JSPs archived in s3://assets.pearcommerce.com/jsp-log.
---

# Pear Prod JSP

## Overview

Use a temporary JSP when the useful execution context is the live Pear server: production classpath, IAM role, AppConfig/secrets, live `Resources`, live `Persistence`, and the same caches a deployed request sees. Every production one-off JSP must default to a no-parameter preview page with a user-visible plan and a `Run` button; the button is the approval mechanism, and real work belongs behind `run=true`. The normal run page should be a useful execution report: title, summary, steps, timings, context, errors, stack traces, and verification details. When the JSP has a formal output contract such as JSON, CSV, or very particular HTML, render that formal output at the top of the normal run page and offer `output=raw` for the artifact alone.

## Required Safety

- Every one-off production JSP must render a no-parameter preview with exactly what will happen and a `Run` button that reloads with `run=true`. The no-parameter path must have zero side effects.
- The `Run` button is approval for every JSP. Codex may open the preview page, but must not bypass the button by opening `run=true` directly. If the user asks Codex to proceed from the preview page, click the visible `Run` button rather than constructing a run URL.
- The preview page's `Run` button must visibly enter a loading state when clicked: disable the button on submit and replace or augment its label with a small spinner, since production JSP requests often take a while.
- After calling `devops/jsp.sh` for a JSP you created or loaded, always open the printed public JSP URL in a real browser with no query parameters. Do this in addition to any curl/SSM compile checks, and do not click `Run` unless the user approves it.
- Treat `devops/jsp.sh` output as the compile/load authority. It already copies the JSP into the live container and curls the no-parameter page with `pear_debug=true`; read that output for JSP compilation errors such as `Unable to compile class for JSP`. Do not create ad hoc shell scripts, `ec2-exec` wrappers, docker-curl helpers, or alternate compile-check paths for a JSP you just loaded. If the `jsp.sh` output is truncated, noisy, or inconclusive, rerun `devops/jsp.sh` on the JSP and inspect that output instead of inventing a second script.
- Run the compile/deploy preview without `--single` when the no-parameter path is side-effect-free; this fans the JSP out to every server, so a later browser request can land on any backend and still find the JSP. Use `--single` only when invoking side effects from the helper path, which should usually be avoided in favor of the browser `Run` button.
- By default, make the helpful execution report visible: title, steps, timings, context, stack traces, and verification notes are the point of most JSPs. Do not add a `debug` parameter or collapse that report. Use `output=raw` only when the user needs a formal artifact without the human report.
- For long-running migrations, broad loops, resolver/import batches, or anything likely to outlive a comfortable browser request, emit progress to both the response and server logs. Use a stable `LOG` prefix plus `System.out.println(...)` or `Resources.global().logger.info(...)` at run start, each major phase, periodic item milestones, errors, and run finish so `devops/logs.sh` can track the job even if the browser disconnects.
- Be explicit about environment. `jsp.sh` defaults to `PROD` when `-e` is omitted, so pass `-e PROD`, `-e TEST`, or the intended env deliberately.
- Make runs idempotent and narrow when there is any chance of duplicate work: hard-code or parameterize exact IDs, verify old values before changing them, print skips, and ensure a second hit of the random JSP URL cannot duplicate work.
- When changing ORM-backed rows, prefer `Persistence.global().orm()`/entity `save` over direct SQL so PearSimpleORM hooks, history, and cache behavior run normally. If direct SQL is necessary, state the cache/ORM bypass risk on the preview page.
- Never put raw secrets, tokens, customer data dumps, or unmasked credentials in the JSP source or output. `jsp.sh` archives the JSP source to `s3://assets.pearcommerce.com/jsp-log/`.
- Do not use this workflow to repair or deploy Offers production/staging static assets by manually writing local build artifacts to S3/R2/CDN. Fix source/deploy/CI instead. Production data artifacts, catalog/report outputs, and one-off tool uploads are okay when scoped.

## Learn The Pattern

Before inventing a pattern, inspect current examples:

```bash
sed -n '1,240p' devops/jsp.sh
sed -n '1,180p' devops/fg-jsp.sh
sed -n '1,180p' devops/jspx
sed -n '1,180p' WebContent/invalidate-urzas.jsp
sed -n '1,120p' WebContent/pull-new-prod-retailers.jsp
rg --files WebContent | rg '\.jsp$'
git log --date=short --pretty=format:'%h %ad %an %s' -- devops/jsp.sh devops/fg-jsp.sh devops/jspx
```

Inspect archived one-off JSPs when local examples are not enough:

```bash
aws s3api list-objects-v2 \
  --bucket assets.pearcommerce.com \
  --prefix jsp-log/2026_05 \
  --max-items 100 \
  --query 'Contents[].{Key:Key,LastModified:LastModified,Size:Size}' \
  --output text

aws s3 cp s3://assets.pearcommerce.com/jsp-log/<key>.jsp -
```

Useful patterns seen in history:

- `devops/jsp.sh` gives each run a timestamp/user/random nonce name, uploads source to `s3://assets.pearcommerce.com/jsp-log/`, copies it into the live container, and curls it with `pear_debug=true`.
- Older archived scripts sometimes used `--single` for side effects. With the current button-approval workflow, deploy the no-param preview without `--single`; reserve `--single` for legacy helper-curl execution or per-instance diagnostics.
- `jsp.sh -j some.jsp?x=y` strips the query string; do not rely on arbitrary query params with `jsp.sh`. Use hard-coded constants, put real work behind the preview page's `Run` button, or use an existing repo JSP with `jspx` only after confirming that path still works for the target environment.
- For Fargate/FG environments, read the current `jsp.sh` and `fg-jsp.sh` branch before side effects. Delegation and `--task` handling may differ from EC2.

## Formal Output Exception

Use this only when the user asked for a formal output contract, such as JSON, CSV, a specific table, or a particular HTML artifact. Ordinary operational JSPs should keep the full execution report as the main output.

For formal-output JSPs, prefer this structure:

1. No-parameter preview: explain the formal output, show the `Run` button for the normal `run=true` page, and include an optional direct `curl` command for `run=true&output=raw`.
2. `run=true`: render the formal output at the top, then render the full normal execution report underneath with steps, timings, context, errors, stack traces, and verification notes. Do not collapse this report by default.
3. `run=true&output=raw`: return only the formal artifact. For JSON or CSV, set the matching response content type and do not append HTML.

Use `output=raw` because the parameter changes the response shape rather than toggling visibility. Build raw links from `request.getRequestURI()` or another relative path so they reload the same public JSP path; `request.getRequestURL()` may resolve to internal `127.0.0.1:8080` behind the proxy.

## Top-Level JSP Template

Use HTML for ordinary production one-off JSPs. The default page is a preview/approval page; the `run=true` page does the work and renders the full execution report visibly.

```jsp
<%@ page contentType="text/html; charset=UTF-8" %>
<%@ page import="com.pear.config.Persistence" %>
<%@ page import="com.pear.config.Resources" %>
<%@ page import="com.pear.config.ServerEnv" %>
<%@ page import="com.pear.simpleorm.orm.PearSimpleORM" %>
<%@ page import="org.apache.commons.lang3.exception.ExceptionUtils" %>

<style>
    .run-button {
        align-items: center;
        display: inline-flex;
        gap: 8px;
    }
    .run-button[disabled] {
        cursor: wait;
        opacity: 0.75;
    }
    .run-spinner {
        animation: run-spin 0.8s linear infinite;
        border: 2px solid currentColor;
        border-right-color: transparent;
        border-radius: 50%;
        display: inline-block;
        height: 12px;
        width: 12px;
    }
    @keyframes run-spin {
        to {
            transform: rotate(360deg);
        }
    }
</style>
<script>
    function markRunButtonLoading(form) {
        var button = form.querySelector("button[type='submit']");
        if (!button) {
            return true;
        }
        button.disabled = true;
        button.innerHTML = "<span class='run-spinner'></span><span>Running...</span>";
        return true;
    }
</script>

<%
String LOG = "[prod-jsp-example] ";
boolean run = "true".equalsIgnoreCase(String.valueOf(request.getParameter("run")));
java.util.function.Consumer<String> progressLog = message -> {
    String line = LOG + message;
    System.out.println(line);
    Resources.global().logger.info(line);
};
try {
    if (!run) {
%>
        <h1>Ready to run</h1>
        <p>This JSP will:</p>
        <ol>
            <li>Describe step one and its exact target IDs/counts.</li>
            <li>Describe step two and what systems or data it may touch.</li>
        </ol>
        <form method="get" onsubmit="return markRunButtonLoading(this);">
            <input type="hidden" name="run" value="true">
            <button class="run-button" type="submit">Run</button>
        </form>
<%
        return;
    }

    long start = System.nanoTime();
    PearSimpleORM orm = Persistence.global().orm();
    out.println("<h1>Run Report</h1>");
    out.println("<pre>");
    out.println(LOG + "env=" + ServerEnv.global().env + " server=" + ServerEnv.global().server);
    progressLog.accept("run-start env=" + ServerEnv.global().env + " server=" + ServerEnv.global().server);

    // Do the run action here.
    out.println(LOG + "step 1 ok: describe the result");
    progressLog.accept("step-1-ok");

    out.println(LOG + "done in " + ((System.nanoTime() - start) / 1_000_000.0) + " ms");
    progressLog.accept("run-finish elapsedMs=" + ((System.nanoTime() - start) / 1_000_000));
    out.println("</pre>");
} catch (Throwable e) {
    Resources.global().logger.error(LOG + "failed", e);
    out.println("<h2>Error</h2><pre>" + ExceptionUtils.getStackTrace(e) + "</pre>");
}
%>
```

Inside loops, catch expected per-item `RuntimeException`s only when continuing is intentional; log the item identity and keep a consecutive-error guard for broad scans. At the outer boundary, catch `Throwable`, log through `Resources.global().logger.error("message", e)`, and print `ExceptionUtils.getStackTrace(e)`.

## Workflow

1. Decide the run purpose, target scope, and whether a formal `output=raw` artifact is needed.
2. Write the JSP so the no-parameter path only prints a preview/plan and `Run` button. Include exact target IDs/counts/current values, expected actions, idempotency guards, and verification steps. If the run is long or touches many items, include response progress lines and server-side progress logs with a stable prefix suitable for `devops/logs.sh`. If there is a formal output contract, include a direct `output=raw` URL or `curl` command too.
3. Create the JSP as a scratch file, usually under `/tmp`, unless the user wants a persistent repo JSP.
4. Keep imports minimal, but use real Pear helpers (`Persistence.global().orm()`, `S3Util`, `SpringApplicationContextProvider`, `JDBCUtil`, `JSON`, `Parallel`) instead of local reimplementations.
5. Deploy/compile with an explicit env and no `--single`, relying on the no-parameter side-effect-free preview:

```bash
devops/jsp.sh -j /tmp/descriptive-prod-read.jsp -e PROD
```

6. Read the `devops/jsp.sh` output itself before doing anything else. If it shows a JSP compile error, patch the JSP and rerun `devops/jsp.sh`; do not create a separate shell script or alternate `ec2-exec`/docker-curl path to test the same JSP.
7. Always open the printed URL in a real browser with no query parameters. Confirm the preview page shows the plan and `Run` button. The `jsp.sh` helper output is the compile/load check, but it does not replace opening the browser preview.
8. Stop at the preview page until the user approves by pressing `Run` or asks Codex to press the visible button. Do not navigate directly to `?run=true` to bypass the button. For formal outputs, verify both the normal `run=true` page and the `run=true&output=raw` artifact after the run.
9. Capture and summarize the run report, timings, errors, remote URL, S3 source key, and follow-up verification when useful.

## Run Approval

Every no-parameter preview page is the user-readable approval page for the run. The `Run` button itself is the approval. Before the button, include enough detail for the user to understand what clicking it will do:

```text
Env:
Run URL:
Purpose:
Selection:
Actions:
Systems/data touched:
Expected scope:
Idempotency/guards:
Verification:
Raw output URL: (only for formal outputs)
```

Do not create separate approval categories. Do not bypass the preview by opening `run=true` directly. If the user asks Codex to proceed, click the visible `Run` button. If the JSP changes, show the preview again before running.

Make the `Run` button submit through a small loading-state handler that disables the button and shows a spinner/`Running...` label immediately after click.

Also show exact resources/entities/tables, expected max affected rows/items, and old-value/idempotency guards whenever those concepts apply.

Old-value guard pattern:

```jsp
boolean run = "true".equalsIgnoreCase(String.valueOf(request.getParameter("run")));
long id = 123L;
MyEntity entity = orm.load(MyEntity.class, id);
out.println("current=" + entity.someField);

if (!"EXPECTED_OLD_VALUE".equals(entity.someField)) {
    out.println("skip: old value did not match guard");
    return;
}
if (!run) {
    out.println("Preview: clicking Run will set someField=NEW_VALUE for id=" + id);
    return;
}
entity.someField = "NEW_VALUE";
orm.save(entity);
out.println("updated id=" + id);
```

## Common Actions
When lifting older archived JSPs, convert hard-coded `preview`, `writeChange`, `if (true)`, or direct request-param execution into the standard no-param preview plus `run=true` button flow. Keep the useful parts: exact IDs, old values, row counts, per-item results, timings, and errors. See `references/deep-history-common-actions.md` for older Alex/Eric patterns such as AppConfig diffs, Snowflake reads, thread dumps, Redis checkpoints, ManagedResourcesConfig jobs, retailer endpoint probes, scraper-user seeding, request-header codegen, OCR/barcode probes, and recipe imports.

Live ORM read:

```jsp
PearSimpleORM orm = Persistence.global().orm();
Vendor vendor = orm.load(Vendor.class, 123L);
out.println("vendor=" + vendor.id + " " + vendor.name);
```

JDBC table/scalar read:

```jsp
<%@ page import="com.pear.persistence.JDBCUtil" %>
<%@ page import="java.util.List" %>
<%@ page import="java.util.Map" %>

List<Map<String, Object>> rows = JDBCUtil.executeQueryToMapList(
    "select id, enumName, live from RetailPartner where enumName = ? limit 20",
    "Tops");
for (Map<String, Object> row : rows) {
    out.println(row.get("id") + " " + row.get("enumName") + " live=" + row.get("live") + "<br>");
}

long count = JDBCUtil.executeQueryAndReturnSingleLongId(
    "select count(*) from Store where retailerId = ?",
    1367L);
out.println("storeCount=" + count);
```

Guarded ORM row repair:

```jsp
<%@ page import="com.pear.config.Persistence" %>
<%@ page import="com.pear.entities.inventory.RetailPartner" %>

RetailPartner retailer = Persistence.global().orm().load(RetailPartner.class, 13725L);
out.println("current instacartId=" + retailer.instacartId + "<br>");
if (retailer.instacartId != 0 && retailer.instacartId != 282) {
    out.println("skip: unexpected current instacartId");
    return;
}

retailer.instacartId = 282;
retailer.itemUpdateConfiguration.instacartId = 282;
retailer.itemUpdateConfiguration.instacartSlug = "price-chopper-ny";
retailer.save();
out.println("saved retailer=" + retailer.id + " " + retailer.enumName);
```

Use ORM/entity `save()` for entity changes when possible. If a narrow SQL update is the right tool, print the exact `WHERE`, expected max rows, and affected rows:

```jsp
int rows = JDBCUtil.executeUpdate("UPDATE Store SET live = 0 WHERE id = ? AND live = 1 LIMIT 1", storeId);
out.println("updatedRows=" + rows + " expectedMax=1");
```

Store or retailer audit table:

```jsp
<%@ page import="com.pear.config.Persistence" %>
<%@ page import="com.pear.entities.inventory.Store" %>
<%@ page import="com.pear.persistence.JDBCUtil" %>
<%@ page import="java.net.URLEncoder" %>
<%@ page import="java.nio.charset.StandardCharsets" %>
<%@ page import="java.util.List" %>

List<String> storeIds = List.of("758999001", "123999001");
List<Store> stores = Persistence.global().orm().loadWhere(
    Store.class,
    "storeId in " + JDBCUtil.buildListToken(storeIds));

out.println("<table><tr><th>id</th><th>storeId</th><th>name</th><th>address</th><th>live</th></tr>");
for (Store s : stores) {
    String addr = s.address == null ? "" : URLEncoder.encode(s.address, StandardCharsets.UTF_8);
    out.println("<tr><td>" + s.id + "</td><td>" + s.storeId + "</td><td>" + s.name + "</td>"
        + "<td><a target='_blank' href='https://www.google.com/maps/search/?api=1&query=" + addr + "'>"
        + s.address + "</a></td><td>" + s.live + "</td></tr>");
}
out.println("</table>");
```

Retailer/store import or refresh:

```jsp
<%@ page import="com.pear.config.Persistence" %>
<%@ page import="com.pear.entities.inventory.RetailPartner" %>
<%@ page import="com.pear.entities.inventory.Store" %>
<%@ page import="java.util.Date" %>

RetailPartner retailer = RetailPartner.forEnumName("Tops");
Store store = Persistence.global().orm().loadSingleWhere(
    Store.class,
    "retailerId = ? AND storeId = ?",
    retailer.id,
    "123");
boolean created = store == null;
if (created) {
    store = new Store();
    store.retailerId = retailer.id;
    store.storeId = "123";
}
store.importedFromRetailerDate = new Date();
store.name = "Tops Friendly Market Example";
store.address = "1275 Jefferson Rd, Rochester, NY 14623";
store.live = true;
store.setZip("14623");
store.save();
out.println((created ? "created" : "updated") + " store id=" + store.id);
```

For full store imports, scrape with `JurlProxyFallback`, geocode with `GeoUtil.geocodeMulti(...)`, print created/updated/skipped/error counts, and save each `Store` through ORM.

S3 JSON upload from the live server:

```jsp
<%@ page import="com.pear.lang.JSON" %>
<%@ page import="com.pear.persistence.S3Util" %>

String key = "debug/my-report-" + System.currentTimeMillis() + ".json";
String url = S3Util.uploadString(S3Util.ASSETS_S3_BUCKET, key, JSON._stringify(data), ".json");
out.println("uploaded=" + url);
```

S3 file upload:

```jsp
<%@ page import="com.amazonaws.services.s3.model.CannedAccessControlList" %>
<%@ page import="com.pear.persistence.S3Util" %>
<%@ page import="java.io.File" %>

String url = S3Util.uploadFile(
    S3Util.ASSETS_S3_BUCKET,
    "debug/file-" + System.currentTimeMillis() + ".csv",
    new File("/tmp/file.csv"),
    CannedAccessControlList.PublicRead,
    null);
out.println("uploaded=" + url);
```

S3 list, read, download, or signed URL:

```jsp
<%@ page import="com.pear.persistence.S3Util" %>
<%@ page import="java.io.File" %>
<%@ page import="java.util.Date" %>
<%@ page import="java.util.Set" %>

Set<String> keys = S3Util.listItemsInS3(S3Util.PRIVATE_S3_BUCKET, "partner-upc/debug");
out.println("keys=" + keys.size() + "<br>");

String body = S3Util.getString(S3Util.PRIVATE_S3_BUCKET, "partner-upc/debug/input.json");
File local = S3Util.downloadFile(S3Util.PRIVATE_S3_BUCKET, "partner-upc/debug/input.csv", new File("/tmp/input.csv"));
String signed = S3Util.getSignedURL(
    S3Util.PRIVATE_S3_BUCKET,
    "partner-upc/debug/input.csv",
    new Date(System.currentTimeMillis() + 60L * 60L * 1000L));
out.println("downloaded=" + local.getAbsolutePath() + " signed=" + signed);
```

Remote image or asset re-upload: `String newUrl = S3Util.uploadRemoteAsset("https://example.com/logo.png");`

Jurl/proxy probe or scrape:

```jsp
<%@ page import="com.alexwyler.jurl.LoggedJurl" %>
<%@ page import="com.pear.http.JurlProxyFallback" %>
<%@ page import="com.pear.http.JurlProxyFallback.Type" %>
<%@ page import="java.util.List" %>
<%@ page import="java.util.concurrent.TimeUnit" %>

String body = new JurlProxyFallback(
        List.of(Type.SMARTPROXY_STATIC, Type.SOAX_STATIC, Type.NETNUT_STATIC, Type.DATAIMPULSE_STATIC),
        () -> new LoggedJurl()
            .url("https://www.example.com/store-locator")
            .method("GET")
            .asChrome()
            .timeout(30_000))
    .useJurlCache(true, TimeUnit.HOURS.toMillis(1))
    .goThen(jurl -> jurl.getResponseBody())
    .get();
out.println("bodyLength=" + body.length());
```

Internal endpoint/controller probe from the live server:

```jsp
<%@ page import="com.alexwyler.jurl.LoggedJurl" %>
<%@ page import="com.alexwyler.jurl.IJurl" %>
<%@ page import="org.apache.commons.text.StringEscapeUtils" %>

LoggedJurl jurl = new LoggedJurl()
    .url("http://127.0.0.1:8080/v1/health")
    .method(IJurl.GET)
    .throwOnNon200(false)
    .timeout(30_000)
    .go();
out.println("status=" + jurl.getResponseCode());
out.println("<pre>" + StringEscapeUtils.escapeHtml4(jurl.getResponseBody()) + "</pre>");
```

Spring bean or service call:

```jsp
<%@ page import="com.pear.spring.SpringApplicationContextProvider" %>

MyService service = SpringApplicationContextProvider.getApplicationContext()
    .get()
    .getAutowireCapableBeanFactory()
    .getBean(MyService.class);
service.doTheThing();
```

Pulse/batch updater job:

```jsp
<%@ page import="com.pear.itemurlupdater.AbscoBatchUpdater_October2025" %>
<%@ page import="com.pear.itemurlupdater.PulseOrchestrator" %>
<%@ page import="com.pear.spring.SpringApplicationContextProvider" %>

PulseOrchestrator pulse = SpringApplicationContextProvider.getApplicationContext()
    .get()
    .getAutowireCapableBeanFactory()
    .getBean(PulseOrchestrator.class);
out.println("starting " + AbscoBatchUpdater_October2025.class.getSimpleName() + "<br>");
out.flush();
pulse.runSingle(AbscoBatchUpdater_October2025.class);
out.println("job complete");
```

Bounded queue processor kick:

```jsp
<%@ page import="com.pear.partnerupclifecyclemanagement.RetailerBatchQueueProcessor" %>
<%@ page import="java.util.concurrent.TimeUnit" %>

RetailerBatchQueueProcessor processor = new RetailerBatchQueueProcessor("instacart");
Thread processorThread = Thread.ofPlatform().start(processor::process);
try {
    TimeUnit.MINUTES.sleep(10);
} finally {
    processor.shutdown();
    processorThread.join(10_000);
}
out.println("queue processor stopped");
```

Prewarm/report regeneration:

```jsp
<%@ page import="com.pear.config.Persistence" %>
<%@ page import="com.pear.controllers.app.Prewarm" %>
<%@ page import="com.pear.controllers.util.PrewarmUtil" %>
<%@ page import="com.pear.entities.inventory.UPC" %>
<%@ page import="java.util.stream.Collectors" %>

long vendorId = 123L;
Prewarm prewarm = new Prewarm();
prewarm.setId(Persistence.global().orm().getIdGen().getNext());
prewarm.name = "JSP generated prewarm list for vendor " + vendorId;
prewarm.upcIds = Persistence.global().orm()
    .loadWhere(UPC.class, "vendorId = ?", vendorId)
    .stream()
    .map(UPC::getId)
    .collect(Collectors.toList());
PrewarmUtil.generatePrewarmReport(prewarm);
prewarm.generated = true;
prewarm.ended = System.currentTimeMillis();
prewarm.save();
out.println("prewarmId=" + prewarm.id + " upcs=" + prewarm.upcIds.size());
```

Redis/cache invalidation:

```jsp
<%@ page import="com.pear.lang.LettuceUtil" %>
<%@ page import="io.lettuce.core.cluster.api.async.RedisClusterAsyncCommands" %>
<%@ page import="java.nio.charset.StandardCharsets" %>
<%@ page import="java.util.concurrent.TimeUnit" %>

RedisClusterAsyncCommands<byte[], byte[]> redis = LettuceUtil.redisClientLettuce();
String redisKey = "retailer-batch-upc-processing:instacart:2964183724931267";
Long deleted = redis.del(redisKey.getBytes(StandardCharsets.UTF_8))
    .toCompletableFuture()
    .get(5, TimeUnit.SECONDS);
out.println("redisDeleted=" + deleted + " key=" + redisKey);
```

Static live cache invalidation can call the specific invalidator, for example `BrightDataCredentials.invalidate(BrightDataCredentials.SECRET_UNBLOCKER)`.

Per-item loop with visible failures and a stop guard:

```jsp
<%@ page import="com.pear.config.Resources" %>
<%@ page import="org.apache.commons.lang3.exception.ExceptionUtils" %>
<%@ page import="org.apache.commons.text.StringEscapeUtils" %>

int ok = 0;
int failed = 0;
int consecutiveFailures = 0;
for (Long id : ids) {
    long stepStart = System.nanoTime();
    try {
        // process id
        ok++;
        consecutiveFailures = 0;
        out.println("ok id=" + id + " ms=" + ((System.nanoTime() - stepStart) / 1_000_000.0) + "<br>");
    } catch (RuntimeException e) {
        failed++;
        consecutiveFailures++;
        Resources.global().logger.error(LOG + " failed id=" + id, e);
        out.println("<h3>failed id=" + id + "</h3><pre>"
            + StringEscapeUtils.escapeHtml4(ExceptionUtils.getStackTrace(e)) + "</pre>");
        if (consecutiveFailures >= 5) {
            throw e;
        }
    }
}
out.println("summary ok=" + ok + " failed=" + failed);
```
