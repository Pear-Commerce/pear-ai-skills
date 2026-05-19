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
- Run the compile/deploy preview without `--single` when the no-parameter path is side-effect-free; this fans the JSP out to every server, so a later browser request can land on any backend and still find the JSP. Use `--single` only when invoking side effects from the helper path, which should usually be avoided in favor of the browser `Run` button.
- By default, make the helpful execution report visible: title, steps, timings, context, stack traces, and verification notes are the point of most JSPs. Do not add a `debug` parameter or collapse that report. Use `output=raw` only when the user needs a formal artifact without the human report.
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
- `--single` is the safe default for side effects. Non-single runs are for per-instance diagnostics such as cache/thread state.
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

<%
String LOG = "[prod-jsp-example] ";
boolean run = "true".equalsIgnoreCase(String.valueOf(request.getParameter("run")));
try {
    if (!run) {
%>
        <h1>Ready to run</h1>
        <p>This JSP will:</p>
        <ol>
            <li>Describe step one and its exact target IDs/counts.</li>
            <li>Describe step two and what systems or data it may touch.</li>
        </ol>
        <form method="get">
            <input type="hidden" name="run" value="true">
            <button type="submit">Run</button>
        </form>
<%
        return;
    }

    long start = System.nanoTime();
    PearSimpleORM orm = Persistence.global().orm();
    out.println("<h1>Run Report</h1>");
    out.println("<pre>");
    out.println(LOG + "env=" + ServerEnv.global().env + " server=" + ServerEnv.global().server);

    // Do the run action here.
    out.println(LOG + "step 1 ok: describe the result");

    out.println(LOG + "done in " + ((System.nanoTime() - start) / 1_000_000.0) + " ms");
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
2. Write the JSP so the no-parameter path only prints a preview/plan and `Run` button. Include exact target IDs/counts/current values, expected actions, idempotency guards, and verification steps. If there is a formal output contract, include a direct `output=raw` URL or `curl` command too.
3. Create the JSP as a scratch file, usually under `/tmp`, unless the user wants a persistent repo JSP.
4. Keep imports minimal, but use real Pear helpers (`Persistence.global().orm()`, `S3Util`, `SpringApplicationContextProvider`, `JDBCUtil`, `JSON`, `Parallel`) instead of local reimplementations.
5. Deploy/compile with an explicit env and no `--single`, relying on the no-parameter side-effect-free preview:

```bash
devops/jsp.sh -j /tmp/descriptive-prod-read.jsp -e PROD
```

6. Open the printed URL in the browser with no query parameters. Confirm the preview page shows the plan and `Run` button.
7. Stop at the preview page until the user approves by pressing `Run` or asks Codex to press the visible button. Do not navigate directly to `?run=true` to bypass the button. For formal outputs, verify both the normal `run=true` page and the `run=true&output=raw` artifact after the run.
8. Capture and summarize the run report, timings, errors, remote URL, S3 source key, and follow-up verification when useful.

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

Also show exact resources/entities/tables, expected max affected rows/items, and old-value/idempotency guards whenever those concepts apply.

Old-value guard pattern:

```jsp
boolean execute = false; // switch to true only after run approval
long id = 123L;
MyEntity entity = orm.load(MyEntity.class, id);
out.println("current=" + entity.someField);

if (!"EXPECTED_OLD_VALUE".equals(entity.someField)) {
    out.println("skip: old value did not match guard");
    return;
}
if (!execute) {
    out.println("DRY RUN: would set someField=NEW_VALUE for id=" + id);
    return;
}
entity.someField = "NEW_VALUE";
orm.save(entity);
out.println("updated id=" + id);
```

## Common Actions

Live ORM read:

```jsp
PearSimpleORM orm = Persistence.global().orm();
Vendor vendor = orm.load(Vendor.class, 123L);
out.println("vendor=" + vendor.id + " " + vendor.name);
```

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

Spring bean/job trigger:

```jsp
<%@ page import="com.pear.spring.SpringApplicationContextProvider" %>

MyService service = SpringApplicationContextProvider.getApplicationContext()
    .get()
    .getAutowireCapableBeanFactory()
    .getBean(MyService.class);
service.doTheThing();
```

Treat job triggers as runs that need a clear preview of what clicking `Run` will start.
