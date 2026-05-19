# Codex Goal: Improve a Pear Commerce PR

Canonical location: `https://github.com/Pear-Commerce/pear-ai-skills/blob/main/skills/pear-engineering-workflow/references/codex-pr-improvement-goal.md`

Use this when asked to edit a PR, branch, or review follow-up. Do not stop at notes when safe edits are possible: inspect the PR, make targeted improvements, run relevant checks, and summarize the result. This is a repair goal, not a style pass. Correctness, data semantics, observability, production load, and reviewability matter most.

Examples are heuristics from Pear Commerce code/review history. If they conflict with current code, README, lint, tests, or production semantics, prefer the current source of truth and say why.

## Operating Loop

1. Resolve context: current PR/branch, title/body, commits, changed files, issue comments, review comments/threads, failing checks, README, PR template, lint/test scripts, nearby code.
2. If the PR came from an incident, deploy failure, Slack thread, or partner escalation, capture the production symptom, timeline, rollback/kill-switch context, and metric/log source.
3. Build a local map before editing. Use `rg`; search existing utilities, services, entities, loaders, controllers, clients, hooks, jobs, migrations, and tests. Prefer recent patterns over old legacy call sites.
4. Edit correctness first: concrete bugs, null/error handling, duplicate work, risky cache/load behavior, status semantics, observability, broken tests.
5. Keep scope tight. Put behavior in the owner layer and keep most new code in purpose-owned modules; existing-code touchpoints should be thin hooks, registry wiring, shared utility updates, or call-site handoffs.
6. Verify with the smallest meaningful checks. Java: targeted Gradle test, `compileJava`, or `./gradlew build -x test -x testCI` for compile/lint. In `api.pearcommerce.com`, any Gradle test that loads Spring/Pear resources, SimpleORM, real entities, UPC resolver scripts, AppConfig, or Snowflake should default to the shared dev DB by prefixing the command with `MYSQL_CREDENTIALS_SECRET=prod-db-10-2025 MYSQL_HOST=analytics-database.pearcommerce.com MYSQL_HOST_READ=analytics-database.pearcommerce.com MYSQL_HOST_WRITE=analytics-database.pearcommerce.com SNOWFLAKE_CREDENTIALS_SECRET=snowflake-2025-12-01`; pure compile or pure unit tests can run without it. JS/TS: repo lint/test/build or closest targeted script. Docker/build: verify the runtime stage that consumes the dependency.
7. If checks cannot run, say exactly why and what remains unverified.

## Standards Hierarchy

1. Preserve domain semantics and production safety.
2. Reuse repo abstractions and utilities.
3. Reduce load, memory, duplicate calls, hidden concurrency, and stale caches.
4. Keep ownership injectable and testable.
5. Keep methods shallow, named, and terse.
6. Match local style and lint.

The high-level pattern is: put behavior where it is owned, make data/failure/cache/concurrency paths explicit, and remove accidental complexity. In hot production paths, prefer narrow reversible fixes, kill switches, and monitored rollout over broad elegant rewrites.

## Review Preferences

### Prove Behavior

- Prefer a test, local request, focused reproduction, direct endpoint, or metric/log comparison that fails before and passes after.
- Do not mark tests slow/flaky or disable them without root cause and follow-up. For scraper tests, prefer parser/static-data harnesses over live retailer/network dependencies.
- Create CI/test data locally; do not depend on unguaranteed vendors, UPCs, or fixture rows.
- For NPE/parser/status/SQL/build fixes, verify the exact failing path. Include stack trace, query, endpoint, symptom, or before/after signal in PR text when needed.
- Build/deploy scripts should fail loudly. Remove `|| true` around required commands. Verify the stage that actually needs `java`, `node`, certs, or runtime deps.
- For local boot bugs, ask for full logs from startup and improve the boot path, not only the last missing row.
- After import/annotation/build changes, run compile/lint; a test fix that does not compile is broken.

### Search Before Creating

- Search first. Reuse/extend helpers such as `JSON`, `TextUtil`, `URLUtil`, `JDBCUtil`, `ObjectsUtil`, `ListUtil`, `MapUtil`, `Streams`, `Parallel`, `JurlProxyFallback`, `JurlCache`, `S3Util`, existing loaders, clients, services, hooks, and frontend helpers.
- Prefer improving an existing general utility over adding a near-duplicate in a feature file. Name site-specific logic with the site/domain so it does not look general.
- Use structured parsers/APIs for CSV, URL, JSON, SQL tokens, DOM, query strings, and file paths.
- For retailers, scrapers, jobs, API clients, resolvers, and availability updaters, search existing updater/util/client/resolver bases first.
- Add low-level tests for new utility behavior.

Examples: move SQL escaping toward `TextUtil.escapeSql`/`JDBCUtil`; file paths to `URLUtil.getFilePathWithoutExtension`; delimited strings to `TextUtil.parseDelimited`/`parseCSV`; case-insensitive checks to `StringUtils.equalsIgnoreCase`; query strings to `QueryString`; browser curl/Jurl translations back into existing Jurl/POJO patterns.

### Streams And Collection Transforms

Use streams/array pipelines for transformation, filtering, grouping, deduping, sorting, projecting, joining, flattening, and bounded slicing when they make dataflow clearer. Keep loops for `ResultSet` scanning, side-effect-heavy saves/updates, resource lifetimes, retry/early return, interruption, per-item exception classification, and request short-circuiting.

Good stream-shaped examples:

```java
Map<Long, List<Long>> upcsByVendor = idToUPCs.entrySet().stream()
    .map(e -> new Tuple2<>(e.getValue().vendorId, e.getKey()))
    .collect(Streams.groupTuple2());
```

```java
Set<UrzaRetailerUpcIds> distinct = Streams.flattenValues(
        requestedZipToFetchedData,
        retailers.size() * zipCountryCodeSet.size()).stream()
    .collect(Collectors.groupingBy(UrzaRetailerUpcIds::getUpcRetailerZipStoreIdCC))
    .values().stream()
    .map(list -> list.stream()
        .sorted(Comparator.comparingLong(urzaData -> urzaData.urzaId))
        .findFirst()
        .get())
    .collect(Collectors.toSet());
```

Checklist:

- Use `Collectors.groupingBy`, `mapping`, `toMap`, `Collectors.joining`, `Streams.groupTuple2`, `mapTuple2`, `groupByUnique`, `fairBatch`, `load`, `loadMapped`, `awaitAll`, and `parallelMap` where they express the shape.
- Filter nulls before dereferencing. Use named records/classes when tuple positions have domain meaning.
- Count passes in hot paths. Avoid repeated map/collect chains, redundant sorts, and stream/loop mixtures that scan the same data repeatedly.
- `stream().toList()` is immutable; use `collect(Streams.toList())` or another mutable collector when callers mutate.
- Use lazy `findFirst()` or a loop with `break` for "try inputs until one works." Do not collect all HTTP/search responses when the first match should stop the search.
- Do not mutate source collections inside streams. Error Prone checks this.
- Treat `parallelStream()` as hidden common-pool async work. Avoid it by default in availability recomputes, UPC resolution, warm-data/cache loaders, common endpoints, and code already inside a named pool. Prefer sequential streams, batching, `Streams.parallelMap`, or explicit executors.
- Streams are not presumed faster than loops. Use the form that makes cost and dataflow easiest to review.

### Load And Fetch Deliberately

- Avoid whole entities/wide result sets when IDs, counts, projections, cache keys, or a few columns suffice.
- Preserve predicates and domain constraints: `vendorId`, `retailerId`, `storeId`, `zip`, country code, `isInstacart`, store-vs-zone, active/live, item availability flags, null zip, and source type.
- Dedupe by real domain keys: `retailerId/storeId`, `retailerId/zip/storeId/countryCode`, `upcId/retailerId`, URL/status IDs, `vendorId/upcId`.
- Combine lookups to reduce round trips. Pass already-loaded entities forward rather than reloading by ID. If async saves must complete first, make the wait contract explicit.
- Do not make the same HTTP request twice to warm cache or retrieve data you already have; keep the first `LoggedJurl`, POJO, or `CompletableFuture`.
- Filter where semantics are known. Push cheap predicates into SQL when safe; hydrate enough domain data before filtering when SQL lacks the meaning.
- Keep cheap pruning before pairwise comparisons, geocoding, string matching, wide store loads, and candidate fetching.
- `loadAll` is a last-resort shape, not forbidden. It can be fine for tiny bounded sets; broad production loaders need IDs, projections, streaming, batching, or narrower interfaces.
- For direct SQL/scripts/admin tools that bypass normal ORM writes, dirty every affected cache: vendor, retailer, URD, resolver, R2/S3, frontend, and any index/key caches.
- For frontend/widgets, lazy-load locators, partner calls, DOM observers, and expensive API calls after user intent/visibility.
- For Node/Worker fetches, optimize bytes/copies first: range fetch, stream, parse once, avoid clone/text/parse/stringify copies.
- Keep formatting helpers from changing meaning. Validation/semantic expansion belongs in a separate helper.

Examples: group UPCs by vendor before URZA loads; use IDs/projections/minimum-profile URDs; dirty by `upcId`, `VendorStoreUPCId`, or distinct index key; expose `getAllStores()` when upstream returns all stores; use `TextUtil.splitByChar` in hot string paths; prefer fixed-width `varchar` over `TEXT` in hot bounded columns.

### Async, Executors, And Backpressure

Concurrency must show: which pool owns work, bounds/backpressure, error propagation, interruption, and caller wait semantics.

- Never rely on `ForkJoinPool.commonPool()` for `CompletableFuture`; Pear has `CompletableFutureMissingExecutor`.
- Pass explicit executors to `supplyAsync`, `runAsync`, async continuations, and helpers. Use injected `Pools`, `PearThreadPoolExecutor`, or repo-managed bounded executors.
- Prefer `CompletableFuture`, `Parallel`, `Streams.awaitAll`, `Parallel.streamResults`, and repo worker pools over custom blocking queues/cross-thread structures.
- Use `saveAsync` or normal async save queues for entity saves.
- Put slow/throwing work inside the future body. Do not run the scrape first and put only a parser in `supplyAsync`.
- Observe failures with `whenComplete`, domain result objects, logging with exception objects, or rethrow/classification. Do not swallow async exceptions.
- Batch before parallelizing many tiny DB writes. `PearBatchingAsyncWorkerPool` fits true batching; `PearThreadPoolExecutor` fits bounded callables/future composition.
- Do not assume SNS/SQS/Lambda/workers imply backpressure. Check consumer concurrency, visibility timeout, retry policy, delete-on-timeout, and downstream limits.
- Choose rollout concurrency from data with cushion; otherwise instrument first.
- Keep execution ownership at the caller when extracting helpers: extract synchronous/testable work, then let caller wrap in a future with the right executor.
- Avoid creating/shutting down pools in loops. Submit known tasks to one named pool.
- Distinguish root cause from saturation symptoms: request-pool spikes, lock contention, auth-token waits, and thread-pool timeouts need metrics/stack traces.
- Prefer checked `get`/repo helpers when partial failure needs classification; `join` can hide exception handling.
- Use `completedFuture` when the value is already computed.
- Use `thenComposeAsync(..., pool)`/`thenApplyAsync(..., pool)` when continuations belong on a specific executor.
- Avoid `synchronized` in new hot/async code when repo locks, Caffeine, concurrent maps/sets/deques, or write-once structures fit.

```java
CompletableFuture<Result> future = CompletableFuture.supplyAsync(
    () -> fetchAndParse(input),
    fetchExecutor);
```

```java
Map<String, CompletableFuture<List<Shop>>> zipToFetch = zips.stream()
    .collect(Collectors.toMap(
        Function.identity(),
        zip -> CompletableFuture.supplyAsync(() -> fetchShops(zip), jurlExecutor)));
```

### Keep Services Injectable

- Prefer Spring services with constructor/field injection over static globals, `Resources.global()`, `ManualSpringAutowired`, manual wiring, or `new` for collaborators.
- Move behavior out of entities when it needs ORM, metrics, app config, caches, logging, external clients, events, async, or cross-entity coordination.
- In tests, use the repo Spring/API test base and autowire services when the class conceptually depends on app resources.
- Lifecycle behavior that must hit `save`, `saveAsync`, `batchSave`, `orm.save`, and `orm.saveAsync` belongs in the save/update abstraction, not one entity path.
- Jobs/recomputers/legacy entry points can often use Spring. Fix scheduler/creator/caller boundaries instead of bypassing autowiring.
- `ManagedResourcesConfig.createInstance(...)` can bridge scripts/JSP/legacy `new` paths to Spring-managed construction; treat it as transition aid.
- Do not introduce static mutable state for singleton services where instance state is enough.
- When converting utilities to beans, handle ambiguous bean lookup with qualifiers/explicit wiring.
- Keep app datasource/schema quirks out of low-level utilities unless a real DAO/service owns them.
- Keep abstractions narrow when boundaries are blurry; a retailer-specific service can be clearer than a premature hierarchy.

```java
@Service
public class PulseReportGenerationJob extends PearScheduledJob {
    private final PulseReportRepository repository;
    private final PulseReportGenerator generator;

    public PulseReportGenerationJob(PulseReportRepository repository,
        PulseReportGenerator generator) {
        this.repository = repository;
        this.generator = generator;
    }
}
```

### Keep Methods Shallow And Terse

- Use guard clauses. Extract helpers when a method combines fetching, classification, persistence, logging, response shaping, cache checks, and status transitions.
- Prefer narrow hooks/template methods over broad strategy rewrites for tiny variations.
- Remove stale fields, dead assignments, old-behavior comments, and contradictory code touched by the PR. Do not apply this as a blanket rule to serialized external JSON DTO fields; see the DTO guidance below.
- Be terse, not cryptic. Domain names should say what they mean.
- Choose behavior path before doing work; avoid "correction after old path" logic.
- Validate null/empty once at boundaries.
- Pass concrete values when known; do not add mapping/deferred functions just to look generic.
- Keep comments that preserve informal contracts; delete comments that explain removed implementation.
- Separate levels of validation: "HTTP/search response valid/cacheable" differs from "contains requested UPC."

### Null, Empty, Zero, Optional

- Treat `null`, empty string/list, zero, false, skipped, invalid, unknown, and unavailable as distinct until domain/product semantics prove otherwise.
- Cache repeated misses explicitly with `Optional` or a sentinel.
- Throw/classify impossible missing fields. Do not turn corrupted upstream responses into ordinary empty results.
- Preserve legacy null semantics where real, e.g. null zip/country code may be valid in old paths.
- Use null-safe extraction such as `Optional.ofNullable(...).map(...).orElse(null)` instead of catching NPE.
- Ask whether boxed primitives are genuinely nullable.
- Preserve `null` when it is the API representation of missing data; do not convert missing price to `$0.00` or missing list to `[]` if that creates two missing-value conventions.
- Use `@NonNull`/static-analysis proof when deleting defensive null checks.

```java
String sellerType = response.stream()
    .filter(p -> p.product.asin.equals(itemId))
    .flatMap(p -> Stream.ofNullable(p.product.buybox_winner))
    .flatMap(b -> Stream.ofNullable(b.fulfillment))
    .flatMap(f -> Stream.ofNullable(f.type))
    .findFirst()
    .orElse("3p");
```

### Status And Availability Semantics

For availability updaters, batch updaters, retailer-list, URZA loaders, Pulse, and partner UPC APIs:

- `INVALID`: bad input/data/config/store/zip/itemId/GTIN/UPC where scan should not happen or cannot be trusted.
- `UNKNOWN`: attempted scan failed, errored, timed out, or produced ambiguous response.
- `UNAVAILABLE`: valid scan found product/store unavailable or not found.
- Return `BatchAvailability`/domain results for invalid/failure cases so metrics and error tables do not report misleading "missing result."
- Isolate per UPC/store/brand failures where possible.
- Add explicit invalidation messages: bad store, blank itemId, invalid zip, bad UPC, missing offer, etc.
- Separate read/scrape paths from write/update paths when status flow is clearer.
- Be careful sending `INVALID` downstream when it means our updater/config is broken rather than partner-visible availability.
- Distinguish UPC lookup errors, no-itemId lookup results, and async exceptions. Avoid manual known-root/status mutations that break telemetry.

### HTTP, Jurl, And External Responses

- Keep caller-specific Jurl behavior visible on the Jurl instance unless truly domain-wide.
- `Supplier<LoggedJurl>` usually means a fresh mutable request per proxy/request attempt.
- Put validation that controls retry/cacheability inside `goThen` so bad transient responses are not written to jurlcache.
- Preserve `goThen` semantics: non-null return = success/cacheable; `null` return = failed attempt, same as throwing; empty domain value/sentinel = cacheable no-data only when intentionally true.
- Do not move response-usability validation out of `goThen` to appease a checker; suppress the checker when validation belongs to the retry/cache boundary.
- Use `throwOnNon200(true)` when non-200 means fetch failure.
- Return `Optional.empty()`/sentinel only for cacheable no-data, not transient fetch failure.
- Throw `JurlException` when request/response details help Sentry/Scalyr/Datadog debugging.
- Prefer structured API/ld+json/schema.org over CSS selectors when available.
- Put `@JsonIgnoreProperties(ignoreUnknown = true)` on external DTOs for future upstream fields.
- For external API DTOs, scraper payload models, JSON-LD/schema.org models, app/webhook payloads, and other Jackson/Pear `JSON`-deserialized classes, prefer representing as many real upstream fields as practical, even when today's code reads only some of them. These fields document the payload shape, help debugging, and save future rediscovery.
- Do not remove serialized JSON DTO fields solely because they are currently unread. Stand firm graciously on review comments such as "this DTO field is deserialized but never read"; explain that unused-but-real DTO fields intentionally preserve the upstream contract. This is especially important in retailer integrations, where payload knowledge is part of the value of the implementation.
- Remove DTO fields only when they are proven not to exist upstream, actively mislead readers, contain sensitive data we should not retain, duplicate another model with no added clarity, or create meaningful hot-path memory/parse cost. If the field is real and low-cost, prefer keeping it over narrowing the model to the current consumer's reads.
- Treat one `JurlProxyFallback` as one logical request with proxy retry/chaining. Search terms or stores are alternative inputs, not fallback objects.
- Separate cacheability validation from UPC/item/domain matching. A valid no-match response can be cached and classified later.
- For high-fanout HTTP work, parse to the smallest useful object in the request path; avoid holding full body/DOM for thousands of requests.
- Cache keys should include store/zip/item/group/header/body fields only when they affect content; omit auth-only CSRF/session values when they only gate access.
- Aggregate JurlCache error rates need dimensions: domain, proxy type, request type, cache-hit/live, fallback stage, status, timeout, expected cheap-proxy failures.
- Prefer `goBody(Class)`, direct byte parsing, `bodyJson(requestPojo)`, typed DTOs, and `QueryString` over raw strings/maps when stable enough.

```java
return JurlProxyFallback.none(() -> authorizedRequest(relativePath, queryParams)
        .method(IJurl.GET))
    .useJurlCache(true, cacheMillis)
    .goThen(jurl -> JSON.get().parseTree(jurl.getResponseBody()))
    .get();
```

### Caching Standard

Before adding/expanding a cache, require:

- Reason: measured latency, load reduction, downstream protection, repeated expensive work.
- Busting story: admin/CS edits, deploys, reset endpoint, TTL, key/version bump, exclusion.
- Kill switch for data inconsistency or memory pressure.
- Null/empty/failure strategy. Cache misses explicitly when repeated misses are expensive.
- Memory bound, concurrency behavior, and local vs cross-server scope.
- Environment identity when local/test/prod resources, proxy zones, debug/admin paths, or R2/S3 keys differ.
- Failure cache semantics: HTTP 4xx, timeout, invalid itemId, empty domain answer, and parse failure are different.
- CDN/worker cache behavior: do not accidentally cache 4xx/5xx; preserve `stale-while-revalidate` if relied on.

If absent, prefer query improvement, batching, dedupe, or reusing fetched results. Do not copy AppConfig values into static constants unless one value per server startup is intentional. After direct DB/script updates, dirty all cache layers that can hold stale data.

### SQL, Schema, Persistence

- Preserve every predicate intentionally. Know which data becomes included/excluded.
- Prefer query fixes over masking results in Java when DB work is expensive.
- Watch for `COALESCE`, temp tables, filesort, huge `IN` lists, off-row `TEXT`, unindexed date predicates, missing partitions, and wrong index order.
- Use prepared statements/`JDBCUtil.executeUpdate` for variable data. Use `JDBCUtil.buildListToken` only when `IN (...)` is required and empty-list behavior is understood.
- Test SQL escaping with apostrophes/quotes when touching escaping/list helpers.
- Schema lifecycle hooks belong where all write paths hit them.
- Table creation should match actual DDL, including partitions.
- Prefer ORM/entity saves for one-time migrations when hand SQL would be fragile; `asyncSave()` can be clearer than batched `INSERT` strings for reasonable row counts.
- Avoid ORM-generated IDs for rows written only by DB triggers.
- Keep datasource/schema quirks out of low-level JDBC helpers unless a DAO/service owns them.
- For huge backfills, pair date predicates with indexed ID ranges such as `id > date_to_id(...)` and explicit partitions when relevant.
- Isolate the exact hot query before changing a similar query with different result semantics. Run `ANALYZE TABLE` after adding indexes when planner stats matter.

### Logging, Metrics, Errors

- Log exception objects, not only messages, so stack traces reach Sentry/Scalyr.
- Expected invalid-data conditions should be domain results, not tracked exceptions.
- Add metrics/tags where context exists: updater class, retailerId, storeId, UPC, status, job phase, cache-hit/live, proxy type.
- Avoid log spam. Suppressed/skipped exceptions should be omitted or classified consistently.
- Include enough context to debug production without leaking secrets.
- Avoid `Try.getOrNull()` for unexpected failures; use `onFailure(logger::error)` before null/empty conversion, or explicit catch if swallowing is intended.
- Prefer specific catches over broad `catch (Exception)`, especially where interruption matters.
- If errors are absent from Sentry/Scalyr/Datadog/DLQs, treat missing observability as a bug.
- In incidents, ask what needs replaying and where failure should have surfaced: metrics, step completion, DLQs, dashboards, job logs.
- Do not mistake downstream saturation for root cause; correlate deploys, traffic, dependency behavior, locks, and pool metrics.

### PR Scope And Review Shape

- Keep PRs focused. Split formatter/refactor churn from behavior unless production urgency requires landing/monitoring.
- Make review easy by keeping most new behavior in purpose-owned modules; existing-code changes should be minimal integration points.
- Use config for rollout, kill switches, credentials, and tunables. Keep core parsing logic in code unless remote config is clearly worth the debugging cost.
- If a helper is specific to X, answer with code: name and locate it specifically.
- Explain subtle bugs/impact and no-op risks in the PR description.
- Provide tools/process for automated refactors claimed as behavior-preserving.
- Re-run review/AI assistance after major PR updates if earlier suggestions were stale.
- Keep committed local/dev run configs generic; personal secrets/overrides belong in personal excludes.
- During incidents, prefer rollback, kill switch, config disable, placeholder/display change, jobs-only deploy, or narrow forward fix over broad cleanup.
- `&& false`/`|| true` are unfinished toggles. Remove truly dead old code; use named constants/AppConfig for recent behavior-bearing toggles.
- Do not remove IDE/run/format config without equivalent build/README setup instructions.

## Helper Reference

Pear code is helper-rich, not helper-happy. Before adding a utility, search by concept, return type, and domain words. If a helper is close, extend it with focused tests. If unsafe for the new use, say why and keep new code narrowly named.

### Search Pattern

Search these families before creating helper code:

- Parsing/text/serialization: `JSON`, `DOMUtil`, `TextUtil`, `CSVUtil`, `StringOrListDeserializer`, byte-array serializers, `CurrencyUtil`, `BigDecimalUtil`, `QueryString`, `URLUtil`, `MD5Util`, `GzipUtil`, `ReflectionUtils`, `EnumerationUtil`.
- Collections/dataflow: `ListUtil`, `MapUtil`, `OptionalUtil`, `ObjectsUtil`, `Streams`, `ConcurrentLinkedDequeList`, `ReadWriteLockList`, write-once composites.
- SQL/storage/cache: `JDBCUtil`, `FileUtil`, `S3Util`, `JurlCache`, `S3CachedValue`, `Memoizer`, `LazyMemoizer`, `RefreshingMemoizer`, `TimedReference`, `DeferredResult`, `ExpiringAnswer`, Redis/Memcached/SimpleORM caches, URZA caches.
- HTTP/proxy/browser: `LoggedJurl`, `Jurl`, `IJurl`, `JurlProxyFallback`, `JurlUtil`, `HeadlessBrowserPool`, `ScrapflyAPI`, `ZenrowsAPI`, `AWSLambdaJurl`, `UserAgentUtil`, `RedirectUtil`, `AuthUtil`, `IPUtil`, `PhoneUtil`.
- Async/concurrency: `Parallel`, `Pools`, `PearThreadPoolExecutor`, `PearAsyncWorkerPool`, `PearBatchingAsyncWorkerPool`, `DynamicBatchingAsyncWorkerPool`, `KeyedLock`, `KeyedLockedReference`, `CrossServerKeyedLock`, `Locks`, bounded/fallback executors, `QueueUtil.sleepDrain`.
- Domain: `UPCResolver`, `ItemIdInfoResolver`, resolver bases (`Dependent*`, `GoogleMetadata*`, `DomSelector*`, `Legacy*`, `PlatformIdInfoResolver`, `SearchHydrateItemIdSingleResolver`), `UPCResolutionUtilities`, `UPCResoGraph*`, `CandidateComparator*`, `QuoromValidator`, `SRetailerItemData`; availability/URZA helpers (`RecomputeResult`, `AvailabilityStatusUtil`, `BatchAvailabilityUpdater`, `UPCRetailerZipAvailabilityLoader`, `PulseOrchestrator`, `CachedUPCZipAvailabilities`); scraper families (`Instacart*`, `Walmart*`, `Target*`, `Kroger*`, `Amazon*`, `CostcoUtil`, `SafewayScraperUtil`, `Chewy*`, `Mi9ScrapperUtil`, `UnataUtil`, `DoordashUtil`, `SoldAtUtil`); store/catalog/asset/config/integration helpers (`StoreLoaders`, `GeoUtil`, `PearImage`, `CloudflareUtil`, `PartnerUPC*`, `UpdatePartnerUPCRetailerDataUtil`, `AWSAppConfigUtil`, `AWSSQSUtil`, `SlackUtil`, `EmailUtil`, Google/Facebook/Foursquare/SMS/Twitter helpers).

### Structured Parsing

- Use `JSON.get()` over `new ObjectMapper()`. It centralizes Pear Jackson settings, lenient parsing, optional support, compressed serialization, null-key handling, and diagnostics.
- Use `parseObject`, `parseList`, `parseSet`, `parseMap`, `parseTree`, `reParse`, `stringifyMin`, `toCompressedByteArray`, `fromCompressedByteArray`, `extractUPCs`, `evaluatePath`, and `sanitizeJson` as appropriate.
- Use `@JsonIgnoreProperties(ignoreUnknown = true)` on third-party DTOs; `StringOrListDeserializer` for inconsistent string/list fields.
- Parse bytes directly with `JSON.get().parseObject(bytes, Class)` or `goBody(Class)` when possible.
- Use `DOMUtil.parseSchemaOrgObjects`, `extractUPCs`, `extractMatchingUPCs`, and `extractTextWithNaturalSpaces` for HTML before selector-only logic.
- Use `TextUtil.parseDelimited`, `parseCSV`, `parseCSVLong`, `splitByChar`, normalization/matching/word-set/number helpers, and `CSVUtil` for files.

```java
@JsonIgnoreProperties(ignoreUnknown = true)
public static class TescoSearchResponse {
    public SearchData data;
}
```

### Collections, SQL, Storage

- Use `ListUtil.of` for mutable/null-tolerant construction; `List.of`/`ofImmutable` only when immutability and non-null inputs are intentional.
- Use `ListUtil.getFirstValue`, `first`, `firstNonEmptyList`, `union`, `enumerate`, `collate`, `consistentShuffle`, `merge`, `set`, `isSorted`.
- Use `MapUtil.merge`, `ofNullable`, `createCompositeMap`; `OptionalUtil.firstOf`; `ObjectsUtil` lenient parse/clone/construct helpers; `Lazy`/memoizers for lazy values.
- Use `JDBCUtil.executeQueryToRecord`, tuple/type/map helpers, `executeQueryAndReturnLongs`, `executeQueryAndMapByRow`, `executeUpdate`, `buildListToken`, and SQL value helpers.
- Use `CSVUtil`, `FileUtil`, and `S3Util` for CSV/zip/temp/S3/R2 operations and S3/R2 read/write pools.

```java
List<IdAndUpc> rows = JDBCUtil.executeQueryToRecord(
    "SELECT id, UPC FROM UPC order by id desc limit 20",
    IdAndUpc.class);
```

### HTTP, URLs, Jurl, Cache

- Use `LoggedJurl`/`Jurl` request/response helpers (`bodyJson`, `param`, `cookie`, `asChrome`, `getResponseJsonObject`, `getResponseBytes`, `toCurl`, etc.).
- Use `JurlProxyFallback` proxy lists, retry/status/error policies, cache deciders, `extraCacheKey`, duplicate request suppression, success-rate/circuit-breaker behavior, rate limiters, and attempt sequence generators.
- Use `JurlUtil.fromChromeCurl`, `URLUtil` query/path/encoding helpers, and `QueryString` typed parsing/building.
- Use `JurlProxyFallback.useJurlCache`, `JurlCache.decorate`, `S3CachedValue`, memoizers, `TimedReference`, `ExpiringAnswer`, Redis/Memcached/ORM caches when their semantics match.

```java
SCreatePixelRequest parsed = QueryString.fromQueryString(
    STR."event=\{URLUtil.encode("A B C D")}&pixelId=6789&catalogId=12345967&retailerId=18",
    SCreatePixelRequest.class);
```

### Async, Pools, Locks

- Use injected `Pools`, `Parallel.submitCF`/`submitAllCF`/`allOf`/`getAll`/`streamResults`, `PearThreadPoolExecutor`, worker pools, `Streams.parallelMap`, `QueueUtil.sleepDrain`, and repo lock/list helpers.
- Prefer named bounded pools and existing future orchestration over ad hoc thread pools, common-pool work, custom queues, or `synchronized` hot paths.
- Use `PearBatchingAsyncWorkerPool` only when there is a real batch contract.

## Java Checks

Pear Java uses Java 21, Gradle, Error Prone `2.41.0`, and custom `errorprone-checkers`. Watch especially:

- `CompletableFutureMissingExecutor`, `ComplexLogicInGoThen`, `VavrTryGetOrNullWithoutOnFailure`.
- `ComparisonContractViolated`, `ModifySourceCollectionInStream`, `ModifyCollectionInEnhancedForLoop`.
- `OptionalNotPresent`, `OptionalMapToOptional`, impossible/null comparisons.
- `EmptyCatch`, `Interruption`, `ReferenceEquality`, `ThreadLocalUsage`, `NonAtomicVolatileUpdate`, `JdkObsolete`.
- `BigDecimalEquals`, `ArrayAsKeyOfSetOrMap`, `FallThrough`, `Finally`.

GitHub also compiles with Error Prone/reviewdog; local warning silence is not enough if PR paths are uncompiled or lint was skipped with `-PnoLint`.

## JS/TS/Frontend Checks

- Follow repo scripts: `npm run lint`, `npm test`, `npm run build`, or closest targeted script.
- Match framework style: legacy AngularJS/gulp; Vite/React/MUI/Zustand; Express/CommonJS; Cloudflare Worker conventions.
- Avoid new `any`; model data or add narrow types.
- Reuse shared components, hooks, API clients, middleware, parsers, selectors, and state helpers.
- Use `new URL(...)`, `JSON.stringify`, typed DTOs, and platform APIs over string/selector hacks.
- Keep auth/middleware URLs and token sources pointed at runtime/non-management endpoints where that distinction exists.
- Verify visible paths when practical: null DOM, route matching, CORS/local dev, loading/error states, stale cache, responsive layout, selected company/vendor state, API payload.
- Keep request params consistent across picker/locator/preview flows, e.g. `countryCode`.
- Lazy-load expensive widgets/API calls/DOM observation after user intent or visibility.
- Do not wrap an existing promise in `new Promise((resolve, reject) => promise.then(resolve).catch(reject))`; return/await the promise.
- For ordered/short-circuiting async requests use loops; for independent all-or-nothing use `Promise.all`; for partial failure use `Promise.allSettled` or per-result wrapping.
- In workers/Node, avoid large body copies from `text`, `clone`, parse/stringify/parse; stream/range-fetch/parse once.
- Keep CDN/cache rules explicit; do not cache 4xx/5xx accidentally or drop required `stale-while-revalidate`.

```js
const response = await fetch(url);
const responseStr = await response.text();
const document = new jsdom.JSDOM(responseStr, { contentType: "text/xml" }).window.document;
const recipeUrls = [...document.querySelectorAll("url loc")].map(loc => loc.innerHTML);
```

## PR Repair Recipes

Use these while scanning:

- New utility: search same behavior, move general code to existing helper/module, keep domain-specific names specific, add low-level tests.
- Loop: stream/pipeline for pure transforms; keep loop for side effects, `ResultSet`, resources, early exit, exceptions, or ordered async. Avoid `parallelStream`; count hot-path passes.
- Async: find executor/queue/pool/promise owner; make executor explicit; make failure/wait semantics visible; check SQS/SNS/Lambda concurrency/retry/delete; use repo helpers; batch same-table writes; extract sync work, not future wrappers.
- Fetch/load: check columns/entities and predicates; group lookups; reuse futures/results; dedupe by domain key; prefer bulk/cache-aware loads; avoid bypassing broken paths; dirty caches after direct updates.
- Jurl/external HTTP: distinguish failed fetch from cacheable no-data; keep cacheability validation in `goThen`; remember only non-null `goThen` returns are success, while `null`/throw are failed attempts; use typed DTO/body/query helpers; key cache by content identity, not incidental auth; whitelist success/no-result cases when retries are high.
- Cache: require reason, busting, kill switch, miss/failure strategy, memory/concurrency story, scope. Prefer query/batch/dedupe when cache hides avoidable load.
- Status: preserve `INVALID`/`UNKNOWN`/`UNAVAILABLE`; return explicit results where metrics expect them.
- Tests: deterministic, local data, parser fixtures over live network, justified flaky markers, exact repro path, Spring base when conceptually needed, compile/lint after import/annotation/build changes.
- Build/deploy: verify consuming runtime stage, fail required shell commands, use repo package-managed CLIs, compare old/new runtime and watch original metric/log.
- Incident: keep narrow/reversible, add rollback/kill switch when possible, include proof signal, verify after deploy, ask whether failed work needs replay.
- Try/exception conversion: avoid `getOrNull` without `onFailure`; make swallowed exceptions explicit; convert expected domain failures to domain results; track/throw unexpected failures.

## High-Level Synthesis

- Be semantically honest: do not collapse unknown, invalid, unavailable, empty, zero, null, failed, and skipped.
- Make ownership obvious: services own service dependencies; utilities own reusable semantics; lifecycle behavior lives where all paths hit it.
- Optimize the real bottleneck: duplicate HTTP, wide loads, round trips, temp tables, filesort, off-row columns, byte copies, unbounded async, stale caches.
- Prefer small named surfaces: precise helper, record, grouping key, protected hook, service method, DTO, query builder, cache key.
- Treat observability, kill switches, bounded pools, cache resets, and PR descriptions as correctness.
- Keep cacheability, retryability, domain matching, status classification, and persistence separate.
- Keep synchronization contracts explicit: queued, future returned, records streamed, rows saved, results visible.
- Use laziness to remove work before adding caches, pools, or parallelism.
- Bridge legacy toward Spring/typed ownership without creating new static legacy.
- Optimize without changing meaning: a faster query/cache/batch/async path is not better if it changes stores, zips, countries, statuses, or results.
- Use AI/automation as extra review breadth, not authority; final standard is code evidence, tests, and production signals.

Ask on each PR: what data loads, who owns behavior, what happens on failure, what gets cached, what work runs concurrently, who applies backpressure, and how will production tell us?

## Output

End by reporting:

- What changed.
- Which standards were applied.
- Checks run and results.
- Residual risk or follow-up.
