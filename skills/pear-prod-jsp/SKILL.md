---
name: pear-prod-jsp
description: Run one-off JSPs on live Pear api.pearcommerce.com servers for production reads, live PearSimpleORM checks, S3/R2 uploads, cache/tool probes, job triggers, or approved database writes. Use when the user asks to use devops/jsp.sh, run code on production/test via JSP, inspect or mutate live ORM state without a deploy, or learn from JSPs archived in s3://assets.pearcommerce.com/jsp-log.
---

# Pear Prod JSP

## Overview

Use a temporary JSP when the useful execution context is the live Pear server: production classpath, IAM role, AppConfig/secrets, live `Resources`, live `Persistence`, and the same caches a deployed request sees. Default to read-only diagnostics and tool actions; treat database writes as a separate approved operation.

## Required Safety

- Ask for explicit user approval before running any JSP that writes to the database. This includes `save`, `saveAsync`, `saveAsyncWithBackpressure`, `delete`, `queuedForDeletion`, association writes, `JDBCUtil.executeUpdate`, SQL `UPDATE`/`INSERT`/`DELETE`, schema changes, and job/service triggers that are expected to write database rows.
- Use `--single` for any side effect unless the task truly needs to run once per instance. Without `--single`, `devops/jsp.sh` can execute the helper on every running instance in the environment.
- Be explicit about environment. `jsp.sh` defaults to `PROD` when `-e` is omitted, so pass `-e PROD`, `-e TEST`, or the intended env deliberately.
- Make DB writes idempotent and narrow: hard-code or parameterize exact IDs, verify old values before changing them, print skips, and ensure a second hit of the random JSP URL cannot duplicate work.
- Prefer `Persistence.global().orm()`/entity `save` over direct SQL so PearSimpleORM hooks, history, and cache behavior run normally. If direct SQL is necessary, state the cache/ORM bypass risk in the approval request.
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
- `jsp.sh -j some.jsp?x=y` strips the query string; do not rely on arbitrary query params with `jsp.sh`. Use hard-coded constants, create separate dry-run/write JSPs, or use an existing repo JSP with `jspx` only after confirming that path still works for the target environment.
- For Fargate/FG environments, read the current `jsp.sh` and `fg-jsp.sh` branch before side effects. Delegation and `--task` handling may differ from EC2.

## Top-Level JSP Template

Use `text/plain` for one-off runs so stack traces and progress are readable in curl output. Use HTML only when visual inspection is the point, and wrap errors in `<pre>`.

```jsp
<%@ page contentType="text/plain; charset=UTF-8" %>
<%@ page import="com.pear.config.Persistence" %>
<%@ page import="com.pear.config.Resources" %>
<%@ page import="com.pear.config.ServerEnv" %>
<%@ page import="com.pear.simpleorm.orm.PearSimpleORM" %>
<%@ page import="org.apache.commons.lang3.exception.ExceptionUtils" %>

<%
String LOG = "[prod-jsp-example] ";
try {
    PearSimpleORM orm = Persistence.global().orm();
    out.println(LOG + "env=" + ServerEnv.global().env + " server=" + ServerEnv.global().server);
    out.flush();

    // Do the read/tool action here.

    out.println(LOG + "done");
} catch (Throwable e) {
    Resources.global().logger.error(LOG + "failed", e);
    out.println(ExceptionUtils.getStackTrace(e));
}
%>
```

Inside loops, catch expected per-item `RuntimeException`s only when continuing is intentional; log the item identity and keep a consecutive-error guard for broad scans. At the outer boundary, catch `Throwable`, log through `Resources.global().logger.error("message", e)`, and print `ExceptionUtils.getStackTrace(e)`.

## Workflow

1. Classify the run as read-only, external write, DB write, or job trigger. If any DB write is possible, stop for approval before running.
2. If changing rows, first run or prepare a read-only preview that prints exact target IDs/counts/current values. Prefer a `boolean execute = false` dry run in the JSP, then switch it to `true` only after approval.
3. Create the JSP as a scratch file, usually under `/tmp`, unless the user wants a persistent repo JSP.
4. Keep imports minimal, but use real Pear helpers (`Persistence.global().orm()`, `S3Util`, `SpringApplicationContextProvider`, `JDBCUtil`, `JSON`, `Parallel`) instead of local reimplementations.
5. Run with an explicit env and `--single`:

```bash
devops/jsp.sh -j /tmp/descriptive-prod-read.jsp -e PROD --single
```

6. Capture and summarize the printed remote URL, S3 source key when visible, output, and any exception stack. If the run wrote DB rows, verify with a follow-up read-only query/JSP.

## DB Write Approval

Before running a DB-writing JSP, ask the user for approval in this shape:

```text
This JSP will write to the production database. Approval needed before I run it.
Env:
Command:
Tables/entities:
Selection:
Mutation:
Expected max rows:
Idempotency/old-value guard:
Verification:
```

Do not run until the user explicitly approves this exact write/run. If the JSP changes after approval, ask again.

Dry-run guard pattern:

```jsp
boolean execute = false; // switch to true only after approval
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

Treat job triggers as DB writes when the job mutates database rows.
