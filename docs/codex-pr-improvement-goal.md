# Codex Goal: Improve a Pear Commerce PR

Canonical location: `https://github.com/Pear-Commerce/pear-ai-skills/blob/main/docs/codex-pr-improvement-goal.md`

Use this goal when asked to edit a pull request, current branch, or review follow-up so it is more likely to pass Pear Commerce review.

Do not stop at review notes when safe edits are possible. Read the PR, make targeted improvements, run the relevant checks, and summarize what changed.

This is a repair goal, not a style-only pass. Correctness, observability, data semantics, and production load matter more than cosmetic cleanup.

Evidence scope: these standards are synthesized from Pear Commerce Java and JavaScript code history from 2023-2026, GitHub PR review patterns, engineering/tech discussions, lint rules, README guidance, and nearby production code.

Treat examples as review heuristics. If they conflict with current code, README, lint, or production semantics, prefer the current source of truth and explain why.

## Operating Loop

1. Resolve the PR or branch context.
   - Prefer the current branch's PR when one exists.
   - Read the PR title, body, commit list, changed files, review comments, unresolved threads, and failing checks when available.
   - Read local README, PR template, lint config, test scripts, and nearby code before editing.
   - If the PR is in GitHub, inspect both issue comments and review comments. Design feedback often appears in both places.
   - If the PR came from an incident, deploy failure, Slack thread, or partner escalation, capture the production symptom, timeline, rollback/kill-switch context, and the metric/log source that proves the fix.

2. Build a local map before changing code.
   - Use `rg` to find existing utility methods/classes before creating new ones.
   - Search for nearby service, entity, loader, controller, parser, client, React hook/component, route, worker, test, and migration patterns.
   - Identify the existing ownership boundary: entity, service, loader, controller, updater, parser, client, component, hook, route, job, or worker module.
   - Prefer recent patterns over old call sites. Some older code predates the newer service/injection and Error Prone standards.

3. Edit for correctness first, then shape.
   - Fix concrete bugs, missing null/error handling, duplicate logic, risky caching, excessive loading, unclear status semantics, and broken tests.
   - Keep the diff scoped to the PR's purpose.
   - Prefer small direct improvements over broad rewrites unless the current PR already crosses the abstraction boundary.

4. Verify.
   - For Java, run the smallest meaningful Gradle check first, commonly `./gradlew compileJava`, a targeted test, or `./gradlew build -x test -x testCI` when compile/lint feedback is the goal.
   - For JS/TS, run the repo's lint/test/build script when present, or the closest targeted equivalent.
   - For Docker/build changes, verify the stage that actually needs the dependency. A build image passing does not prove the runtime image has `java`, `node`, or other binaries.
   - If a check cannot run, explain exactly why and what remains unverified.

## Standards Hierarchy

Use this order when guidelines pull in different directions:

1. Preserve domain semantics and production safety.
2. Reuse existing repo abstractions and utilities.
3. Reduce load, memory, duplicate calls, and hidden concurrency.
4. Keep ownership injectable and testable.
5. Keep methods shallow, named, and terse.
6. Match local style and lint rules.

The highest-level Pear Commerce pattern is not "use streams" or "make a service." It is: put the behavior in the place that owns it, make the data path explicit, and remove accidental complexity.

When production is hot, the same standards still apply, but the shape changes: prefer a narrow reversible fix, a kill switch, or a monitored rollout over an elegant broad change that cannot be proven quickly.

## Pear Commerce Review Preferences

### Prove Behavior

- When fixing a bug, prefer a test, local request, or focused reproduction that fails before the fix and passes after it.
- Do not disable, slow-mark, or flaky-mark tests without a root-cause explanation and a follow-up path.
- Avoid tests that depend on live retailer scraping or external network behavior. Split fetching from parsing/processing so deterministic logic can be tested locally.
- If CI data is not guaranteed, create test data in the test instead of depending on a vendor, UPC, or fixture that may not exist.
- When the change is a no-op, call that out and fix the real stage or call site.
- Example: changing the Gradle build stage did not prove the app Docker image had Java; the useful check was `java --version` in the app image.
- For incident fixes, verify immediately after deploy or local reproduction. Compare the failing and fixed versions in Datadog, Sentry, Scalyr, dashboards, or a direct endpoint rather than waiting for a recurring alert.
- Put the concrete stack trace, query, endpoint, or symptom in the PR description when that is the only way future reviewers can tell the fix targets the real failure.
- Build and deploy scripts should fail loudly. Remove `|| true` or equivalent failure masking around commands whose success is required.
- When a local-only or empty-database failure is reported, ask for the full startup/run log from the beginning.
  Make the app boot path better; a fix for only one local row may leave the next engineer blocked.
- Prefer small local harnesses for scraper/resolver behavior. If a static-data resolver test already exists, extend it instead of requiring a live retailer request to prove parsing, matching, or status classification.
- For flaky scraper tests, require the explanation in the PR.
  "This calls live retailer sites through proxies and will be replaced by parser/fixture coverage" is a valid reason; silent `@Flaky` is not.
- When a PR claims a bug is fixed, prefer a repro test or exact before/after signal over "seems more likely to have the right data."
- Run compile/lint after import or annotation changes. A flaky-test fix that does not compile is still a broken PR.

Review patterns:

- PR feedback on flaky tests asked for the root cause before marking a test flaky.
- PR feedback on parsing asked for a lower-level parser test instead of a broad fetch-dependent test.
- PR feedback on NPE fixes asked to verify the live NPE, add a test that catches it, and show the fix resolves that same path.
- PR feedback on Docker build fixes asked whether the changed line could affect the failing stage, then requested a direct runtime check.
- For widget-config NPE incidents, keep rollback and roll-forward work in parallel, include the stack trace in the PR, and compare version/error-rate signals after the fix.
- For Docker/deploy fixes, verify the runtime image directly and make install/cert commands fail the build instead of masking failures.
- For local-dev startup bugs, run the server against an empty DB, fix boot blockers until startup works, and ask for complete logs rather than guessing from the final exception.
- For UPC-resolution local testing, use `testResolversUsingStaticData`-style harnesses to prove resolver changes without depending on live partners.
- For flaky tests, explain the underlying scraper/proxy dependency and name the follow-up project or test seam that will make the behavior deterministic.
- Create vendors/data inside tests instead of relying on CI database fixtures that nobody actively guarantees.
- Add unit tests that demonstrate the actual repro when a data-loading fix would otherwise be speculative.
- Treat compile failures after import/annotation changes as local-check failures; run `./gradlew build -x test -x testCI` or the closest targeted compile/lint check.

### Search Before Creating

- Search first. Reuse or extend existing utilities such as `TextUtil`, `URLUtil`, `JDBCUtil`, `ObjectsUtil`, `Streams`, `ListUtil`, existing loaders, existing clients, existing services, and existing frontend helpers.
- Prefer modifying an existing general utility over creating a near-duplicate method in a feature file.
- Name utility methods for the exact semantics. If the logic is site-specific, include the site/domain in the method name instead of making a vague helper look general.
- Put structured parsing in structured utilities. Do not hand-roll CSV, URL, JSON, SQL-token, DOM, or file-path parsing when the repo already has a helper or dependency.
- For retailers, scrapers, jobs, and API clients, search for an existing updater/util/client first. Many partial implementations exist and are better extension points than a new one-off class.
- If using generated helper code to translate browser `fetch`/curl into Jurl/POJO code, still compare against existing Jurl, response POJO, and utility patterns before committing it.
- Add low-level tests for new utilities.

Pattern examples:

- Prefer moving SQL escaping toward `TextUtil.escapeSql` instead of hiding a one-off fix inside `JDBCUtil.buildListToken`.
- Prefer moving file path parsing to `URLUtil.getFilePathWithoutExtension`.
- The codebase added `TextUtil.parseDelimited` and `parseCSV` rather than repeating delimiter parsing.
- Use `StringUtils.equalsIgnoreCase` instead of custom case-normalized string checks.
- Name methods so site-specific recipe logic stays visibly site-specific inside multi-site controllers.
- For Macy's-style fetch investigations, start from existing updater/util code, itemId-based requests, and the minimal browser request before creating a fresh scraper path.
- A Jurl/POJO conversion workflow is useful only when the generated code is folded back into existing request and response patterns, not committed as unchecked glue.

### Prefer Streams For Data Transforms

Prefer streams when the code is transforming, filtering, grouping, deduping, sorting, projecting, or collecting data. A good stream pipeline should read like the shape of the data.

Use streams for:

- `filter` + `map` + `collect` transformations.
- Grouping by a domain key.
- Deduping by a real key.
- Turning tuples or records into maps.
- Sorting and picking one representative item.
- Flattening nested collections when there is no side-effect ordering requirement.
- Joining strings from collections.
- Slicing by config-controlled limits without risking index errors.

Good stream-shaped repo examples:

```java
Map<String, Set<String>> prefixesByCountry = zipcodes.stream()
    .map(zipcode -> coverageKey(zipcode))
    .filter(StringUtils::isNotBlank)
    .map(coverageKey -> coverageKey.split("\\|", 2))
    .filter(parts -> parts.length == 2
        && StringUtils.isNotBlank(parts[0])
        && StringUtils.isNotBlank(parts[1]))
    .collect(Collectors.groupingBy(
        parts -> parts[0],
        Collectors.mapping(parts -> parts[1], Collectors.toCollection(LinkedHashSet::new))
    ));
```

```java
Set<UrzaRetailerUpcIds> distinctUrzaDatas = Streams.flattenValues(
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

```java
Map<Long, List<Long>> vendorIdToUPCIds = idToUPCs.entrySet().stream()
    .map(e -> new Tuple2<>(e.getValue().vendorId, e.getKey()))
    .collect(Streams.groupTuple2());
```

```java
return ingredients.stream()
    .map(ingredient -> {
        Set<String> igWordSet = TextUtil.normalizedWordSet(ingredient);
        String igLongWord = igWordSet.stream().collect(Collectors.joining(""));
        return new Tuple2<>(ingredient, stdWordSets.stream()
            .filter(stdWordset -> igWordSet.containsAll(stdWordset)
                || stdWordset.stream().allMatch(word -> igLongWord.contains(word)))
            .collect(Collectors.toList()));
    })
    .collect(Streams.mapTuple2());
```

```java
String itemIdsStr = upcsToCheck.stream()
    .map(item -> String.valueOf(item.id))
    .collect(Collectors.joining(","));
```

```java
var maximum = Math.max(Math.min(max, candidates.size()), 0);
return candidates.stream()
    .limit(maximum).toList();
```

Common stream repairs:

- Replace accumulation loops with `Collectors.groupingBy`, `mapping`, `toSet`, `toList`, `toMap`, or repo helpers like `Streams.groupTuple2`, `Streams.mapTuple2`, `Streams.groupByUnique`, and `Streams.fairBatch`.
- Filter nulls explicitly with `.filter(Objects::nonNull)` before dereferencing.
- Collect to a named map/set once, then use the named collection. Do not keep repeating the same stream expression at each call site.
- Use named records/classes such as `URZALocation` or `URZALocationUPC` when tuple positions carry domain meaning beyond a single local pipeline.
- Use `Collectors.joining()` instead of hand-built comma strings. It avoids trailing separators and uses `StringBuilder` internally.
- Prefer `.stream().limit(n).toList()` over indexing/subList when `n` comes from config or test data.
- Use `Streams.groupByUnique` when the code is building a map and duplicate keys should be impossible.
- Use `Stream.ofNullable(data)` when the intent is "zero or one stream element." `Optional.stream()` can be less obvious in review contexts.
- If the result is not used as a stream, prefer `Optional.ofNullable(data).ifPresent(...)` over forcing a stream pipeline.
- Use `flatMap` only when flattening a stream of container-ish things. Do not use it for a per-string operation that belongs in `map`/`filter`.
- When external requests are part of a candidate search, make laziness obvious. A stream ending in `findFirst()` or a short loop with `break` can avoid extra HTTP calls.
  Collecting all responses before picking one defeats the point.
- Vary the smallest meaningful input. If alternatives are search terms, stream over search terms, not over mutable Jurl/JurlProxyFallback instances.
- Know the mutability contract. Java `stream().toList()` returns an unmodifiable list; use `collect(Streams.toList())` or another mutable collector when later mutation is expected.
- Make stream consumption explicit. A stream can be traversed once, and a pipeline without a terminal operation is only a description.
- Prefer the repo's bounded stream helpers, such as `Streams.parallelMap`, over `parallelStream()` when independent work really should run concurrently.
- Treat `parallelStream()` as a hot-path smell, not a convenience.
  In code that can run many times per request, resolver graph, availability recompute, startup load, or job batch, prefer sequential streams, batching, or an explicitly named executor.
- Use `Streams.parallelMap` only when the work is independent and the bound is intentional.
  It is closest to a drop-in replacement for simple `parallelStream().map(...)` shapes where the work is blocking/off-box and stream characteristics do not matter.
- When the desired behavior is "try inputs until one works," use a lazy stream with `findFirst()` or a loop with `break`.
  Do not parallelize candidate fetches unless the extra retailer/proxy cost is acceptable and measured.
- Do not justify streams as faster than loops. Treat them as an expressiveness choice: streams are often slower, so use whichever form makes the dataflow easiest to understand.
- Prefer `stream().findFirst()` when distinguishing an empty collection from a `null` first element matters.
  `getFirst()` or `iterator().next()` is fine when the collection contract already rules out empty/null ambiguity.
- In hot paths, count the passes. Mixing streams and `for-each`, sorting before a caller sorts again, or recomputing the same stream result can double or triple real work.

Do not use streams when they hide control flow:

- Imperative `ResultSet` scanning is often clearer as a loop.
- Side-effect-heavy save/update paths are often clearer as loops or extracted methods.
- Code that must handle interruption, retry, early return, or per-item exception classification may be clearer without a stream.
- Do not mutate the source collection inside a stream. Error Prone has `ModifySourceCollectionInStream` enabled.
- Do not introduce `parallelStream` casually. If the speedup is uncertain and pool behavior is hard to reason about, use sequential streams, batching, or an explicit named executor.
- Do not use `parallelStream()` to smuggle async work onto the common pool. It has caused warm-data congestion, resolver deadlocks, and thread-pool contention in this repo.
- Do not use `parallelStream()` in code called repeatedly from availability recomputes, UPC resolution, common production endpoints, or logic already running inside a named pool.
  The default fork-join pool has weak workload isolation and poor operational visibility.
- Do not keep a stream pipeline if profiling shows repeated map/collect work is the CPU or memory cost. A direct loop with a named collection can be the simpler optimized form.
- Be careful with timing-based stream/concurrency tests. If timing is the behavior, use tolerances rather than strict wall-clock comparisons.
- Do not use a stream terminal operation such as `toList()` or `collect(...)` if it will force every retailer HTTP request when the first valid match should stop the search.
- Do not sort candidates before returning them when the caller immediately applies its own ranking. In UPC resolution, redundant sorts can be meaningful load.

Pattern examples:

- Replace large distincting paths with stream grouping by a domain key such as `upc/retailer/zip/store/countryCode`, then sort candidates and pick the best representative.
- Prefer grouping single UPC lookups by `vendorId` to avoid one database round trip per UPC.
- The codebase added `URZALocation` and `URZALocationUPC` instead of passing around `Tuple3` and `Tuple4`.
- Prefer moving status tracking lower in a stream processing path so each `storeId` was counted once.
- Keep a stream when it makes future filters, maps, or explicit parallelism smaller and easier to review.
- Prefer `Collectors.joining(",")` over manual `StringBuilder` comma joining.
- Prefer `walmartStores.stream().limit(...).toList()` to avoid out-of-bounds behavior when config is too large.
- Remember that `flatMap` is for flattening container-shaped values, not for applying `StringUtils.isNotBlank` to strings.
- The stream preference is not "make every loop a stream." It is "make collection dataflow short, local, and explicit."
- For Sams Club-style resolver flows, keep the sequence lazy: search terms -> response -> item data -> UPC match -> first result. Collecting all search responses can create unnecessary requests.
- A for-loop with `break` is acceptable when it makes short-circuiting request behavior clearer than a stream.
- `Streams.parallelMap` exists so independent stream mapping can run with explicit bounded parallelism instead of plain `parallelStream()`.
- Treat `parallelStream()` in availability recomputes, UPC resolution, and common endpoints as something to avoid by default.
  Those paths already fan out and are called many times.
- In UPC-resolution local testing, trace deadlock risk to `parallelStream()` and the shared fork-join pool. Remove nested common-pool contention instead of raising VM pool sizes.
- Use `Streams.parallelMap` for simple parallel stream replacements when the stream mostly organizes off-box/blocking work.
  Do not treat it as a blanket reason to parallelize CPU-bound transforms.
- Use `Streams.load` and `Streams.loadMapped` for stream-to-bulk-ORM loading when a stream of IDs needs entities.
- Replace `parallelStream()` over `CompletableFuture.get(...)` with `Parallel.streamResults(...)` when results should be processed in completion order.
- Remove `parallelStream()` from nested warm-data, availability-loader, cache-loader, and resolver paths where common-pool contention can dominate the benefit.
- The codebase fixed a stream that was traversed more than once, and separately fixed a path where a stream needed a terminal operation so deduping actually happened.
- Stream S3 jurlcache responses into JSON parsing instead of copying into an intermediate string first.
- Prefer range fetches and chunked/streamed parsing when a huge JSON object only needs a subset of bytes.
  The analogous Java rule is: avoid full-body copies before parsing when bytes can stream into the parser or be parsed once.
- In frontend/worker fetch code, treat parse/stringify/parse and `response.clone()`-style body copying as hidden memory costs.
  A "stream" preference is about fewer copies and less work, not only about Java `Stream`.
- The codebase added and tested `Streams.fairBatch` so batch sizing logic would live in one helper instead of being open-coded in each caller.
- Remove excessive stream map/collect chains from hot UPCRetailerData fetching when they create avoidable CPU and memory pressure.
- Note in review that `stream().toList()` creates an immutable list; when a request builder mutates the list later, use a mutable helper or collector.
- In resolver code, point authors to existing no-`parallelStream()` patterns and make PR titles/descriptions explain why parallelism is safe when reintroduced.
- Prefer `.toList()` and `groupingBy` for ordinary collection reshaping, but keep loops when they preserve request short-circuiting or side-effect ordering.
- Streams are slower than for-loops in many cases; the right choice is the form that expresses the logic most clearly.
- Prefer `stream().findFirst()` over `iterator().next()` when empty vs null distinction might matter, but do not over-police this when the collection contract is clear.
- Combine several UPC iterations into one pass in hot retailer-list code rather than mixing stream and `for-each` shapes that scan the same collection repeatedly.
- Do not sort UPC-resolution candidates before returning results when downstream ranking sorts again and the extra work matters in a timeout-prone path.
- Prefer `stream.toList()` for immutable results and `stream.collect(Streams.toList())` for mutable results, making mutability part of the choice.

### Load And Fetch Deliberately

- Avoid loading whole entities or wide result sets when IDs, counts, or a few columns are enough.
- For large Java loads, prefer batching, streaming, `loadStreamed`, limited projections, and existing ORM/JDBC helpers.
- Preserve important constraints such as `vendorId`, `retailerId`, `storeId`, `zip`, country code, `isInstacart`, store-vs-zone distinctions, active/live filters, and item availability dependency flags.
- Dedupe by the real domain key, not incidental object identity. Common keys include `retailerId/storeId`, `retailerId/zip/storeId/countryCode`, `upcId/retailerId`, URL/status identifiers, and `vendorId/upcId`.
- Combine lookups when that reduces round trips. Fetch once and reuse results.
- Do not make the same HTTP request twice to warm a cache or retrieve data you already have.
- Keep filtering at the layer with enough semantic information. Sometimes that means pushing a predicate into SQL; sometimes it means hydrating enough domain data before filtering.
- Filter early when a later step is pairwise or expensive. Accept small checks when they reduced millions of comparisons to tens of thousands.
- Prefer already-loaded data over reloading through ORM when the caller has the needed entities.
- Prefer the ORM/entity helper that populates the right cache fields over manually managing internal caches.
- Use the cheapest existing cache-aware method when the data is already expected to be cached locally.
- Change the query or load path causing the measured load. Do not "clean up" a different query that changes result semantics unless the PR is specifically about that behavior.
- For frontend/widgets, do not initialize expensive locators, API calls, or DOM tracking on every page render if the user may never open the feature. Lazy-load after click, modal open, or scroll/visibility when possible.
- After adding or changing a MySQL index, consider `ANALYZE TABLE` before trusting planner behavior.
- For date-ish backfills on huge tables, prefer indexed ID ranges plus the date predicate and explicit partition targeting where relevant.
- Tune batch/divisor settings based on where time is going: web-server iteration, MySQL loops, huge `IN` lists, or repeated ORM/entity fetches.
- Verify fetch behavior with the closest real tool: admin availability inspector, captured browser request, logs, test payload, or the exact endpoint. Do not infer a scraper fix only from the final status field.
- Avoid bypass fixes that only hide the broken path.
  If setting `secondaryId`, preloading a cache, or using a fallback suppresses one failing request, still decide whether the original `partNumber`, itemId, UPC, or locator fetch remains broken.
- If every caller is bending around a too-narrow API, change the API. A store importer that can return all stores should expose that shape instead of forcing one-store or one-zip loops at every call site.
- When direct SQL, scripts, or admin tools update data outside normal ORM write paths, reset or dirty every affected cache layer explicitly.
  Include vendor, retailer, URD, resolver, R2/S3, and frontend cache layers when they can each hold stale state.
- Keep cheap pruning before wide fetches. If a retailer, vendor, zip, country, or ingredient can be rejected before loading all stores or all candidates, do that first.
- Treat `loadAll` as a last-resort shape, not a forbidden word.
  A small vendor-specific or bounded data set can justify it; a broad production loader usually needs IDs, projections, streaming, batching, or a narrower interface.
- For Node/Worker fetches, optimize bytes and copies before adding parallel requests. Range requests, smaller payloads, and one parse can beat multi-fetch fanout.
- If the caller already loaded the entities, pass those entities forward rather than reloading by ID in the helper.
  If the helper must work before async saves finish, make the wait/no-wait contract explicit.
- Dirty or invalidate by ID/key when the entity body is not needed.
  For very large cache/index dirties, load IDs or distinct index keys directly instead of hydrating every entity.
- Prefer fixed-width `varchar` for bounded strings over `TEXT` in hot tables because off-row/text fetches have real Aurora CPU and latency costs.
- Keep "formatting" helpers from changing meaning. A function such as `Zipcode.format` should canonicalize presentation; validation, FSA expansion, or throwing belongs in a separate helper.
- Use exact parameter names for the behavior being controlled.
  A flag that chooses US vs Canadian/UK postal-code handling should say that directly, not use a correlated business term.

Pattern examples:

- Group before loading: prefer `upcIds.stream().collect(Collectors.groupingBy(this::vendorId))` and one bulk load per vendor over one URZA fetch per UPC.
- Add the domain predicate that prevents accidental wide loads: `vendorId = ?`, `retailerId = ?`, `isInstacart = 1`, `countryCode = ?`, `zip is null`, or an indexed ID range.
- Dedupe by the real lookup key, such as `retailerId + "/" + storeId + "/" + countryCode`, before expensive comparisons, geocoding, or string matching.
- Fetch only the shape needed by the caller: use IDs, projections, minimum-profile URDs, or `loadAllIds(...).stream().map(id -> load(...))` instead of hydrating every full entity.
- When cache dirtying only needs identity, dirty with `upcId`, `VendorStoreUPCId`, or the distinct index key rather than loading the entity body.
- Avoid duplicate HTTP work by keeping the first `LoggedJurl`, response POJO, or `CompletableFuture<Response>` and passing it forward.
- Prefer using the normal cache-aware path, such as `UPCRetailerData.fetchAndInitUPCs(...)` or `getOrCreateRetailerData(...)`, over manually patching transient cached fields.
- Treat read-only caches as read-only. A write-back path may need true URD objects even when a narrower cache is right for display or lookup.
- If an updater can return all stores from one upstream response, expose that shape directly with `getAllStores()` or an equivalent interface instead of forcing `getStoresForZip(zip)` loops.
- Replace hot `string.split(...)` shapes with existing helpers such as `TextUtil.splitByChar(...)` when regex allocation shows up in a hot path.
- Use map-shaped memory deliberately: a `Long2ObjectMap`, `Map<Tuple2<Long, Long>, Store>`, or `Map<Long, UPCRetailerData>` can be clearer and cheaper than repeated scans.

Repo snippets:

```java
toResolve.stream()
    .collect(Streams.loadMapped(UPC.class, urza -> urza.upcId))
    .forEach(UPCRetailerZipAvailability::setUpc);
```

```java
String searchFirst20Words = Arrays.stream(TextUtil.splitByChar(search, ' '))
    .limit(20)
    .collect(Collectors.joining(" "));
```

```java
List<Tuple2<Long, Long>> retailerIds = JDBCUtil.executeQueryToTuple(
    queryTemplate,
    Long.class, Long.class);
```

Review patterns:

- Push back on serial vendor load checks when one round trip can answer the question.
- Understand why every SQL `where` predicate exists.
- Avoid `TEXT` where fixed-length `varchar` is enough because off-row fetches can cost time and CPU.
- Do not pull `itemId` from diagnostic `sRetailerItemData` when `UPCRetailerData` is the normal source of truth.
- Do not prewarm a Jurl cache by making a request twice; keep the first result in a future map and reuse it.
- Prefer `orm.load(RetailPartner.class, id)` over `new Entity().load`, citing memory junk, misleading metrics, and small speed cost.
- Prefer `orm().load(UPC.class, upcIds)` instead of repeated single loads.
- Load `upcIds` once and take the first object rather than making two round trips.
- Use `UPCRetailerData.fetchAndInitUPCs` so normal methods like `getOrCreateRetailerData` and `getRetailerDataIfPresent` work, rather than manually managing cached URD internals.
- Prefer using `RetailPartner.forEnumNames(...).stream().map(PearEntity::getId)` when retailers are cheap and likely cache-resident, instead of maintaining new DB query code.
- Use `JDBCUtil.executeQueryToTuple` and `executeQueryAndReturnLongs` instead of manual `ResultSet` list building.
- Add explicit `zip is null` predicates where null zip is the intended domain case, so junk rows do not sneak in.
- For country-code query fixes, delete unnecessary parameterized predicates and change only the CPU-heavy query when result-shaping joins/groups need monitoring.
- For URZA backfills, use ID-range predicates, partition definitions, index-order reasoning, and batch-size/divisor tuning instead of unbounded date scans or huge `IN` lists.
- For product-locator outages, treat `/loaded` as probably necessary but badly named, and avoid extra calls or locator construction until the UI needs it.
- For Macy's-style fetch investigations, start with the minimal browser request, itemId APIs, zipcode endpoint behavior, bundle/deal ordering, and existing utilities before broad scraping.
- Treat `loadAll` as a memory risk. Prefer `loadAllIds(...).stream().map(id -> load(...))` when the full object set is too wide.
- Bounded, domain-specific "load all" shapes are acceptable when the alternative is complexity around a tiny set. The PR should prove the bound.
- Reject loading 162k objects merely to dirty cache entries; load IDs or use dirty helpers instead.
- Zip-to-store helpers should return all stores available from a single zip request instead of forcing callers to make one request per zip.
- Cache keys should omit auth-only CSRF tokens when they do not change response content, because that ties cacheability to token TTL.
- Tests for loading behavior should create vendors/data locally instead of assuming CI DB fixtures exist.
- Treat unexplained `id != 0` and similar predicates as suspicious until the PR proved their domain purpose.
- Direct-atc/page-load fixes should explain the bug and impact before changing fetch behavior that might already be inert.
- Add an "all stores" updater interface when many updaters can return all stores at once, instead of forcing the job framework to call `getStoresForZip` repeatedly.
- Treat `secondaryId` as a possible Chewy bypass for `partNumber` calls, but still fix the `partNumber` path for UPCs that will continue to hit it.
- Use the admin availability inspector and exact browser/API evidence before changing GTIN, EAN, itemId, or UPC source logic.
- Trace local/test/prod differences through code and logs, then reset caches on the vendor and retailer data actually changed outside the normal path.
- Prune retailers before loading every ingredient, and tune batch size when Aurora shows slow outliers despite fast average query times.
- Fetch the byte range that matters and parse less JSON rather than duplicating entire large payloads in memory.
- For geocoding, use cached `geocodePostalCodeAWS` when a cached postal-code answer is already enough for the code path.
- Dirty large `VendorStoreUPCId` sets by ID and distinct vendor index key rather than loading every entity into memory.
- Pass just-fetched `Store` objects into the next step instead of reloading them, or wait for async saves before depending on them.
- Do not fetch new vendor-store data in `StoreLocatorApp` when the endpoint already loaded the needed stores into existing futures.
- Use already-loaded `UPCRetailerData` or normal `getOrCreateRetailerData(...)` sources instead of diagnostic `sRetailerItemData`, which can be stale or absent.
- Use `getUPCObj()` and `getRetailer()` rather than transient cached fields directly because earlier getter calls may be what populate those fields safely.
- Keep Zipcode `format` as canonicalization, not validation: null zip can be valid input, semantic expansion should live in a new helper, and broad throwing should be gated or tested separately.

### Async Work And Executors

Async work should make concurrency explicit: what pool owns it, what bounds it, what backpressure exists, how errors propagate, and whether the caller waits.

Hard rules:

- Never rely on implicit `ForkJoinPool.commonPool()` for `CompletableFuture`. Pear has a custom `CompletableFutureMissingExecutor` Error Prone check.
- Pass an explicit executor to `supplyAsync`, `runAsync`, and equivalent async helpers.
- Prefer repo-managed bounded executors and services over ad hoc `new Thread`, unbounded pools, or static pool initialization.
- Use `saveAsync` or the repo's normal async save queue instead of manually submitting ORM saves to a pool.
- Handle interruption correctly. Error Prone has `Interruption` enabled.
- Do not swallow async exceptions. Log the exception object and propagate or classify the result intentionally.
- Prefer `CompletableFuture` helpers for basic async composition over custom blocking queues or hand-managed cross-thread data structures.
- Use `PearBatchingAsyncWorkerPool` or the repo's batching worker patterns when the workload should be aggregated instead of sprayed into many tiny parallel operations.
- Do not parallelize many small inserts/updates into the same hot table just because async is available; batch or queue them when Aurora/storage behavior makes tiny concurrent writes slower.
- Do not assume SNS, SQS, Lambda, or "pulling off a queue" automatically means rate-limited or backpressured.
  Find the consumer concurrency, visibility timeout, retry policy, delete-on-timeout semantics, and downstream API limit.
- Choose concurrency from data with a cushion. If a stress test shows 100 concurrent calls are fine, a rollout value like 50 may be reasonable; if there is no data, treat the risk as speculative and instrument first.
- Keep execution ownership at the caller when extracting helpers.
  Prefer a synchronous/testable helper such as `fetchThing(...)`; the caller can wrap it in `CompletableFuture.supplyAsync(..., pool)` when background execution is appropriate.
- Use `PearThreadPoolExecutor` for straightforward bounded parallel work.
  Do not use `PearBatchingAsyncWorkerPool` when there is no batching; it adds queueing and coordination without giving the caller useful future composition.
- For one request's bounded parallel work, a try-with-resources `PearThreadPoolExecutor` can be clearer than a shared static endpoint pool.
  Static endpoint pools smaller than the Tomcat request pool can turn unrelated requests into each other's bottleneck.
- Build the list of tasks and submit them to one named pool. Do not create and shut down an unbounded number of pools inside loops.
- Size pools top-down in incidents. Look first at Tomcat/request pools, then shared service pools such as URZA loaders, then leaf pools. A small leaf pool change can hide the real request-path pressure.
- Remember that threads use non-heap memory and often hold large work objects.
  A pool problem may be stack/thread-local overhead, queued work, response bodies, ORM rows, or parser state rather than the `Thread` object itself.
- Make the synchronization point part of the API contract. If returning an async stream/future changes what the caller can safely assume is already saved or built, treat that as a behavior change.
- Treat thread pools as dependencies. Inject `Pools` or the specific executor where possible; use global access only as a legacy fallback.
- When analyzing async incidents, separate root cause from saturation symptoms. Thread-pool timeouts, request-pool growth, and blocked auth-token locks are often effects that need metrics and stack traces.
- Preserve domain failures inside async result objects when that is how callers report status. Do not call `.get()` on a `Try` or future just to throw away result-level error context.
- Use `CompletableFuture.completedFuture(...)` when the method needs a future-shaped result but has no slow or blocking work.
- Prefer `thenComposeAsync(..., pool)` or `thenApplyAsync(..., pool)` when the continuation must run on a specific executor.
  Plain `thenCompose` often runs on the completing thread and can make a named pool variable unused.
- Prefer `get`/repo helpers that expose checked exceptions when you need to classify or log failures.
  `join` can hide exception handling and make partial-result handling easier to miss.
- Avoid `synchronized` in new async/hot code when a repo locking helper, Caffeine, `ConcurrentHashMap.newKeySet`, `ConcurrentLinkedDequeList`, or a write-once composite structure matches the semantics.

Good async-shaped examples:

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

```java
batchAvailabilities.forEach(BatchAvailability::saveAsync);
```

Async review checklist:

- Is the executor explicit?
- Is the pool bounded and named for the workload?
- Is the work CPU-bound, IO-bound, startup work, ORM save work, scrape work, or user request work? Use the pool that matches.
- Does the caller need results now, later, or never?
- Does the code use `submitAndBlockWhileQueued` only when waiting for all queued work is truly desired?
- Are exceptions converted into domain results, logged with stack traces, or rethrown?
- Is the future removed from any tracking map after use?
- Does the code avoid class-load-time static executor initialization that forces Spring/resources during unit tests?
- If a method returns `CompletableFuture`, is the actual slow or throwing work inside the `supplyAsync`/future body?
- If a loop polls a queue, does it keep the poll thread alive on ordinary runtime exceptions while letting interruption stop the loop?
- If message processing is asynchronous, is failure handled with `whenComplete` or equivalent completion handling rather than `onFailure` around only the submission step?
- If async work immediately blocks, would it be simpler to block on the real IO directly instead of submitting to a background thread and blocking on that thread?

Pattern examples:

- Every `CompletableFuture.supplyAsync(...)`, `runAsync(...)`, or async continuation should name its executor: `CompletableFuture.supplyAsync(() -> fetch(input), pools.getLowPriBackgroundPlatformExecutor())`.
- Avoid static pool initialization. Prefer injected `Pools`, a method parameter `Executor`, or `try (var pool = new PearThreadPoolExecutor(parallelism, "clear-workload-name"))`.
- Treat `parallelStream()` as hidden async work on the common pool. Replace it with `Streams.parallelMap(items, this::fetch, parallelism)` or `Parallel.submitAllCF(tasks, executor)` when concurrency is intentional.
- Use `Parallel.streamResults(futures)` when completion order matters more than input order.
- Use `saveAsync` or the normal async save queue for entity saves instead of creating an ad hoc save pool.
- Keep the slow work inside the future: `supplyAsync(() -> scrapeAndParse(term), executor)`, not `supplyAsync(() -> alreadyParsedValue, executor)` after the throwing scrape already ran.
- Pair async work with visible failure handling: `future.whenComplete((result, ex) -> recordStageResult(stage, result, ex))`.
- Distinguish batching from parallelism. `PearBatchingAsyncWorkerPool` fits many small writes; `PearThreadPoolExecutor` fits bounded callables and future composition.
- Do not use current-thread fallback when spawned work can wait on work it just enqueued; that can deadlock under pressure.
- If read and write workloads have different saturation behavior, give them separate named pools and separate metrics.
- Keep queue limits and rollout controls explicit with settings such as `expectedFull`, app config concurrency, or batch-size thresholds.
- Submit fewer tasks when queued work dominates memory. Batch first, then parallelize the bounded units that remain.
- Preserve the caller's wait contract. A method returning a future must make clear whether it means "queued," "built," "saved," "acknowledged," or "fully processed."

Repo snippets:

```java
ret = searchResponse.product_details.stream()
    .map(p -> CompletableFuture.supplyAsync(
        () -> new Tuple2<>(p, isThirdParty(!StringUtils.isBlank(p.url)
            ? p.url
            : STR."https://www.target.com/p/A-\{p.tcin}")),
        pool))
    .collect(Streams.awaitAll()).stream()
    .filter(t -> !t._2)
    .map(t -> t._1)
    .toList();
```

```java
var asyncBAOS = CompletableFuture.supplyAsync(
    () -> lzCompressByteArrayOutputStream(originalBAOS),
    lzCompressPool().hasVacancy()
        ? lzCompressPool()
        : MoreExecutors.directExecutor());
```

Review patterns:

- Prefer `saveAsync` instead of manually submitting saves to a pool.
- Note that `submitAndBlockWhileQueued` blocks until all zips are fetched; use plain `submit` for background work.
- Prefer keeping a `Map<K, CompletableFuture<V>>`, fetching once in the background, reusing the result, and removing the future from the map.
- Treat duplicate HTTP requests as slower, harder on retailer servers, and worse for socket/memory pressure.
- Accept app config for async/concurrency rollout and pool sizing when production safety needed a switch.
- Prefer `PearThreadPoolExecutor` so async work has telemetry.
- Prefer one larger processing pool plus `whenComplete` instead of nested one-off futures and multiple smaller pools when the caller can know `processMessage` is async.
- Remember that wrapping only the pool submission in failure handling does not catch errors from the actual processing work.
- Put the actual scraping/fetching work into `supplyAsync`; putting only a fast parser into the future still lets `ingestRecipe` throw before returning its future.
- Frame Java thread pools as the standard model here; true non-blocking async would be a large migration across libraries and code.
- Prefer using SQS `WaitTimeSeconds` instead of sleeping a scheduled executor thread.
- Event loops should catch/log unexpected runtime exceptions without swallowing interruption.
- Be careful that shelling out repeatedly from Jurl could OOM Docker because the JVM already owns memory; use a bounded pool or fix JVM args instead.
- Prefer `CompletableFuture` helper methods over custom blocking queues because manual data passing across execution contexts creates a larger bug surface and composes poorly.
- Treat batching as a separate need from parallelism: many small parallel DB inserts can punish the storage layer.
- Make the caller know whether it is waiting for BatchAvailabilities to be built, URZAs to be saved, or both.
- Add checkpoints and graphs around each IAAS/BatchAvailability stage before changing orchestration.
- In thread-pool timeout investigations, look for request-pool saturation and lock contention instead of treating every timeout as the first cause.
- Align SQS visibility timeout with availability timeout and preserve delete-on-timeout semantics deliberately.
- Watch cost as part of the rollout for SQS/SNS fanout.
- Prefer Kryo/base64 or another explicit serialization story if JSON payloads become too large for async transport.
- Keep per-instance pool configuration separate when different pool instances have different capacity and safety requirements.
- Add low-priority platform executors and StatsD start/success/end metrics around expensive background work.
- Prefer `PearThreadPoolExecutor(parallelism, "name")` plus futures for parallel work so the pool is trackable and bounded.
- Wait for async saves with `Streams.awaitAll` when returned behavior depends on saved rows being visible.
- Prefer `Parallel.allOf` and partial-result handling instead of joining twice and losing successes when one async branch fails.
- Push back on creating and shutting down unbounded thread pools; submit known tasks to one trackable pool instead.
- Prefer vanilla `CompletableFuture` composition plus instrumented custom `ThreadPoolExecutor` instances because the team can see pool state, queueing, and backpressure in Datadog.
- Separate batching from parallelism. Inserting many tiny batches concurrently into the same Aurora table can be slower and more dangerous than aggregating work first.
- For partner UPC async paths, verify whether the SQS consumer actually rate-limits before accepting "it goes through SQS" as the safety story.
- For async rollouts, prefer measured stress-test capacity with a lower production limit instead of guessing that a queue or lambda path will protect the external API.
- When multi-store batch availability processing returns an async stream, make the caller's wait contract explicit: BatchAvailability objects built, URZAs saved, or all downstream work visible.
- In thread-pool timeout investigations, look for request-pool task jumps, slow geolocation calls, auth-token locks, and which named pool saturated before changing pool sizes.
- In memory investigations, treat pool size as one layer of a larger object-lifetime issue: queued work, response bodies, parsed JSON, ORM rows, and caches can dominate the thread overhead.
- Prefer `try (var pool = new PearThreadPoolExecutor(parallelism, "my-special-purpose-pool"))` plus `Parallel.getAll`, `Parallel.allOf`, or `CompletableFuture.supplyAsync`.
- Do not extract methods that themselves return `CompletableFuture` when the method's real job is fetching/loading data.
  Extract the work, then create the future at the caller so execution source and testability stay local.
- Reject `PearBatchingAsyncWorkerPool` for latency-dependent work with no batching; a simple `PearThreadPoolExecutor` allowed callables, future composition, and less hidden queueing.
- Be careful that a static endpoint pool with fewer threads than Tomcat can effectively cap unrelated concurrent requests and create cascading request blocking.
- Distinguish `submitAndBlockWhileQueued` from `submit`: the former waits for queued work and exposes capacity pressure as response latency; the latter is for real background work.
- Replace `join`-hidden failures with explicit logging/classification when parallel store or resolver requests can partially fail.
- Use `CompletableFuture.completedFuture(...)` instead of spawning a background task when the result was already computed locally.
- Call out `thenCompose` chains where the named pool was never used; use the async continuation variants when the continuation belongs on a specific pool.
- Prefer non-blocking concurrent structures over `synchronized` for high-concurrency paths, partly because synchronization interacts poorly with virtual-thread goals and can hide deadlocks.

### Keep Services Injectable

- Prefer Spring-managed services with constructor/field injection over static globals, manual wiring, or `new` for collaborators.
- Move behavior out of entities when it needs ORM, metrics, app config, caches, logging, external clients, or cross-entity coordination.
- Avoid new uses of `ManualSpringAutowired`, `Resources.global()`, and static dependency fields when the dependency can reasonably be injected.
- In tests, prefer the repo's Spring test base and autowire services instead of manually instantiating service classes.
- Controllers and base classes may already expose dependencies such as `orm`; use the existing injected dependency there instead of creating a parallel loader.
- Lifecycle behavior that must fire for `save`, `saveAsync`, `batchSave`, `orm.save`, and `orm.saveAsync` belongs in the save/update abstraction, not in an entity path that only catches explicit direct saves.
- Prefer direct `@Autowired` dependencies over temporary bridge/provider helpers when a class is already becoming Spring-managed.
- Be explicit with Spring constructors in the mixed legacy/Spring codebase when it helps readers know not to call the constructor manually.
- Avoid mixing manual injection and Spring injection in tests unless there is a clear reason.
- When a class is a singleton service, do not add static mutable state where instance state is enough.
- Do not assume jobs, recomputers, or legacy entry points cannot use Spring dependencies. Fix the scheduler/creator/caller to obtain the Spring bean when that is the real boundary.
- In scripts, JSPs, or one-off legacy paths, `ManagedResourcesConfig.createInstance(...)` can bridge from `new` to Spring-managed construction.
  Treat it as a transition aid, not a preferred committed pattern for ordinary code.
- Do not introduce new static globals. If an old static bridge must remain, wire the new dependency once and keep the real implementation injectable.
- When converting utilities to beans, watch for ambiguous bean lookup by type and add qualifiers or explicit wiring rather than relying on whichever bean Spring finds first.
- In tests, do not reset or override `Resources.global()` broadly when a Spring test base is providing valid resources for other tests.
- In tests for updater/controller/service code, extend the base test that initializes the dependencies the code conceptually owns.
  Use a truly isolated base only when the class is isolated in principle, not just because it happens not to touch Spring today.
- Keep app-level schema or datasource quirks out of lower-level utilities.
  If Snowflake/admin/JDBC oddities belong to an app workflow, put the adaptation at that workflow layer until a real DAO/service owns it.
- Keep abstractions narrower when the boundary is still blurry.
  A retailer-specific implementation can be easier to maintain than a premature hierarchy that splits state across superclasses and config JSON.

Pattern examples:

- Convert static utility-with-state classes into Spring services when they own ORM, cache, config, HTTP clients, or async collaborators.
- Prefer `@Service` on updaters, resolvers, orchestrators, recipe ingestors, and price/list helpers when callers need injected dependencies.
- Move `Resources.foo()` and `ManualSpringAutowired`-style access behind constructor injection like the `PulseOrchestrator` and `PulseReportGenerationJob` patterns below.
- Replace manual construction such as `new ChewyBaseItemIdResolver(...)` with an injected bean in production code and `@Autowired`/`@MockBean` in tests.
- Keep entities mostly about entity state. Put fetch, dedupe, cache, save, and event-publishing behavior in services that can be tested with Spring wiring.
- For Quartz/JSP-triggered jobs, fetch the Spring-managed job bean or trigger Quartz rather than constructing a POJO that misses autowired dependencies.
- Tests should extend `BasePearApiTest` or the relevant Spring base when the class conceptually depends on app resources, even if the current method happens to pass without them.
- If the abstraction boundary is still unclear, keep the first service narrow and retailer-specific rather than hiding unrelated scheduling, state maintenance, and fetch concerns in one superclass.

Repo snippets:

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

```java
@Test
void testResolveItemIdInfo(@Autowired ChewyBaseItemIdResolver resolver) {
    var itemFound = resolver._resolveItemIdInfo(
        retailPartner, upc, Goal.FIND_ITEM_ID, null, null);
    assertNotNull(itemFound);
}
```

Review patterns:

- Pull behavior out of an entity into a service that owns ORM/cache/dedupe/save behavior.
- Extend the Spring base and autowire `ChewyBaseItemIdResolver` in tests rather than `new`ing it.
- Inject recipe lookup dependencies in tests.
- Prefer a service-owned bounded Caffeine cache over entity-owned persistence logic.
- Prefer small overridable methods in an existing superclass over a larger strategy object when the variation was only two statuses.
- Move catalog generation logic out of an entity, or pass Spring dependencies into the entity method from Spring-managed callers.
- Use `@MockBean` and autowire the real service in tests after a module has been Springified.
- Replace temporary `SpringApplicationEventPublisherProvider.getApplicationEventPublisher()` usage with an injected `ApplicationEventPublisher`.
- Note that an explicit Spring constructor can signal ownership and consistency while the codebase is still mixed.
- The codebase fixed a Quartz path where `getSchedule()` needed autowired dependencies even outside actual job execution, so job beans had to be fetched from Spring rather than instantiated as POJOs.
- URZA recomputer subclasses can be `@Service`; old `new YourRecomputer()` callers should move to Spring bean creation.
- Tests for updater code should extend `BasePearApiTest` when the class sits in a Spring/autowired updater hierarchy, even if the specific method currently gets lucky without dependencies.
- Prefer that JDBC utilities should not learn datasource-specific schema quirks; those are app/workflow concerns unless a dedicated DAO/service is introduced.
- In cart-scraper abstractions, keep behavior scoped to Amazon until the real hierarchy boundaries are clear.
  Keep scheduling concerns and retailer-state maintenance concerns separated instead of hiding them in one generic superclass.
- Prefer `ManagedResourcesConfig.createInstance(ChewyAvailabilityUpdaterJob.class)` for a JSP-triggered job path, or injecting Quartz and triggering the real job.
- Treat `BasePearApiTest` as the source of Spring resources/autowiring in tests, and avoid global resource resets that can pollute later tests.

### Keep Methods Shallow And Terse

- Use guard clauses to keep nesting low.
- Extract helpers when a method combines fetching, classification, persistence, logging, and response shaping.
- Prefer narrow hooks over broad strategy rewrites when the variation is tiny.
- Remove stale fields, dead assignments, and comments that describe old behavior after changing a path.
- Be terse, not cryptic. Local variables can be short when obvious; domain names should say what they mean.
- Avoid giant "correction after the old path" logic. If an app config chooses old or new behavior, choose one path before doing the work.
- Do the same null/empty validation once at the boundary instead of repeating it inside helpers.
- Pass concrete values when the caller already knows them; do not introduce a mapping function or deferred evaluation just to look generic.
- Use final/template methods when a superclass must preserve validation and exception handling invariants for subclasses.
- Keep comments when they preserve an informal contract that future maintainers could otherwise break.
- Remove comments or helpers that are only explaining an implementation that no longer exists.
- Choose method boundaries that match the real concepts. For a search flow, `runSearch(term)` or `fetchItems(term)` is easier to reason about.
- Avoid helpers that combine Jurl construction, cache validation, UPC matching, and status classification when those are separate concepts.
- Split validation levels when they answer different questions. "Was this HTTP/search response valid and cacheable?" is not the same as "did it contain the requested UPC?"

Pattern examples:

- Prefer two protected hooks, `inStoreStatus()` and `shipToHomeStatus()`, instead of duplicated code or a larger strategy abstraction.
- Remove stale setting of unused fields when they confuse the current contract.
- A response with `null` `choices` should throw, while empty choices can return empty JSON. That keeps impossible states loud and expected empty states ordinary.
- Simplify parser logic to "field is entirely numeric and equals UPC" rather than inspecting too many surrounding fields.
- Pear Commerce often prefers a small, direct helper with a precise name over a clever generalization.
- Prefer passing strings directly rather than a mapping function when the module already knew the types and did not need deferred evaluation.
- Use a final superclass method that calls subclass hooks when it preserves validation and exception handling.
- Keep comments that explain exceptional contracts, such as one URL builder needing a completed scan when most availability updater URLs are built from `UPCRetailerData` only.
- Compute a typed `List<Long>` from app config inside the helper rather than leaking malformed string vendor IDs to callers.
- Keep search helper boundaries clean: the request object should represent one logical JurlProxyFallback request, and UPC matching should live one layer above.

### Null, Empty, Zero, And Optional

- Treat `null`, empty string/list, and zero as different states until product or data semantics prove otherwise.
- Cache misses explicitly with `Optional` when avoiding repeated misses matters.
- Throw or classify impossible missing fields. Do not turn corrupted upstream responses into ordinary empty results.
- Filter `null`s out of lists before grouping/sorting where null is not meaningful.
- Keep user-facing/dashboard semantics in mind. A `0` count and an absent count may mean different things.
- Use `null` deliberately when it is the sentinel the caller expects, such as "not implemented" or "no optional response," and then make callers check it.
- Prefer `Optional.ofNullable(...).map(...).orElse(null)` for narrow null-safe extraction over catching `NullPointerException`.
- Do not hide nested `Optional` values from domain hooks; unwrap them at the lifecycle boundary.
- Ask whether a boxed primitive is genuinely nullable. If not, use the primitive or a domain object.
- Preserve legacy null semantics when they are real. Older store updaters may not set fields such as country code; validate them when present without making null mean failure everywhere.
- A null response body or null data field may be invalid/unknown even when an empty list is ordinary no-data. Keep that distinction before caching or classifying.
- Preserve `null` when it is the single API representation of missing data.
  Do not substitute `$0.00`, empty string, or empty list if that would force downstream clients to handle two missing-value shapes.
- Use `@NonNull` or equivalent static-analysis proof when removing defensive null checks because an IDE proved a callsite safe.
  Without the annotation, the next refactor can remove the hidden precondition.

Pattern examples:

- Question `null` vs `0` semantics for dashboard/product fields.
- Use `Optional` to memoize `/v1/loaded` and avoid null pointers plus repeated recomputes.
- The codebase fixed `availableUpcIds` null-vs-empty semantics separately from availability status.
- Check `searchResponse.data` before accepting/caching a search Jurl.
- Throw on `resp == null` or `resp.choices == null`, with empty choices handled separately.
- Return `null` from a country-code hook when implemented vs not-implemented must stay distinguishable.
- Add `null`/empty checks before `getFirst` in migrations that may run on empty local DBs.
- Prefer null-safe extraction with `Optional.ofNullable(...).map(...).orElse(null)` instead of catching NPEs.
- Ask whether `Long` is used because null is expected.
- Pass unwrapped old/new values to lifecycle hooks rather than `Optional` wrappers.
- Let country-code store paths accept null country code for legacy updaters while still validating stores that do provide it.
- Leave missing retailer-list price as `null` rather than converting it to `$0.00`, because consumers should not need two missing-price conventions.
- Keep `@NonNull` when static analysis was used to justify deleting null checks.
- Treat `Zipcode.format(null)` as a valid input path because many endpoints use null zip intentionally.

Repo snippets:

```java
availability.setInStoreStatus(
    Optional.ofNullable(rs.inStoreOrNull()).orElse(Status.UNKNOWN)
);
```

```java
String s1SellerType = rainforestApiResponse.stream()
    .filter(p -> p.product.asin.equals(s1.itemId))
    .flatMap(p -> Stream.ofNullable(p.product.buybox_winner))
    .flatMap(b -> Stream.ofNullable(b.fulfillment))
    .flatMap(f -> Stream.ofNullable(f.type))
    .findFirst()
    .orElse("3p");
```

### Status And Availability Semantics

When editing availability updaters, batch updaters, retailer-list, URZA loaders, Pulse code, or partner UPC APIs:

- `INVALID` means bad input/data or a known UPC resolution, store, zip, itemId, GTIN, or configuration problem where a scan should not be trusted or should not happen.
- `UNKNOWN` means a scan was attempted but failed, errored, timed out, or produced an ambiguous response.
- `UNAVAILABLE` means a valid scan found the product/store unavailable or not found.
- Return `BatchAvailability` results for invalid/failure cases so metrics and error tables do not report misleading "missing result" errors.
- Isolate failures per UPC/store/brand where possible so one bad item does not mask the rest of the batch.
- Add explicit messages to invalidation results when useful, such as bad store, blank itemId, invalid zip, or bad UPC.
- Separate scrape/read paths from write/update paths when that makes status flow easier to reason about.
- Be careful before sending `INVALID` into downstream update streams. Sometimes `INVALID` means our updater/configuration is broken rather than a partner-visible availability state.
- Keep `FAILED` semantics scoped. A failed UPC lookup, a no-itemId lookup, and an exception escaping an async process may need different status and telemetry.
- Avoid manually setting status fields that a state machine or telemetry path normally derives unless you also repair the observability consequences.

Pattern examples:

- The codebase added `UNKNOWN` for unexpected Pulse updater results.
- The codebase fixed `INVALID`/`UNKNOWN`/`UNAVAILABLE` handling and propagated errors on Petco.
- Keep Instacart and Instacart fallback consistent on invalid vs unavailable.
- The codebase added an app config flag for using `INVALID` instead of `UNKNOWN` when the result is known non-transient.
- Mark bad ASINs, invalid UPCs, blank/invalid itemIds, and missing offer IDs as `INVALID` rather than skipping them.
- Subclasses should return invalid `BatchAvailability` objects rather than silently omit UPCs and trip "missing batch availability" metrics.
- Use `RecomputeResult.unhandledException(ex)` for failures that should become `UNKNOWN` and tracked, and invalidation helpers for expected bad-data cases.
- Treat `inventoryResponse.data == null` or `storeProducts == null` as likely `UNKNOWN`, while an empty `storeProducts` list or no matching `itemId` could be `UNAVAILABLE`.
- Null/empty scrape results should become `INVALID` when the URD itemId is bad, but `UNKNOWN` when the scrape itself may have failed.
- Feed fetch failure should be an error case, not `UNAVAILABLE`, `AVAILABLE`, or `INVALID`.
- Interruption should fail the whole batch rather than being converted into one item result.
- DWH update consumers probably should not receive `INVALID` rows when invalid means our system could not perform a meaningful scan.
- Distinguish UPC resolution errors from UPC resolutions that simply found no itemIds, and avoid manual known-root/status manipulation that can break telemetry.

Repo snippets:

```java
if (StringUtils.isBlank(itemId) || itemId.equalsIgnoreCase(instacartItemId)) {
    return new Availability(itemId, Status.INVALID, Status.INVALID, null);
}

Doc doc = docLookup.get(itemId.toLowerCase());
if (doc == null) {
    return new Availability(itemId, Status.UNKNOWN, Status.UNKNOWN, null);
}
```

```java
Status inStoreStatus = "AVAILABLE".equals(avail.availability)
    ? Status.AVAILABLE
    : Status.UNAVAILABLE;
Status shipToHomeStatus = avail.shippingDetails != null
    && !"3+ day shipping".equals(avail.shippingDetails)
        ? Status.AVAILABLE
        : Status.UNAVAILABLE;
batchAvailability.result = RecomputeResult.statuses(inStoreStatus, shipToHomeStatus);
```

### HTTP, Jurl, And External Responses

- Keep caller-specific Jurl behavior visible on the Jurl instance when that is what the caller needs. Avoid hiding it in broad domain config unless the behavior is truly domain-wide.
- A `Supplier<LoggedJurl>` usually means a new Jurl instance is needed for each proxy/request attempt. Do not reuse one mutable Jurl object across proxy attempts.
- Put validation that determines cacheability inside `goThen` so bad transient responses are not written to jurlcache.
- Use `throwOnNon200(true)` when a non-200 response means the fetch failed and should not be cached as an ordinary no-data response.
- Return `Optional.empty()` only for cacheable "there is no recipe/data here" outcomes, not for transient fetch failures.
- Throw `JurlException` when HTTP request details will help future Sentry/Scalyr debugging.
- Prefer structured API data such as ld+json/schema.org over CSS selectors when available.
- Use `@JsonIgnoreProperties(ignoreUnknown = true)` on external response POJOs when upstream fields may be omitted or added.
- Treat `JurlProxyFallback` as one logical request with proxy retry/chaining inside it. Alternatives such as search terms should be represented as alternative request inputs, not as a list of fallback objects to iterate.
- Separate cacheability validation from domain matching. A search response can be valid and cacheable even when it does not contain the requested UPC.
- If a valid no-match response should prevent repeated requests, cache the valid response and return no match at the domain layer.
- "Synthesized" Jurl logs usually mean S3/jurlcache hits. If errors are missing from Scalyr/Sentry, debug the error telemetry path instead of assuming the request never happened.
- Preserve the retry contract of `goThen`.
  Returning `null` usually means "try another proxy/request"; throwing means failure; returning an empty domain value means a cacheable answer only when that is truly what happened.
- Do not blindly move parsing out of `goThen` to satisfy a readability concern.
  The parser may be intentionally inside the request path so invalid responses avoid cache writes, retries happen, or the returned object is smaller than a full body/DOM.
- If a failure is persistent for the request parameters, do not retry it through every proxy.
  If it is transient or proxy-specific, keep it in failure/retry territory.
  If one item in a batch is invalid, do not fail the whole batch unless the upstream shape makes the entire response untrustworthy.
- For high-fanout HTTP work, parse to the smallest useful object in the request path. Holding the entire response string or Jsoup DOM for thousands of parallel requests can be the real memory problem.
- JurlCache error rates need dimensions: domain, proxy type, request type, cache-hit vs live request, fallback stage, status, timeout, and whether cheaper proxies are expected to fail before expensive ones succeed.
- If the caller does not need `LoggedJurl`, return the typed response from `goBody(...)`, `goBody(Class)`, or `JSON.get().parseObject(lj.getResponseBytes(), Class)`.
  This keeps the pattern shorter and avoids response-body string copies.
- Prefer `bodyJson(requestPojo)` and typed request/response classes over hand-built JSON strings, generic maps, or raw strings when the shape is stable enough to model.
- For external DTOs, follow the local lightweight convention unless nearby code differs: `static` nested class, public fields, no getters/setters, and `@JsonIgnoreProperties(ignoreUnknown = true)`.
- Remember that `@JsonIgnoreProperties(ignoreUnknown = true)` prevents future upstream-field failures; it does not fix a current parse failure caused by a missing required field or wrong shape.
- Cache legitimate no-result pages such as 404/no-PDP responses when repeated retries would be wasteful.
  Use `Optional.empty()` or an explicit sentinel only after deciding whether null means success or retry.
  In the current helper API, `goThen` treats `null` as retry/failure, so do not rely on null to mean cacheable no-result.
- Whitelist success cases when retries are high. A blanket retry on every non-200 can burn proxy attempts on persistent 205-499 responses that should not be retried or cached as success.
- Use `customJurlCacheKeySupplier` or `extraCacheKey` to express content identity without tying cache life to incidental auth tokens, CSRF tokens, or raw request details.

Repo snippets:

```java
return JurlProxyFallback.none(() -> authorizedRequest(relativePath, queryParams)
        .method(IJurl.GET))
    .useJurlCache(true, cacheMillis)
    .goThen(jurl -> JSON.get().parseTree(jurl.getResponseBody()))
    .get();
```

```java
TescoStoreLocationsResponse response = new JurlProxyFallback(
    JurlProxyFallback.ukStatic(),
    () -> new LoggedJurl()
        .url(TescoPlanHelper.TESCO_BASE_URL + "/StoreLocations")
        .method(Jurl.POST)
        .timeout(30_000)
        .body(requestBody)
        .throwOnNon200(false))
    .attempts(1)
    .useJurlCache(true, TimeUnit.DAYS.toMillis(30))
    .extraCacheKey(zipCode)
    .goThen(lj -> lj.getResponseJsonObject(TescoStoreLocationsResponse.class))
    .get();
```

```java
LoggedJurl jurl = new LoggedJurl()
    .bodyJson(dripBatchSubscriberUpdateBatches)
    .url("https://api.getdrip.com/v2/" + accountId + "/subscribers")
    .header("Authorization", "Bearer " + accessToken)
    .method(IJurl.POST)
    .throwOnNon200(true);
```

Pattern examples:

- Prefer WAF token behavior configured by callers on the Jurl instance, not hidden behind domain config.
- Be careful that moving response parsing out of `goThen` could allow invalid Scrapfly responses to be cached.
- Prefer `throwOnNon200(true)` and `Optional<Document>` for recipe pages to distinguish failed fetches from pages with no recipe.
- Throw `JurlException` when Sentry/Scalyr need request details.
- Question CSS selector scraping when the same recipe data was available in schema.org ld+json.
- Confirm that default jurlcache TTLs are intentional for new recipe ingestors.
- Note that JurlProxyFallback constructor patterns had stabilized and should be audited before broad refactors.
- Run one logical JurlProxyFallback per search term, validate the HTTP/search response inside the request path, and match UPCs after parsing.
- A valid search with no requested UPC should still be cacheable; otherwise the system will repeat expensive no-match searches.
- Prefer `goBody(Class)` or `JSON.get().parseObject(lj.getResponseBytes(), Class)` over extra string copies when response bytes can be parsed directly.
- JurlCache TTLs should match acceptable upstream freshness: zone lists may live for days, but inventory often belongs around hours, not months.
- Treat `null` from `goThen` as failure/retry territory unless the code used an explicit no-result value.
- Detect no-result after trying to find the target item, so hidden DOM text does not turn a valid result into a failed request.
- Include group, store, zip, itemId, or other fields in `extraCacheKey` when they affect response content.
- Do not include auth-only values such as CSRF tokens in cache keys when they do not affect response content.
- An endpoint that spends proxy credits should almost never be completely uncached; cache valid no-data separately from failed fetches.
- Use `retailer.getEcommerceUrlBase()` rather than hand-building retailer bases.
- Remember that `waitForActiveIdenticalRequests` can suppress duplicate in-flight requests on one server, but deduping input lists is still often the real fix.
- The codebase added and tuned JurlProxyFallback behavior for proxy ordering, circuit breakers, repeated static attempts, timeout handling, proxy attributes, and StatsD tags.
- The codebase fixed jurlcache keys and TTL mismatches, including cases where `useJurlCache`, `extraCacheKey`, headers, or modification dates changed response identity.
- The codebase added schema.org parsing, lenient JSON parsing, better JSON parse diagnostics, and a typed `QueryString` parser/builder instead of fragile selector/string logic.
- Stream S3-backed jurlcache responses into parsers and use AWS/S3-backed JurlCache paths when MariaDB-backed cache reads are too risky or variable.
- For `goThen` lint issues, ask about retry state and memory footprint: will the right failures retry, and will the returned value be smaller than a full response or DOM?
- In Safeway/Albertsons response handling, note that returning `null` from `goThen` means retry.
  The PR had to decide whether missing `offersData` was transient by proxy/request or persistent for those parameters.
- In this class of fetch bugs, prefer one invalid itemId to produce the right per-item result rather than bombing out every itemId in the response.
- In proxy-cost incidents, treat raw JurlCache error percentage as insufficient because the system may intentionally try cheaper/flakier proxies before falling back to expensive reliable ones.
- In Brightdata/IP-whitelist debugging, prefer cache-key or TTL changes such as a new `extraCacheKey` only after identifying that startup responses were cached longer than the operational change expected.
- Prefer `goBody(InstacartPickupServicesResponse.class)` or direct byte parsing instead of returning `LoggedJurl` and copying response bodies.
- Jurl code should return typed POJOs and use `bodyJson(object)` when the request/response shape is JSON, both for readability and memory behavior.
- Add `@JsonIgnoreProperties(ignoreUnknown = true)` on scraper DTOs, while remembering that the annotation guards future fields rather than fixing an existing parse mismatch.
- In CVS resolver reviews, spell out the null contract: returning `null` from `goThen` is a failed request just like throwing.
- In no-PDP/no-result reviews, prefer `Optional.empty()` or an explicit sentinel so valid no-result pages can be cached without being confused with proxy failure.
- Cache legitimate 404/no-longer-available itemIds so the system does not keep retrying pages that really have no result.
- Make retryable cases explicit in high-attempt Jurl paths, because many 2xx-4xx responses are persistent request outcomes rather than transient proxy failures.
- Include `groupId`, store, zip, or itemId in cache keys when they change response content, but omit CSRF/auth tokens when they only gate access and would shorten useful cache life.
- Route S3-backed JurlCache changes through `storeInS3`/domain decisions so long keys are truncated and S3 lookup behavior stays consistent.

### Caching Standard

Before adding or expanding a cache, require:

- A concrete reason: measured latency, load reduction, downstream protection, or repeated expensive work.
- A busting story: how admin/CS edits, deploys, reset endpoints, TTLs, or exclusions make stale data acceptable.
- A kill switch when the cache can create data inconsistency or memory pressure.
- A null/empty strategy. If avoiding repeated misses matters, cache misses explicitly with `Optional` or the repo's equivalent.
- A memory bound and concurrency story.
- Whether the cache is JVM-local, cross-server, Redis-backed, S3-backed, or app-config-backed. Restart, deploy, and invalidation behavior differ across them.
- Whether the cache identity includes the environment. `productionResources`, local/test file lists, R2/S3 keys, proxy zones, and admin/debug paths can legitimately need different entries.
- Whether failures should be cached, and where. HTTP 4xx, proxy timeouts, invalid itemIds, empty domain answers, and "we could not parse upstream" are different values.
- Whether HTTP cache rules preserve the headers the caller relies on. Do not accidentally cache 4xx responses or strip `stale-while-revalidate` behavior when the worker/reverse proxy expects it.

If those are not present, prefer query improvement, batching, dedupe, or reusing already-fetched results.

Pattern examples:

- Push back on one-off caches outside the ORM unless the PR proves the ORM cache is insufficient and explains cache busting.
- Prefer admin/CS behavior considered for caches, including reset endpoints or excluding admins.
- Accept bounded Caffeine caches when a service clearly owned the cache and invalidation behavior.
- Prefer moving static pool weights and expensive behavior behind app config when production tuning needed to happen without deploys.
- Rework cache changes when non-200/cache semantics are wrong, especially for session-like scraper caches.
- Prefer leaving a Redis "latest populator" key in place rather than deleting it, because deleting introduced a race where an earlier worker could overtake a later worker.
- Prefer a rate-limiter plus metric before turning on cached retailer-list responses, so the team would know when metrics became less trustworthy.
- Note that app config getters are already cached; do not copy their values into static constants unless you truly want one value per server startup.
- Be careful that `getStringNow` in static initializers can freeze bad values before dependencies or the first config fetch are ready.
- Prefer cache busting with a new S3 jurlcache key when stale Target API data was suspected, and noted that one extra request is often cheaper than making the cache machinery complex.
- Remember that cross-server `ExpiringAnswer` caches are not cleared by restarting one server; expiration can live in the cached object rather than Redis TTL.
- Use `invalidate(context)` as the normal way to dirty an `ExpiringAnswer` key, while warning that reflection-based JSP cache invalidation should stay rare.
- Call out environment-specific cache behavior when a non-production resources path returned a different cached file list.
- One-off non-ORM caches should justify why ORM caching is not enough, how admins/CS will see fresh data, and what reset/bust path exists.
- Prefer `Optional` or another explicit miss sentinel when caching null/missing results prevents repeated expensive misses.
- Move refresh work off inbound request paths when an `ExpiringAnswer` recompute could create latency spikes.
- Accept cache grouping by UI render context when it reduced polling and availability fetches without changing semantics.
- Prefer dirtying caches in write paths when that was more reliable than hoping TTLs or follow-up jobs clear stale values.
- Treat Redis/S3/JurlCache choices as production-safety decisions, especially when an important read path could not tolerate ephemeral MariaDB variance.
- Call out environment-specific cache behavior when `cachedSyncStreams` or non-production resources returned a different cached file list than production code.
- For partner worker cache rules, avoid caching error responses and preserve stale-while-revalidate semantics rather than flattening every response into one CDN behavior.
- In partner itemId/URD propagation debugging, reason through which cache could still hold stale UPC-to-URD data, including `ExpiringAnswer`-style caches that can outlive a single server restart.
- For JurlCache negative-cache toggles, ask whether `negativelyCacheAllFails` and `skipIfRequestRecentlyFailed` should obey environment or request-type boundaries instead of being broad toggles.
- In Brightdata whitelist debugging, prefer changing cache identity or TTL for the cached startup response instead of treating the whole proxy layer as broken.

### SQL, Schema, And Persistence

- Preserve every predicate intentionally. If a `where` clause changes, know what data becomes newly included or excluded.
- Prefer query fixes over masking results in Java when the database is doing expensive work.
- Watch for `COALESCE`, temporary tables, filesort, huge `IN` lists, off-row `TEXT`, and missing partition definitions.
- Use `JDBCUtil.buildListToken` and ORM helpers rather than hand-concatenating SQL.
- Test SQL escaping with apostrophes and quotes when touching escaping or list token helpers.
- Schema lifecycle hooks belong where all save paths hit them.
- Table creation changes should match the actual DB DDL details, including partitions when relevant.
- Prefer ORM/entity saves for one-time migrations when the alternative is fragile hand SQL, especially with quoting, batch sizing, or generated IDs.
- If a migration is already async and the row count is reasonable, `asyncSave()` can be clearer than hand-built batched `INSERT` strings.
- Use prepared statements or `JDBCUtil.executeUpdate` when variable data appears in SQL.
- Build conditional SQL as one interpolated string with a separate conditions expression rather than duplicating query bodies.
- Avoid ORM-generated IDs for rows written only by DB triggers; server-local generated IDs may not fit trigger semantics.
- Keep datasource/schema oddities out of low-level JDBC helpers. Put them in app/domain layers or an appropriate DAO/service.
- Avoid unindexed date predicates on huge partitioned tables. Pair them with indexed ID ranges such as `id > date_to_id(...)` and specify partitions when the table layout requires it.
- Think through index column order with the real predicate. `vendorId` first is not automatically better than `upcId`, `zip`, `storeId`, or another selective/domain-leading column.
- Huge `IN` lists are often a sign the batch divisor or grouping key needs adjustment.
- When a query is maxing CPU, isolate the exact query before changing another query with similar tables but different result semantics.

Pattern examples:

- Remove `COALESCE` and temporary-table/filesort patterns when they are the measured source of DB time and CPU.
- Prove SQL escaping fixes with `orm().loadWhere` and `JDBCUtil.buildListToken`.
- Include partition definitions in `create table` code when the table requires them.
- Be cautious that low-level JDBC utilities should not gain schema-specific behavior.
- Prefer fixed-length `varchar` over `TEXT` when bounds are known.
- Prefer using the ORM in migrations when hand SQL creates escaping mistakes, repeated `VALUES`, or unbounded query size.
- Prefer `JDBCUtil.executeUpdate("...", param)` for a data import instead of string-concatenated SQL.
- Use null-safe SQL comparison (`<=>`) in trigger logic so null-to-non-null price changes are captured.
- Test queries before merging when SQL constants/functions are unclear.
- Prefer running `ANALYZE TABLE` after adding an index so MySQL has fresh planner statistics.
- Use ID ranges and partitions for URZA backfill queries because date-only filtering can scan far too much data.
- Change only the CPU-heavy existence/precheck query in country-code fixes when the join/group-by query's result behavior needs monitoring.
- Prove `JDBCUtil.buildListToken` and `TextUtil.escapeSql` fixes with apostrophes and quotes, because the bug can be deeper than a one-character escape.
- Use `tinyint(1)` for boolean-ish MySQL columns when matching local schema conventions.
- Load IDs or dirty cache keys instead of loading full entities when the entity data is not needed.
- Treat fixed-length `varchar` as a performance preference when the bound is known, because `TEXT` can force off-row fetches.
- Reason about `id` columns, index leading columns, and partition definitions with the actual predicate rather than assumptions.

### Logging, Metrics, And Errors

- Log exception objects, not only exception messages, so Sentry/Scalyr get stack traces.
- Do not track expected invalid-data conditions as exceptions if the domain result can express them.
- Add metrics/tags at the layer that has the context, such as updater class, retailerId, storeId, UPC, status, or job phase.
- Avoid log spam. Suppressed or skipped exceptions should be consistently omitted or classified.
- Always include enough error message/context to debug production without overfetching or leaking secrets.
- Avoid `Try.getOrNull()` for unexpected failures. It hides exception swallowing from static analysis.
- If ignoring an unchecked exception is truly intended, make the catch explicit enough that lint/review can see the choice.
- Use `onFailure(logger::error)` before converting failures to null/empty results.
- Prefer catching specific exceptions over broad `catch (Exception)`.
  Specific catches document expected failures, avoid wrapping unchecked exceptions unnecessarily, and keep interruption handling visible to static analysis.
- Distinguish expected checked-ish errors from unexpected unchecked errors. Scraper code often has surprising unchecked failure modes.
- Label bare prints/logs so production logs are searchable.
- If errors are absent from the expected observability backend, treat that as a bug. Missing Sentry/Scalyr errors can be more important than whether a Jurl came from cache.
- After a production failure, ask what needs replaying and where it should have shown up: domain metrics, step completion, DLQs, Datadog dashboards, Sentry, Scalyr, or job logs.
- Add checkpoints around async pipelines when it is unclear which stage is missing, blocked, or misclassified.
- Do not mistake downstream saturation for the original cause. A request-pool spike, lock contention, or timeout storm needs correlation with deploys, traffic, and dependency behavior.

Pattern examples:

- The codebase fixed Sentry/Scalyr paths so exceptions flowed with stack traces.
- Add or correct StatsD/Datadog tags for updater class, retailerId, pixel status, UPC/store start/error/end, and custom Pulse URZA metrics.
- Log the exception object rather than just its message.
- Separate expected invalid conditions from tracked exceptions.
- Treat `Try.getOrNull()` as risky as swallowing exceptions, especially because lint cannot see the implicit catch.
- Prefer `try { ret = myTry.get(); } catch (RuntimeException ignored) { ret = null; }` over `myTry.getOrNull()` when swallowing is intended, because the linter can enforce explicitness.
- Add exception logs on migrations and utilities so failures are visible.
- Throw out of top-level updater methods when no meaningful result other than `UNKNOWN` can be set.
- Ask whether Snowflake/IP failures need replay and whether the failure appears in domain metrics, step completion, DLQs, and dashboards.
- Treat missing catalog-ingester errors in Scalyr/Sentry as the core issue even when Jurl cache/log behavior was also confusing.
- Add IAAS/BatchAvailability checkpoints and graphs before changing threading behavior.
- Resolver code should either log or throw every exception; lost exceptions are how broken resolvers stay unfixed.
- Store-importer code should avoid broad `catch (Exception)`; specific catches make expected failures readable and keep interruption propagation obvious.
- Note that `JurlException` is special because it sends request/response detail into Sentry, Datadog, and Scalyr.

### PR Scope And Review Shape

- Keep PRs focused on one behavior change when possible.
- Make the PR easy to review by keeping most new behavior in its own purpose-owned module. Touch existing code only where essential: shared utility updates, small hooks into existing registries, dependency wiring, thin call-site handoffs, and other minimal integration points.
- If a helper belongs somewhere else but moving it would widen scope too much, leave a follow-up only when the current PR remains correct and understandable.
- Remove dead or contradictory code touched by the PR.
- Do not add broad external configuration for scrapers/parsers if it makes debugging require both code version and remote config.
- Use config for safe rollout, kill switches, credentials, and tunables; keep core parsing logic in code unless there is a strong reason.
- When review asks "is this specific to X?", answer in code by naming the helper and locating it appropriately.
- If a PR makes a risky core-path change, strip IDE refactors, string-builder cleanup, and unrelated test cleanup into follow-ups.
- Explain the bug and impact in the PR description when the code path is subtle or the change could be a no-op.
- Provide the tools/process used for automatic refactors when a PR claims behavior is unchanged.
- Re-run review/AI assistance after major PR updates if earlier suggestions were based on old code.
- Keep committed local/dev run configs generic; use personal excludes for local secrets or overrides.
- During incidents, prefer a rollback, kill switch, config disable, placeholder/display change, or narrow forward fix that stops production damage while the cleaner change is prepared.
- Auto-merge and broad automation should depend on test confidence. It is appropriate in API paths with meaningful tests and much riskier in repos with little coverage.
- If a better architecture is too large for the current incident/week, state the follow-up and keep the current PR narrow.
- If reverting during an incident, prefer the smallest production-safe revert path and notify the original author.
  If only jobs are affected, a jobs-only deploy or feature-branch rollback can be safer than reverting all of prod.
- Use automated/AI review as another reviewer, not as authority. Re-run it after major changes, keep useful suggestions, and verify anything it claims against code, tests, and production signals.
- Treat `&& false` or `|| true` as an unfinished toggle, not cleanup.
  If the code is old and truly dead, remove it; if it is recent or behavior-bearing, replace it with a named constant or runtime AppConfig toggle.
- Do not remove load-bearing IDE/run/format config without a replacement plan.
  If run configurations or code style are removed, add equivalent build steps or README setup instructions.
- If a PR sprawls too wide to review cleanly, split formatter/refactor churn from behavior changes unless production urgency requires landing and monitoring.

Pattern examples:

- Keep widget-config NPE PRs laser focused.
- Be cautious that external scraper config can make debugging more complex.
- Accept app config flags for `INVALID` rollout, cache toggles, concurrency, and production safety.
- Audit stable constructor patterns before refactoring them.
- Keep changes minimal when a PR touches the core URZA loader because that path loads every product.
- Verify that tests actually create the data they depend on rather than relying on CI data.
- Paste failing integration-test output when the proposed fix does not appear related.
- Put the "clickbait" summary first in a PR description while keeping commit names factual.
- For McCormick/product-locator-style incidents, use kill switches, placeholder/display config, and scaling while the code fix is being understood.
- If a test deploy fails catastrophically, rebuild confidence with direct image/runtime comparison before trusting the production deploy path.
- Auto-merge only makes sense where the repo's tests provide enough protection.
- Move broad formatter churn into a separate PR because it makes the functional diff harder to review.
- Do not leave empty boilerplate PR-template text in commit messages; blank is clearer than noise.
- Explain the root cause for slow/flaky markers, or why the test cannot be deterministic yet.
- Split network fetching from response processing in scraper tests so parser/status logic can be tested without live network behavior.
- PRs that touch CI workflows, deploy images, or runtime dependencies should be manually triggerable or directly verified in the consuming stage.
- Treat missing imports, compile failures, and unrun unit tests as review-blocking evidence that the PR had not been locally checked.
- PRs that fix subtle NPEs, SQL escaping, or direct-atc/page-load behavior should explain the exact failing path and impact.
- Accept landing a large risky PR only with monitoring and explicit ownership of follow-up cleanup; the preferred default is still smaller slices.
- During job crash incidents, avoid reverting all of master/prod when only job behavior is affected;
  use the narrower deploy path and ping the author whose change is being reverted.
- Encourage AI review where tests and owner judgment still gate the merge. The pattern is extra coverage plus human verification, not blindly applying generated suggestions.
- In incident threads, provide a concise summary of what was broken, what had been ruled out,
  and what remained, so engineers could join without rereading the entire thread.
- Treat old `&& false`/`|| true` checks as likely rushed toggles. For newer code, prefer a named constant or AppConfig-backed toggle over deleting intent.
- Keep IntelliJ code style/run configs or replace them with build/README instructions because they are part of new-engineer setup and consistent local launch flags.
- Accept landing an overly large PR only with monitoring and ownership when reviewability had already been lost;
  the default preference remained smaller slices and separate formatting PRs.

## Helper Reference From Pear Commerce Code

Pear Commerce's codebase style is helper-rich, but not helper-happy.
Before adding a utility, do a targeted search for the concept, the return type, and one or two domain words.
Prefer reusing or tightening an existing helper over adding a near-duplicate.

Use this section as a preflight map.
It is intentionally broad, because a PR-improvement goal should be able to catch "we already have that" issues across Java, scrapers, persistence, caching, and async code.
Treat current code and tested helper behavior as stronger than secondhand wording:
if a helper exists and has been extended over time, prefer that API unless the current PR has a clear reason to carve a narrower path.

### Search Pattern

When a PR introduces a helper, parser, cache, fetch wrapper, list transform, SQL loop, retry loop, or async queue:

- Search class names first:
  `JSON`, `TextUtil`, `ListUtil`, `MapUtil`, `ObjectsUtil`, `OptionalUtil`, `Streams`, `DOMUtil`,
  `JDBCUtil`, `CSVUtil`, `FileUtil`, `S3Util`, `JurlProxyFallback`, `JurlCache`, `S3CachedValue`,
  `JurlUtil`, `URLUtil`, `QueryString`, `Memoizer`, `Lazy`, `Parallel`, `Pools`, `PearThreadPoolExecutor`,
  `PearBatchingAsyncWorkerPool`, `KeyedLock`, and `KeyedLockedReference`.
- Search behavior second:
  `parseCSV`, `parseDelimited`, `splitByChar`, `stripCommonTrackingQueryParams`, `groupByUnique`,
  `groupTuple2`, `loadMapped`, `executeQueryToRecord`, `executeQueryToTuple`, `buildListToken`,
  `goThen`, `goBody`, `bodyJson`, `decorate`, `getS3Key`, `submitCF`, `allOf`, `awaitAll`,
  `awaitAny`, `memoizeWithBound`, `firstOf`, `ofNullable`, `createCompositeMap`, and `consistentShuffle`.
- Search HTTP/cache behavior too:
  `useJurlCache`, `extraCacheKey`, `customJurlCacheKeySupplier`, `setJurlCacheSaveDecider`,
  `waitForActiveIdenticalRequests`, `retainSuccessfulProxyTypes`, `setAttemptSequenceGenerator`,
  `skipIfDomainRecentlyFailed`, `skipIfRequestRecentlyFailed`, `retryOnStatus`, and `retryOnError`.
- Search the domain folder third:
  `src/com/pear/itemurlupdater`, `src/com/pear/upcresolution`, `src/com/pear/instacart`,
  `src/com/pear/walmart`, `src/com/pear/target`, `src/com/pear/kroger`, `src/com/pear/amazon`,
  `src/com/pear/http`, `src/com/pear/lang`, `src/com/pear/persistence`, and `src/com/pear/concurrency`.
- If an existing helper is close but not exact, prefer a small extension plus focused tests over a new helper in a random class.
- If an existing helper has unsafe semantics for the new use, write that down in the PR and keep the new helper narrowly named.

Helper usage patterns:

- The codebase added `TextUtil.parseDelimited` and `TextUtil.parseCSV`, then moved more call sites onto them and fixed trailing-empty handling.
- The codebase added `JDBCUtil.executeQueryToRecord`, tuple query variants, and a hotfix so SQL long-list helpers do not return nulls.
- The codebase added `Streams.parallelMap`, `Streams.load`, `Streams.loadMapped`, `Streams.fairBatch`,
  and `AsyncStreamEmitter` fixes instead of scattering local stream/concurrency variants.
- The codebase repeatedly extended `JurlProxyFallback` and `JurlCache` for proxy ordering, circuit breakers,
  S3 streaming, local lookaside caching, timeout caching, cache keys, and response validation.
- The codebase optimized `TextUtil` methods in place, including no-regex splitting, non-alphanumeric stripping,
  word intersection memoization, number extraction, and abbreviation expansion.
- The codebase added `QueryString` as a concise typed query-string builder/parser instead of encouraging manual URL parameter construction.
- The codebase fixed mutable-list bugs in scraper request builders by using mutable helpers rather than immutable `List.of` where later mutation is expected.
- The codebase repeatedly moved local string/JSON/URL parsing toward existing helpers, even when the local code was short,
  because those helpers encode memory, escaping, and cacheability details.

### Code-Derived Helper Inventory

This is the "look here before creating anything" inventory.
It is based on helper classes the codebase has created, heavily edited, or repeatedly used in 2023-2026 code.

Parsing and serialization helpers:

- `JSON`: configured Jackson singleton; use `parseObject`, `parseTree`, `parseMap`, `parseList`, `parseSet`,
  `reParse`, `stringify`, `stringifyMin`, `stringifyPretty`, `toCompressedByteArray`, and `fromCompressedByteArray`.
- `JSON.findMatchingStrings`, `extractUPCs`, `extractMatchingUPCs`, `evaluatePath`, `compressJson`, and `sanitizeJson`
  are already present for JSON scanning and debug-oriented cleanup.
- `StringOrListDeserializer`, `ByteArrayUTF8OrBase64Deserializer`, `ByteArrayUTF8Serializer`,
  `VavrTupleObjectSerializer`, and `VavrTupleObjectDeserializer` cover common external-response and cache-debug shapes.
- `DOMUtil`: use `extract`, `extractUPCs`, `extractMatchingUPCs`, `parseSchemaOrgObject`,
  `parseSchemaOrgObjects`, and `extractTextWithNaturalSpaces` before adding ad hoc HTML extraction.
- `TextUtil`: use the existing normalization, CSV, number, abbreviation, title, word-set, and matching helpers.
- `QueryString` and `URLUtil`: use typed query parsing/building and URL canonicalization instead of manual split/join code.
- `CurrencyUtil`, `BigDecimalUtil`, `MD5Util`, `GzipUtil`, `SObjectUtil`, `ReflectionUtils`, and `EnumerationUtil`
  cover common one-off transformations that otherwise tend to be reimplemented locally.

Collection and dataflow helpers:

- `ListUtil`: mutable list construction, deterministic shuffling, first-value extraction, bucket merging,
  collating, set construction, sorted checks, enumeration, union, and left-padding byte arrays.
- `MapUtil`: nullable map construction, merge behavior, and write-once composite map overlays.
- `OptionalUtil.firstOf`: ordered fallback across optional values.
- `ObjectsUtil`: lenient boolean/long conversion, reflection construction, field copying, and clone helpers.
- `Streams`: grouping collectors, tuple collectors, future collectors, fair batching, bulk ORM loading,
  bounded parallel mapping, distinct-by-key filters, frequency sorting, medians, and async stream bridging.
- `ConcurrentLinkedDequeList`, `ReadWriteLockList`, `ReadWriteLockArrayList`, `ReadWriteLockStack`,
  and write-once composite structures are preferable to inventing synchronized list wrappers.

SQL, storage, and cache helpers:

- `JDBCUtil`: record/tuple/type/map query helpers, rowset helpers, list-token generation, SQL value escaping,
  prepared updates, date formatting/parsing, datasource routing, and Snowflake-aware behavior.
- `CSVUtil` and Apache Commons CSV usage: prefer parser-backed CSV handling over manual comma splitting for files.
- `FileUtil`: zip creation, unzip, and temp-file cleanup.
- `S3Util`: S3/R2 upload/download/string helpers, signed/would-be URL helpers, path builders,
  async read/write pools, key existence checks, image reupload, and remote asset upload.
- `JurlCache`: cross-server HTTP/function memoization, S3-backed response bodies, timeout caching,
  request/domain timeout checks, cache-key building, and successful-proxy history.
- `S3CachedValue`: typed reusable cached value backed by `JurlCache.decorate`, with a short local Caffeine lookaside cache.
- `Memoizer`, `LazyMemoizer`, `RefreshingMemoizer`, `TimedReference`, `DeferredResult`, `ExpiringAnswer`,
  `ExpiringLRUHashMapCache`, `MemcachedCache`, `LettuceCache`, `RedisCache`, and `SimpleORMCache`
  cover different freshness, lifecycle, and scope contracts.

HTTP, proxy, browser, and fetch helpers:

- `LoggedJurl`, `Jurl`, and `IJurl`: request building, headers/cookies/params, JSON bodies, response JSON helpers,
  XML/document helpers, curl rendering, async execution, synthesized responses, and file responses.
- `JurlProxyFallback`: proxy ordering, retry policy, cacheability validation, JurlCache wiring,
  duplicate-request locking, rate limiting, proxy attributes, proxy success-rate tracking, and circuit breakers.
- `JurlUtil`: servlet request-to-Jurl conversion, response replay, Chrome curl conversion, and reproducible request code.
- `HeadlessBrowserPool`, `ScrapflyAPI`, `ZenrowsAPI`, `AWSLambdaJurl`, `UserAgentUtil`, `RedirectUtil`,
  `AuthUtil`, `EncryptionUtil`, `IPUtil`, `IPLocationUtil`, and `PhoneUtil` are likely better homes
  than a new one-off HTTP helper.

Async and concurrency helpers:

- `Parallel`: submit helpers, `submitCF`, `submitAllCF`, `submitAndGetAll`, `submitAndGetAny`, `getAll`,
  `getAllTry`, `anyOf`, `allOf`, `allSuccesses`, `streamResults`, future-to-completable-future conversion,
  bounded pool construction, platform-yielder bridges, vacancy-aware pool selection, and named executor lifecycle.
- `Pools`: Spring-owned availability/background executors such as low-pri/high-pri platform pools,
  low-pri virtual pools, availability recompute pools, recently-requested SNS pools, and retailer-list executors.
- `PearThreadPoolExecutor`: prefer this where queue size, naming, metrics, tracking, or shutdown behavior matter.
- `PearAsyncWorkerPool`, `PearBatchingAsyncWorkerPool`, and `DynamicBatchingAsyncWorkerPool`:
  use these when the code owns a worker queue; do not fake batching when there is no batch contract.
- `KeyedLock`, `KeyedLockedReference`, `CrossServerKeyedLock`, `Locks`, `LockedCloseable`,
  `BoundedVirtualThreadPerTaskExecutor`, `BoundedWithFallbackExecutor`, `BoundedWithOverflowExecutor`,
  `TrackedHybridExecutorPool`, `CompositeThreadPoolExecutor`, and `SynchronousExecutorService`
  cover most local locking and executor shapes.
- `QueueUtil.sleepDrain` exists for queue-drain loops; search before writing a custom polling drain.

Domain helper families:

- UPC resolution: `UPCResolver`, `ItemIdInfoResolver`, `ItemIdInfoRetailerResolver`, `ItemIdInfoSingleResolver`,
  `PlatformIdInfoResolver`, `SearchHydrateItemIdSingleResolver`, `Dependent*Resolver`, `GoogleMetadata*Resolver`,
  `DomSelector*Resolver`, `Legacy*Resolver`, `SRetailerItemData`, `UPCResolutionUtilities`,
  `UPCResoGraphSearcher`, `UPCResoGraph*`, `CandidateComparator*`, and `QuoromValidator`.
- Availability and URZA loading: `RecomputeResult`, `AvailabilityStatusUtil`, `BatchAvailabilityUpdater`,
  `SingleUPCStoreIdBatchAvailabilityUpdater`, `MultiUPCStoreIdBatchAvailabilityUpdater`,
  `StaticDelegatingBatchAvailabilityUpdater`, `FullAvailabilityScanUtil`, `PulseOrchestrator`,
  `PulseJurlExceptionLoader`, `UPCRetailerZipAvailabilityLoader`, `MemcachedUPCRetailerZipAvailabilityLoader`,
  `SubBatchedUPCRetailerZipAvailabilityLoader`, `CachedUPCZipAvailabilities`, and URZA ID caches.
- Retailer/scraper helpers: `InstacartScraperUtil`, `InstacartBatchScraperUtil`, `InstacartPartnerPlatformUtil`,
  `InstacartRetailerCache`, `WalmartScraperUtil`, `WalmartRequestSignatureGenerator`, `TargetScraperUtil`,
  `KrogerScraperUtil`, `AmazonScraperUtil`, `AmazonAvailabilityUtil`, `GoogleShoppingUtil`,
  `CostcoUtil`, `SafewayScraperUtil`, `Mi9ScrapperUtil`, `UnataUtil`, `ChewyCSVReaderUtil`,
  `GoogleWebCacheScraper`, `DoordashUtil`, `SoldAtUtil`, and ship-to-home utilities.
- Store, catalog, and asset helpers: `StoreLoaders`, `StoreByWebUtil`, `GeoUtil`, `PearImage`,
  `CloudflareUtil`, `PartnerUPCQueryUtil`, `PartnerUPCR2PopulatorUtil`,
  `PinterestAvailabilityDataPopulatorUtil`, `PinterestCloudFlarePrewarmUtil`,
  `ThirdPartyCatalogVendorUtil`, `UpdatePartnerUPCRetailerDataUtil`, `PageCreationUtil`,
  `DisplayMasterIngredientsUtil`, `PrewarmUtil`, `TineyeUtil`, `ImageBackgroundUtil`, and `SampleDataUtils`.
- Config/integration helpers: `AWSAppConfigUtil`, `AWSBatchUtil`, `AWSSQSUtil`, `AWSSecretManagerUtil`,
  `AwsSNSUtil`, `SlackUtil`, `EmailUtil`, `GmailUtil`, `GoogleAuthUtil`, `GoogleCalendarUtil`,
  `GoogleAnalyticsUtil`, `GooglePlacesUtil`, `GoogleSearchUtil`, `FacebookUtil`, `FoursquareUtil`,
  `FlowUploadUtils`, `SMSUtil`, and `TwitterUtil`.

Helper families that show up repeatedly:

- 2023: `AWSAppConfigUtil`, `DynamicBatchingAsyncWorkerPool`, `PearAsyncWorkerPool`, `QueueUtil`,
  `ListUtil`, `CurrencyUtil`, several resolver families, and Spring/AppConfig-backed preferences.
- 2024: `QueryString`, `DOMUtil` schema.org/UPC extraction, `S3CachedValue`, `SearchHydrateItemIdSingleResolver`,
  `UPCResolutionUtilities`, `Streams.parallelMap`, `Streams.load`, `Streams.loadMapped`, `Lazy`,
  JurlCache S3 streaming, proxy-cost ordering, and circuit-breaker helpers.
- 2025: `JDBCUtil.executeQueryToRecord` and tuple variants, `TextUtil.parseDelimited`/`parseCSV`,
  service conversions for URZA updaters, batch availability updaters, item-id resolvers, and pulse orchestration,
  plus JurlProxyFallback success-rate tracking and loggable context helpers.

Example: use a helper family instead of reimplementing a local variant.

```java
return storeIds.stream()
    .collect(Streams.parallelMap(storeId -> {
        UnataSessionDataFetch sessionData =
            fetchSessionDataChangeStore(retailer, storeId, false);
        return fetchStoreProducts(sessionData, retailer, finalUrl, mainStoreZip, item);
    }, executorSupplier))
    .flatMap(Collection::stream)
    .collect(Streams.toList());
```

Example: make a reusable helper typed and cache-aware.

```java
private static Function<Tuple2<String, String>, Place> JURL_CACHED_GEOCODE_POSTAL_CODE_AWS =
    JurlCache.decorate(
        key -> _geocodePostalCodeAWS(key._1, key._2),
        new TypeReference<Place>() {},
        "geocodePostalCodeAWS",
        TimeUnit.DAYS.toMillis(180));
```

### JSON And Structured Parsing

Prefer `JSON.get()` and the repo's configured Jackson behavior over new object mappers.
It centralizes lenient upstream parsing, compressed serialization, JDK8 optional support, setter visibility, safe null-key handling, and Pear-specific failure diagnostics.

Use:

- `JSON.get().parseObject(body, Class<T>)` for known response DTOs.
- `JSON.get().parseObject(bytes, Class<T>)` or `goBody(Class<T>)` when response bytes are available and a string copy is avoidable.
- `JSON.get().parseObject(body, new TypeReference<...>() {})` for generic maps/lists.
- `JSON.get().parseList(body, Item.class)` or `parseSet` for simple collections.
- `JSON.get().parseTree(body)` when the schema is partly unknown.
- `JSON.get().reParse(obj, Target.class)` when converting a map/tree/SObject-like object into a DTO.
- `JSON.get().stringifyMin(obj)` for compact cache/log identity and `stringifyPretty` only for human debug output.
- `JSON.get().toCompressedByteArray(obj)` and `fromCompressedByteArray(bytes, Class<T>)` when the helper contract is compressed JSON bytes.
- `JSON.findMatchingStrings`, `extractUPCs`, `extractMatchingUPCs`, `evaluatePath`, `compressJson`, and `sanitizeJson`
  when scanning or normalizing JSON-shaped text.
- `@JsonIgnoreProperties(ignoreUnknown = true)` on third-party response DTOs that may add or omit fields.
- `StringOrListDeserializer` when upstream sends either `"value"` or `["value"]`.
- `ByteArrayUTF8OrBase64Deserializer` and `ByteArrayUTF8Serializer` patterns for raw response bytes that may be UTF-8 JSON or base64.

Avoid:

- `new ObjectMapper()` in ordinary app code.
- Parsing JSON with string splits or regex.
- Losing generic type information by parsing to raw `Map` when a `TypeReference` is available.
- Treating `null` data fields as ordinary empty results before deciding whether the response is cacheable.
- Hand-building JSON strings for request bodies when a small request POJO plus `bodyJson(...)` would be clearer and safer.

Repo snippets:

```java
List<ExhibitorListResponse> responseData = JSON.get().parseObject(
    response.getResponseBody(),
    new TypeReference<List<ExhibitorListResponse>>() {});
```

```java
List<Map<String, String>> stores = JSON.get().parseObject(
    jsonContent,
    new TypeReference<List<Map<String, String>>>() {});
```

```java
@JsonIgnoreProperties(ignoreUnknown = true)
public static class TescoSearchResponse {
    public SearchData data;
}
```

Inconsistent upstream shape:

```java
@JsonIgnoreProperties(ignoreUnknown = true)
public class SLdJsonRecipe {
    @JsonDeserialize(using = StringOrListDeserializer.class)
    public List<String> recipeCategory;

    @JsonAlias({"recipeIngredient", "ingredients"})
    public List<String> recipeIngredient;
}
```

When parsing HTML, search for `DOMUtil` before adding selector-only logic:

- `DOMUtil.parseSchemaOrgObjects(document)` for ld+json/schema.org extraction.
- `DOMUtil.extractUPCs(document)` and `extractMatchingUPCs` for UPC-like text in documents.
- `DOMUtil.extractTextWithNaturalSpaces(element)` when inline tags, superscripts, and whitespace matter.

The 2023-2024 review pattern for scraper JSON was very consistent:

- Use a JSON-to-POJO tool or IntelliJ generator for stable external JSON.
- Put `@JsonIgnoreProperties(ignoreUnknown = true)` on DTOs for future upstream fields.
- Parse bytes directly when possible.
- Use `JsonNode.path(...)` when optional nested fields should behave like `Optional.map(...)`.
- Keep response validation separate from item/UPC matching.

### Text, UPCs, Normalization, And CSV

Search `TextUtil` before adding string helpers. Pear Commerce tends to optimize and centralize string logic because text parsing sits in hot scraper, matching, and catalog paths.

Use:

- `TextUtil.parseDelimited` and `parseCSV` for delimited app config and import strings.
- `TextUtil.parseCSVLong` when the common case is a comma-delimited list of long IDs.
- `TextUtil.splitByChar` for hot-path splitting where regex allocation matters.
- `TextUtil.escapeSql` through `JDBCUtil` helpers when SQL string escaping is unavoidable.
- `TextUtil.normalizedContains`, `normalizedIndexOf`, `normalizeString`, `convertToAscii`, and `replaceCommonUnicodeCharacters` for product/title matching.
- `TextUtil.removeSentence`, `nameToUrlPathPart`, `delimitNonBlanks`, `shortenPhrase`, and `unescapeStringifiedJson`
  before adding local formatting helpers.
- `TextUtil.stripNonAlphanumeric`, `trimNonNumeric`, and `trimNonAlphanumeric*` for fast normalization.
- `TextUtil.extractNumbers`, `extractNumberValues`, `evaluateNumericExpressions`, and `wordContainsNumbers` for size/quantity parsing.
- `TextUtil.words`, `normalizedWordSet`, `wordIntersectionCount`, `wordDifferenceCount`, and cosine similarity helpers for title comparison.
- `TextUtil.longestWords`, `longestWord`, `maxPrefixSubstringMatch`, and `shareAlphanumericPrefix` for cheap lexical ranking.
- `TextUtil.expandAbbreviations`, `isAbbreviation`, and abbreviation-aware Levenshtein helpers for brand/product name matching.
- `TextUtil.containsAnyWords`, `containsAnyWordsExpandAbbreviations`, `wordIntersectionCount`, and `wordDifferenceCount`
  for word overlap checks.
- `TextUtil.buildProductTitle`, `buildProductTitles`, and `validateBrandAProductSizeAssortmentMatch` for product title construction and matching semantics.
- `TextUtil.addressMatch` and cardinal-direction helpers before adding local store-address comparisons.
- `CSVUtil` and Apache Commons CSV-backed helpers for CSV files, not manual comma splitting.
- `StringEscapeUtils.escapeJson` or a central `TextUtil` helper for JSON string escaping; do not add a retailer-local escape helper before searching both.

Repo snippets:

```java
public List<String> getCSVNow(String flagName, String property, String defaultValue) {
    return TextUtil.parseCSV(getStringNow(flagName, property, () -> defaultValue));
}

public List<Long> getCSVLongNow(String flagName, String property, String defaultValue) {
    return TextUtil.parseCSVLong(getStringNow(flagName, property, () -> defaultValue));
}
```

```java
upcs = TextUtil.parseCSV(createPageRequest.upcs);
if (upcs.isEmpty()) {
    throw ApiException.invalidParams400("No upcs given", false);
}
```

Prefer extending `TextUtil` with a test when the behavior is a general text rule. Keep domain-specific rules in the domain helper when they depend on a retailer's quirks.

### Lists, Maps, Optionals, And Object Helpers

Search `ListUtil`, `MapUtil`, `OptionalUtil`, and `ObjectsUtil` before writing small collection glue.

Use:

- `ListUtil.of(...)` when the result must be mutable or tolerate null-ish construction patterns.
- `ListUtil.ofImmutable(...)` or `List.of(...)` only when immutability and non-null inputs are intentional.
- `ListUtil.getFirstValue(list, mapper)` for "first non-null mapped value" extraction.
- `ListUtil.first`, `firstNonEmptyList`, `union`, `enumerate`, and `collate` for common list operations.
- `ListUtil.consistentShuffle(list, seed)` when deterministic randomized ordering matters.
- `ListUtil.merge(buckets, keyFn)` when overlapping buckets should be collapsed by shared keys.
- `ListUtil.merge(base, toMerge)` only when mutating `base` is the intended contract.
- `ListUtil.set`, `isSorted`, and `leftPadArray` for those exact small collection/array needs.
- `MapUtil.merge(first, second, mergeFn)` when conflict resolution matters.
- `MapUtil.ofNullable(...)` to build maps while dropping null values.
- `MapUtil.createCompositeMap(...)` when a lookup should overlay maps without copying everything.
- `OptionalUtil.firstOf(...)` for ordered optional fallback.
- `ObjectsUtil.toBoolean`, `parseLongForce`, `construct*`, and clone helpers when those exact semantics are needed.
- `BigDecimalUtil.equalValue` when numeric equality should use `compareTo` semantics instead of `equals`.
- `EnumerationUtil.stream` or `getAsSet` for servlet/legacy enumeration conversion.
- `Lazy.memoize`, `memoizeNonBlocking`, or `memoizeEventualValue` for per-instance lazy values when a supplier contract is clearer than manual synchronized caching.
- `ReadWriteLockList`, `ConcurrentLinkedDequeList`, `ConcurrentHashMap.newKeySet`, or write-once composite structures for concurrent collections before adding `synchronized`.

Example:

```java
List<String> offerIds = Optional.ofNullable(offerToUse)
    .map(o -> o.offerId)
    .map(oid -> new ArrayList<>(ListUtil.of(oid)))
    .orElse(new ArrayList<>());
```

Review smell:

```java
List<String> offerIds = Optional.ofNullable(offerToUse)
    .map(o -> o.offerId)
    .map(oid -> List.of(oid))
    .orElse(new ArrayList<>());
// Bug if later request-building mutates offerIds.
```

The second form is a bug if mutation is expected. This exact class of scraper/request-builder issue has been fixed before.

### Streams And Bulk Loading

Prefer stream collectors and bulk loaders already in `Streams` when a PR hand-writes grouping, batching, or CompletableFuture collection code.

Use:

- `Streams.fromIterator`, `concat`, and `findLast` when bridging legacy iterators or appending stream output.
- `Streams.propertyPriorityComparator` when ranking by ordered boolean preference flags.
- `Streams.groupByUnique` when each key should have exactly one value.
- `Streams.groupTuple2`, `groupTuple2Ordered`, `groupTuple2Unique`, `groupEntryUnique`, and `mapTuple2` for tuple-heavy transformations.
- `Streams.toList()` when a sized mutable list collector is helpful.
- `Streams.toFrequencyList`, `median`, and `intMedian` when frequency or median collectors already express the shape.
- `Streams.fairBatch` or `batch` for chunking.
- `Streams.distinctByKey`, `distinctValues`, and `flattenValues` for common stream filtering.
- `Streams.groupById` for `SimpleORMObject` ID maps.
- `Streams.load(Class<T>)`, `load(Class<T>, loader)`, and `loadMapped` for stream-to-bulk-ORM loading patterns.
- `Streams.parallelMap(mappingFunction, parallelism)` for bounded parallel stream mapping when the operation is independent.
- `Streams.parallelMap(mappingFunction, executorSupplier, handler)` when the executor and exception handling need to be explicit.
- `Streams.semaphoreLimited` when a pure mapping/consumer must be locally bounded and a named executor would be heavier.
- `Streams.allOfCF`, `awaitAll`, and `awaitAny` for future aggregation.
- `Parallel.getAll`, `Parallel.allOf`, `Parallel.streamResults`, and `Streams.awaitAll` when future result/exception behavior matters.
- `Streams.asyncStream` and `AsyncStreamEmitter` only when a real producer/consumer stream boundary is needed.

Example:

```java
Map<Long, Store> storesById = ids.stream()
    .collect(Streams.loadMapped(Store.class, Store::id));
```

Example:

```java
Map<Long, List<Long>> upcsByRetailer = rows.stream()
    .map(row -> new Tuple2<>(row.retailerId(), row.upcId()))
    .collect(Streams.groupTuple2());
```

Prefer streams for list-to-list/list-to-map transforms when the stream expresses the shape clearly.
Keep loops when they model stateful protocol work, early exit with side effects, resource lifetimes, or error handling that would be obscured by a stream.

Do not assume a repo helper is always the best fit:

- `Streams.distinctValues` is wrong when all the code needs is flattened values without extra stream/collect overhead.
- `PearBatchingAsyncWorkerPool` is wrong when there is no batching.
- A stream sort is wrong when the caller immediately sorts again.
- A generic format helper is wrong when the new behavior validates or changes meaning.

### SQL, Records, Files, And Storage

Search `JDBCUtil`, `CSVUtil`, `FileUtil`, and `S3Util` before adding persistence or file helpers.

Use:

- `JDBCUtil.executeQueryToMapList`, `mapFromResultSet`, and `createListsFromResultSet` for generic result inspection.
- `JDBCUtil.executeQueryToDisconnectedRowset` only when the caller really needs a rowset object past the connection lifetime.
- `JDBCUtil.executeQueryToRecord(sql, RecordClass.class, params...)` when query columns map to a Java record constructor by order.
- `JDBCUtil.executeQueryToTuple` variants for quick projection queries.
- `JDBCUtil.executeQueryToType`, `executeQueryAndReturnLongs`, `executeQueryAndReturnStrings`, and single-value helpers for simple reads.
- `JDBCUtil.executeQueryAndMapByRow` when row mapping genuinely needs custom `ResultSet` logic.
- `JDBCUtil.executeUpdate(sql, params...)` rather than string-building data values.
- `JDBCUtil.buildListToken(collection)` only when an SQL `IN (...)` list is required and the caller understands empty-list sentinel behavior.
- `JDBCUtil.sqlString`, `sqlValue`, and `sqlEscapeString` only for unavoidable generated SQL. Prefer prepared parameters where possible.
- `JDBCUtil.formatDatetime`, `parseDate`, and datasource helpers instead of local date/connection helpers.
- `CSVUtil.write2DListToFile` and `formatCSVFile` for CSV formatting/parsing.
- `FileUtil.generateZipFile`, `unzip`, and `deleteTempFiles` for zip/temp-file handling.
- `S3Util.uploadString`, `uploadStringAsync`, `uploadFile`, `getString`, `getStringAsync`, `downloadFile`, `checkIfKeyExists`, and URL builders for S3/R2 paths.
- `S3Util.buildS3URLFromMultipathKey`, `buildR2URLFromMultipathKey`, `getWouldBeURL`, and `ASSETS_URL` constants rather than manual S3 URL concatenation.
- `S3Util.S3_READ_THREAD_POOL`, `S3_WRITE_THREAD_POOL`, `R2_READ_THREAD_POOL`, and `R2_WRITE_THREAD_POOL`
  instead of anonymous executors for S3/R2 work.

Repo snippets:

```java
List<IdAndUpc> rows = JDBCUtil.executeQueryToRecord(
    "SELECT id, UPC FROM UPC order by id desc limit 20",
    IdAndUpc.class
);
```

```java
List<Tuple2<Long, Long>> retailerIds = JDBCUtil.executeQueryToTuple(
    queryTemplate,
    Long.class, Long.class);
```

If a PR adds manual `ResultSet` loops, string-concatenated SQL lists, or custom CSV escaping,
try to replace them with these helpers or explain why the helper contract is wrong for this case.

### HTTP, URLs, Query Strings, And Jurl

Use `LoggedJurl`, `Jurl`, `JurlProxyFallback`, `JurlCache`, `JurlUtil`, `URLUtil`, and `QueryString` before adding HTTP wrappers.

Use:

- `LoggedJurl`/`Jurl` response helpers such as `getResponseJsonObject`, `getResponseJsonList`,
  `getResponseJsonMap`, `getDocument`, `getResponseBytes`, `getResponseFile`, response header/cookie helpers,
  `throwOnNon200`, `timeout`, and `toCurl`.
- `JurlProxyFallback.goBody(Class<T>)` or `JSON.get().parseObject(lj.getResponseBytes(), Class<T>)` when the caller wants only a typed response.
- `LoggedJurl`/`Jurl` request helpers such as `bodyJson`, `asChrome`, `header`, `param`, `params`, `cookie`,
  `basicHttpAuth`, `followRedirects`, `hardEnforceTimeout`, `proxySession`, `contentType`, and `newWithCookies`.
- `JurlProxyFallback` for one logical fetch that may try multiple proxy types, zips, circuit breakers, or retry policies.
- `JurlProxyFallback.goThen` for HTTP-level parsing and cacheability validation.
- `JurlProxyFallback.none`, `statick`, `walmart`, `noRenderNoAntiBotFast`, `noRenderNoAntiBotCheap`,
  `noRenderAntiBotFast`, `jsRenderAntiBotFast`, `unblockerScrapefly*`, and `staticAndUnblocker`
  before creating a new proxy-order list.
- `JurlProxyFallback.retryOnStatus`, `retryOnError`, `hardEnforceTimeout`, `skipIfDomainRecentlyFailed`,
  `skipIfDomainRecentlyTimedOut`, and `skipIfRequestRecentlyFailed` instead of local retry loops.
- `JurlProxyFallback.extraCacheKey` or `customJurlCacheKeySupplier` when request identity includes headers, zip, store, app config, or other non-URL/body state.
- `JurlProxyFallback.setJurlCacheSaveDecider` when a response is only sometimes cacheable.
- `JurlProxyFallback.waitForActiveIdenticalRequests` when duplicate concurrent calls are likely.
- `JurlProxyFallback.retainSuccessfulProxyTypes` when a wide proxy list should be trimmed by recent success history.
- `JurlProxyFallback.trackProxyTypeSuccessRates` when the code should learn from recent proxy outcomes.
- `JurlProxyFallback.setProxyAttribute`, `setProxySessionId`, `setConcurrentQueue`, `setRateLimiter`,
  `setSelectProxyOrderFromJurlCache`, `ifUncached`, `negativelyCacheIfAllFail`, `parallel`, and `stagger`
  when those exact proxy/cache/concurrency behaviors are needed.
- `JurlProxyFallback.setAttemptSequenceGenerator` instead of the deprecated `attempts` style.
- `JurlUtil.fromChromeCurl` and `getLoggedJurlConstructor` for translating browser requests into reproducible Jurl code.
- `URLUtil.stripCommonTrackingQueryParams`, `stripQueryParams`, `queryMapFromURL`, `queryStringFromQueryMap`, `getURL`, `getTopDomain`, `getPath`, and normalization helpers.
- `URLUtil.getQuery`, `getBaseUrl`, `updateQueryParams`, `encode`, `decode`, and `decodeQuietly`
  before adding URL helpers.
- `QueryString.fromUrl`, `fromQueryString`, `toQueryString`, `mapFromUrl`, `mapFromQueryString`, and `mapToQueryString`
  for typed query parsing/building.

Repo snippets:

```java
SCreatePixelRequest req = new SCreatePixelRequest();
req.catalogId = 12345967L;
req.pixelId = "6789";
req.retailerId = 18L;
req.event = "A B C D";

String queryString = QueryString.toQueryString(req);
```

```java
SCreatePixelRequest parsed = QueryString.fromQueryString(
    STR."event=\{URLUtil.encode("A B C D")}&pixelId=6789&catalogId=12345967&retailerId=18",
    SCreatePixelRequest.class);
```

Repo JurlProxyFallback shape:

```java
TescoStoreLocationsResponse response = new JurlProxyFallback(
    JurlProxyFallback.ukStatic(),
    () -> new LoggedJurl()
        .url(TescoPlanHelper.TESCO_BASE_URL + "/StoreLocations")
        .method(Jurl.POST)
        .timeout(30_000)
        .body(requestBody)
        .throwOnNon200(false))
    .attempts(1)
    .useJurlCache(true, TimeUnit.DAYS.toMillis(30))
    .extraCacheKey(zipCode)
    .goThen(lj -> lj.getResponseJsonObject(TescoStoreLocationsResponse.class))
    .get();

if (response == null || response.data == null || response.data.tescoLocations == null) {
    return Collections.emptyList();
}
return response.data.tescoLocations;
```

In that shape, request identity is explicit (`extraCacheKey(zipCode)`), parsing happens in the request path,
and no-data handling happens after the fetch instead of being confused with proxy retry.

Review smells:

- A local `for` loop over proxy providers instead of `JurlProxyFallback`.
- Business transforms inside `goThen` that can throw for reasons unrelated to HTTP validity.
- Cache keys that ignore headers, zip, store, body, or proxy attributes that change the response.
- Manually parsing query strings with `split("&")`.
- Manual JSON body strings instead of `bodyJson`.
- CSS selector scraping when `DOMUtil.parseSchemaOrgObjects` can read structured ld+json.

### JurlCache, S3CachedValue, And Memoization

Pear Commerce cache code separates several concerns:
in-process CPU memoization, service-owned temporary caches, S3/JurlCache-backed cross-server caches,
request-scoped caches, and domain caches.
Examples include Redis, Memcached, ORM caches, JurlCache, and S3-backed cached values.
Pick the smallest cache that matches freshness, sharing, and invalidation needs.

Use:

- `JurlProxyFallback.useJurlCache(true, ttl)` for HTTP responses whose cacheability is validated in the request path.
- `JurlCache.decorate(function, TypeReference/Class, identifier, ttlMillis)` for expensive pure-ish functions that can be keyed by JSON input and reused across servers.
- `JurlCache.get`, `saveToCache`, `saveTimeout`, `buildKey`, `getS3Key`, `getS3BaseKey`,
  `shouldStoreDomainInS3`, `getRecentDomainTimeouts`, `getRecentRequestTimeouts`, and `getSuccessfulProxyTypes`
  before adding local cache-key or timeout-history code.
- `S3CachedValue<K,V>` for reusable typed cached values backed by JurlCache/S3, with an executor and an integer `version()` method for busting.
- `S3CachedValue.getWouldBeS3Url(key)` when a PR needs to expose/debug the exact backing cache URL.
- `Memoizer.memoize`, `memoizeWithBound`, `memoizeInt`, `memoizeComparator`, and `call`
  for deterministic local computations. Prefer bounded memoizers unless the key space is obviously tiny.
- `Memoizer.memoizeToDoubleFunction`, `memoize(Supplier)`, and `globalSingleton` only when those older static/singleton semantics are intentional.
- `LazyMemoizer` for one-value lazy caches that are manually refreshed.
- `RefreshingMemoizer` only for long-lived/static ownership where the scheduled refresh task will be closed or live for the process.
- `TimedReference`, `DeferredResult`, `ExpiringAnswer`, `ExpiringLRUHashMapCache`,
  `MemcachedCache`, `SimpleORMCache`, `LettuceCache`, and `RedisCache` when their existing semantics fit.
- `UrzaCanonicalIdCache`, `RedisUrzaIdCache`, and related URZA caches when their domain keying is the right fit.
- `DelegateChainCache`, `DelegateCompoundCache`, `RequestScopedCache`, and `ThreadLocalCache` before building multi-layer cache chains.

Repo snippets:

```java
private static Function<Tuple2<String, String>, Place> JURL_CACHED_GEOCODE_POSTAL_CODE_AWS =
    JurlCache.decorate(
        key -> _geocodePostalCodeAWS(key._1, key._2),
        new TypeReference<Place>() {},
        "geocodePostalCodeAWS",
        TimeUnit.DAYS.toMillis(180));
```

```java
final private TimedReference<Map<Long, RetailPartner>> staticUpdateRetailersRef =
    new TimedReference<>(10, TimeUnit.MINUTES);

public Map<Long, RetailPartner> getStaticUpdateRetailers() {
    return staticUpdateRetailersRef.get(() -> reflections
        .getSubTypesOf(UPCRetailerStaticAvailabilityRecomputer.class)
        .stream()
        .filter(cls -> !Modifier.isAbstract(cls.getModifiers()))
        .map(ManagedResourcesConfig::createInstance)
        .flatMap(au -> au.retailerEnums().stream())
        .distinct()
        .map(RetailPartner::forEnumName)
        .filter(Objects::nonNull)
        .collect(Collectors.toMap(rp -> rp.id, Function.identity())));
}
```

Cache review checklist:

- Is the cached value valid for all stores, zips, headers, bodies, app-config variants, proxy attributes, and user/session state represented by the key?
- Is a negative/null result cacheable? If yes, should it be `Optional`?
- Is the TTL explicit and appropriate for upstream freshness?
- Is there a `version()`/key bump path for emergency invalidation?
- Does the cache have a bounded local memory footprint?
- Does the cache use an existing S3/R2/JurlCache helper instead of manually writing objects?
- Does the write path avoid saving malformed or partial upstream responses?

### Async, Pools, Batching, And Locks

Search `Parallel`, `Pools`, `PearThreadPoolExecutor`, `PearBatchingAsyncWorkerPool`, `Streams`, `KeyedLock`, and lock helpers before building async machinery.

Use:

- Injected `Pools` for named application executors.
- `CompletableFuture.supplyAsync(..., executor)` with an explicit executor.
- `Parallel.submit`, `submitCF`, `submitAll`, `submitAllCF`, `submitAndGetAll`, `submitAndGetAny`,
  `anyOf`, `allOf`, `allSuccesses`, `streamResults`, and `toCompletableFuture` for common future orchestration.
- `Parallel.getAll`, `getAllTry`, `getAny`, `invokeAndGetAll`, and `getCF` when existing future-wait semantics fit.
- `Parallel.mostVacantPoolWithPreference`, `anyWithVacancy`, `mostVacantPoolOrCurrentThread`,
  and `getNamedLowPriBackgroundTaskExecutor` before adding another global executor.
- `Parallel.createBoundedPlatformThreadPool`, `createBoundedVirtualThreadPool`, `createUnboundedVirtualThreadPool`,
  or `createBoundedPoolWithOverflowExecutor` only when a local pool is truly needed.
- `Parallel.virtual_AwaitOnPlatform` and `virtual_SubmitOnPlatform` when virtual-thread code must yield blocking work to a platform pool.
- `PearThreadPoolExecutor` when telemetry/tracking matters.
- `PearBatchingAsyncWorkerPool` when writes or external work should batch instead of becoming many tiny parallel operations.
- `PearBatchingAsyncWorkerPool.dedupeBy`, `setTrackCapacity`, `setExpectedFull`, `submit`, `submitAll`,
  `submitAndBlockWhileQueued`, and purge controls when the existing batching semantics fit.
- `Streams.parallelMap` for independent stream mapping with bounded parallelism.
- `QueueUtil.sleepDrain` for bounded queue-drain loops.
- `KeyedLock`, `KeyedLockedReference`, `CrossServerKeyedLock`, `Locks`, `LockedCloseable`,
  `ReadWriteLockList`, and `ConcurrentLinkedDequeList` for existing lock/list semantics.

Async review checklist:

- Is the executor explicit, injected, bounded, and named for the workload?
- Does the future body contain the slow/throwing work, not only a final parser?
- Does `whenComplete` or equivalent observe failures from the actual async work?
- Is batching needed instead of raw parallelism?
- Does the caller know whether it waits for enqueue, processing, saves, or all downstream side effects?
- Is `submitAndBlockWhileQueued` intentionally waiting for all queued work?
- Are futures removed from tracking maps after completion?
- Does interruption propagate correctly?

### Domain Helpers To Search Before Creating More

The following classes and folders appear often in frequently authored or modified code. Search them before adding a new utility, scraper helper, resolver, cache, matcher, or loader.

Core app/domain loading:

- `StoreLoaders`, `FullAvailabilityScanUtil`, `RecomputeResult`, `AvailabilityStatusUtil`.
- `BatchAvailabilityUpdater`, `SingleUPCStoreIdBatchAvailabilityUpdater`, `MultiUPCStoreIdBatchAvailabilityUpdater`,
  `StaticDelegatingBatchAvailabilityUpdater`, and retailer-specific `*AvailabilityUpdater` classes.
- `PulseOrchestrator`, `RecentlyRequestedAvailabilitiesProcessor`, `AvailabilitiesQueueProcessor`,
  `RealtimeAvailabilities`, `SynchronousAvailabilitiesComputer`, and `AvailabilitiesComputer2023`.
- `PartnerUPCQueryUtil`, `PartnerUPCLifecycleProcessor`, `PartnerUPCR2PopulatorUtil`.
- `PinterestAvailabilityDataPopulatorUtil`, `PinterestCloudFlarePrewarmUtil`, `ThirdPartyCatalogVendorUtil`.
- `PearImage`, `CloudflareUtil`, `GeoUtil`, `StoreByWebUtil`.
- `LegacyURZALoader`, `UPCRetailerZipAvailabilityLoader`, `MemcachedUPCRetailerZipAvailabilityLoader`, `SubBatchedUPCRetailerZipAvailabilityLoader`.
- `PulseJurlExceptionLoader`, `CachedUPCZipAvailabilities`, `CachedUPCZipAvailabilitiesKeysOnly`, `UPCRetailerDataSerializer`.
- `PageCreationUtil`, `DisplayMasterIngredientsUtil`, `PrewarmUtil`, `TineyeUtil`, `ImageBackgroundUtil`.
- `UpdatePartnerUPCRetailerDataUtil`, `SampleDataUtils`, `HttpThirdPartyCatalogPixelFetcher`.
- Pulse report helpers such as `PulseReportGenerator`, `PulseReportRepository`, `PulseReportEmailBuilder`, and `PulseReportGenerationJob`.

Retailer and scraper helpers:

- `WalmartScraperUtil`, `WalmartRequestSignatureGenerator`.
- `InstacartScraperUtil`, `InstacartBatchScraperUtil`, `InstacartListLinkBuilder`,
  `InstacartPartnerPlatformUtil`, `InstacartRetailerCache`, `InstacartHeadlessScraper`, and `InstacartPrewarmer`.
- `AmazonScraperUtil`, `AmazonAvailabilityUtil`, `KrogerScraperUtil`, `TargetScraperUtil`, `GoogleShoppingUtil`.
- `MacysShipToHomeUtil`, `NordstromShipToHomeUtil`, `CostcoUtil`, `SafewayScraperUtil`.
- `ChewyCSVReaderUtil`, `ChewyBaseItemIdResolver`, `ChewyLdJson`, `Mi9ScrapperUtil`, `UnataUtil`, `GoogleWebCacheScraper`.
- `DoordashUtil`, `SoldAtUtil`, `WalmartRecipeUtil`, `MikMakEndpoint`, `MikMakEndpointDownloader`, and `MikMakManglerController`.
- Retailer-specific updaters and resolvers often encode hard-won scraper knowledge; search by retailer enum/name
  before adding a generic helper.

UPC resolution and scoring:

- `UPCResolver`, `ItemIdInfoResolver`, `ItemIdInfoRetailerResolver`, `ItemIdInfoSingleResolver`,
  `PlatformIdInfoResolver`, `SearchHydrateItemIdSingleResolver`, `HtmlRetailerItemDataFetcher`.
- `SRetailerItemData`, `UPCResoGraphSearcher`, `UPCResoGraph*`, matching/scoring helpers under `src/com/pear/upcresolution`, and product/title helpers in `TextUtil`.
- Search by suffix before adding a resolver:
  `*ItemIdResolver`, `*IdInfoResolver`, `*InfoResolver`, `*MetadataResolver`, `*SingleResolver`,
  `*PlatformIdInfoResolver`, `*GoogleMetadataResolver`, `*DomSelectorItemIdResolver`, and `*StaticResolver`.
- Search shared resolver bases before subclassing:
  `DependentItemIdInfoResolver`, `DependentItemIdInfoSingleResolver`, `DependentPlatformIdInfoResolver`,
  `GoogleMetadataResolver`, `GoogleMetadataSingleRetailerResolver`, `GoogleMetadataPlatformIdInfoResolver`,
  `GoogleMetadataAutoGeneratedResolver`, `DomSelectorItemIdInfoResolver`, `DomSelectorSingleItemIdResolver`,
  `DomSelectorDBConfigItemIdResolver`, `MultiRetailerMultiIdResolver`, `VendorIdInfoResolver`,
  `LegacyItemIdInfoResolver`, `LegacyMercatusIdInfoResolver`, and `LegacyUnataIdInfoResolver`.
- Search scoring/debug helpers:
  `CandidateComparator`, `CandidateComparatorDefault`, `CandidateComparator*`, `UPCResolutionUtilities`,
  `SampleDataUtils`, `NERUtil`, `ChatGPTUtil`, `StaticKnownItemDetails`, and `QuoromValidator`.
- Search utility classes under `src/com/pear/upcresolution/utilities`, including `UPCResolutionUtilities`,
  `ChewyCSVReaderUtil`, `GoogleWebCacheScraper`, `Mi9ScrapperUtil`, and `UnataUtil`.

HTTP/proxy/browser helpers:

- `LoggedJurl`, `Jurl`, `IJurl`, `JurlProxyFallback`, `JurlCache`, `S3CachedValue`.
- `JurlUtil`, `URLUtil`, `QueryString`, `LoggableJurlContext`, `RedirectUtil`, `UserAgentUtil`.
- `AuthUtil`, `EncryptionUtil`, `IPUtil`, `IPLocationUtil`, `IPCache`, `PhoneUtil`, `PhoneCache`.
- `AWSLambdaJurl`, `ScrapflyAPI`, `ZenrowsAPI`.
- `HeadlessBrowserPool`, `ChromeOptions`, `CSSSelectors`.

Cloud, config, security, and integration helpers:

- `AWSAppConfigUtil`, `AWSBatchUtil`, `AWSSQSUtil`, `AWSSecretManagerUtil`, `AwsSNSUtil`.
- `CryptographyUtil` and Spring/config classes such as `ManagedResourcesConfig`, `S3ClientProvider`,
  `ThreadLocalS3ClientProvider`, and `R2ClientProvider`.
- `SlackUtil`, `EmailUtil`, `GmailUtil`, `GoogleAuthUtil`, `GoogleCalendarUtil`, `GoogleAnalyticsUtil`, `GooglePlacesUtil`, `GoogleSearchUtil`.
- `BingSearchUtil`, `FacebookUtil`, `FoursquareUtil`, `FlowUploadUtils`, `SMSUtil`, `TwitterUtil`.

Persistence/storage/cache helpers:

- `JDBCUtil`, `CSVUtil`, `FileUtil`, `S3Util`, `GoogleSheetsUtil`, and `GoogleSheetsReflectionUtils`.
- `DelegateChainCache`, `DelegateCompoundCache`, `RequestScopedCache`, `ThreadLocalCache`.
- `AssociationDefinitionCache`, `AliasableCachedRowSet`, `IOLog`.
- `Memoizer`, `Lazy`, `LazyMemoizer`, `RefreshingMemoizer`, `TimedReference`, `DeferredResult`, `ExpiringAnswer`.
- `MemcachedCache`, `SimpleORMCache`, `LettuceCache`, `RedisCache`, `RedisUrzaIdCache`, `MemcachedUrzaIdCache`.
- `UrzaCanonicalIdCache`, `IUrzaIdCache`, `CacheSerdePool`, `IPCache`, `PhoneCache`.
- SimpleORM/MAGA internals such as `BaseCache`, `Cache`, `CacheData`, `IndexCacheKey`, `TimedWaitCache`, `BaseSQLSerializer`, and `HistoryUtil`.

Language/concurrency helpers:

- `JSON`, `DOMUtil`, `TextUtil`, `ListUtil`, `MapUtil`, `Streams`.
- `ObjectsUtil`, `OptionalUtil`, `Exceptions`, `Retry`, `HttpRequestUtil`, `BigDecimalUtil`, `EnumerationUtil`.
- `StringOrListDeserializer`, `ByteArrayUTF8OrBase64Deserializer`, `ByteArrayUTF8Serializer`.
- `DayOfWeekUtil`, `LettuceUtil`, `MD5Util`, `QueueUtil`, `SleepUtil`, `ReflectionUtils`, `SObjectUtil`, `CurrencyUtil`.
- `HttpRequestUtil` helpers such as `parseLongIdLenient`, `getCommaDelimitedLongs`,
  `parseCommaDelimitedIds`, `fromCommaDelimited`, request-byte/body helpers, and quiet request attributes.
- `VavrTupleObjectSerializer`, `VavrTupleObjectDeserializer`, `PreferenceFetcher`.
- `Parallel`, `Pools`, `PearThreadPoolExecutor`, `PearAsyncWorkerPool`, `PearBatchingAsyncWorkerPool`, `DynamicBatchingAsyncWorkerPool`.
- `TrackedHybridExecutorPool`, `BoundedVirtualThreadPerTaskExecutor`, `BoundedWithFallbackExecutor`, `BoundedWithOverflowExecutor`.
- `BoundedWithFallbackThreadPoolExecutor`, `BoundedWithFallbackNewThreadExecutor`, `BoundedWithFallbackNewVirtualThreadExecutor`.
- `PearTomcatThreadPool`, `ThreadPoolStats`.
- `CompositeThreadPoolExecutor`, `SynchronousExecutorService`, `KeyedLock`, `KeyedLockedReference`, `CrossServerKeyedLock`, `Locks`, `LockedCloseable`.
- `ReadWriteLockList`, `ReadWriteLockArrayList`, `ReadWriteLockStack`, `ConcurrentLinkedDequeList`, `SoftPooledThreadLocalProvider`.

When a new helper is still justified, make the name specific, put it in the package where future readers will search,
add tests for edge cases, and migrate at least the nearby call site so the helper is proven useful.

### Helper-Level Synthesis

Pear Commerce helper preferences point to a few general rules:

- Centralize semantics that affect cacheability, null handling, parsing tolerance, SQL escaping, URL identity, and concurrency.
  These are not cosmetic utilities; they encode production knowledge.
- Keep domain logic one layer above transport helpers.
- Let a fetch helper decide whether a response is valid, retryable, and cacheable.
  Product matching and status classification should usually happen after the fetch returns a valid parsed object.
- Prefer typed helpers over generic string manipulation.
  Records, DTOs, `TypeReference`, tuple collectors, typed query strings, and typed cached values make failures easier to catch.
- Do not make tiny local caches or pools by reflex. Existing cache and pool helpers carry naming, metrics, bounds, keying, and shutdown behavior.
- Extend hot helpers carefully and test the edge case. Prefer improving one central helper, then updates call sites, instead of leaving many variants.
- Favor short, readable stream transforms for data reshaping. Keep imperative loops for stateful protocols and resource lifetimes.
- Be suspicious of helper code that catches too much, hides too much, or creates a second unofficial path for the same behavior.

## Java Checks

This repo uses Java 21, Gradle, Error Prone `2.41.0`, and Pear custom `errorprone-checkers`.

Pay special attention to:

- `CompletableFutureMissingExecutor`: provide an explicit executor.
- `ComplexLogicInGoThen`: keep retry/goThen logic simple, extract named helpers, and preserve retry/cache/memory semantics.
- `VavrTryGetOrNullWithoutOnFailure`: handle failures intentionally before `getOrNull`.
- `ComparisonContractViolated`.
- `ModifySourceCollectionInStream` and `ModifyCollectionInEnhancedForLoop`.
- `OptionalNotPresent`, `OptionalMapToOptional`, and impossible/null comparisons.
- `EmptyCatch`, `Interruption`, `ReferenceEquality`, `ThreadLocalUsage`, `NonAtomicVolatileUpdate`, and `JdkObsolete`.
- `BigDecimalEquals`, `ArrayAsKeyOfSetOrMap`, `FallThrough`, and `Finally`.

There is a GitHub workflow that compiles with Error Prone and uses reviewdog to comment on PR diffs.
Local warning silence is not enough if the PR path is not compiled or lint was skipped with `-PnoLint`.

## JS/TS/Frontend Checks

Pear JS repos vary by age:

- Legacy `api`, `offers`, and `admin` JS generally use Google ESLint style, 2-space indentation, `max-len` 200, and relaxed JSDoc rules.
- Modern dashboard repos use ESLint 9, Prettier, TypeScript, React hooks rules, and stricter typing such as `@typescript-eslint/no-explicit-any`.
- Cloudflare workers and Node APIs may have smaller script sets; follow the package scripts that exist.

For JS/TS PRs:

- Use the repo's scripts: `npm run lint`, `npm test`, `npm run build`, or the closest targeted script.
- Preserve existing framework style: AngularJS/gulp in legacy apps, Vite/React/MUI/Zustand in dashboard code,
  Express/CommonJS in `pear-dashboard-api`, and Worker conventions in Cloudflare workers.
- Avoid new `any` in TypeScript; model the data or add a narrow type.
- Prefer existing shared components, hooks, API clients, middleware, and parsing helpers.
- Reduce duplicated condition checks. Example: compute `cookieName` once, then read `cookies[cookieName]`, rather than repeating token lookup logic.
- Keep auth/middleware URLs and token sources pointed at the non-management/runtime endpoint when that distinction exists.
- Parse URLs with `new URL(...)`, stringify structured values with `JSON.stringify`, and avoid fragile string/selector hacks.
- Prefer stable selectors/state over generated or unstable class names.
- For frontend changes, verify the user-visible path when practical, especially null DOM elements, route matching,
  CORS/local dev behavior, loading states, stale cached data, and responsive layout.
- Keep UI changes scoped. Do not refactor a legacy Angular page or MUI flow just to touch one flag.
- Lazy-load expensive widgets, locators, partner API calls, or DOM observation after user intent or visibility.
  Do not construct a locator on every page render if the modal stays closed.
- For frontend/auth bugs, compare the API payload, localStorage/session state, selected company/vendor state, and rendered UI together. The UI symptom alone is rarely enough.
- Keep request params consistent across picker, locator, and preview flows. If one path now requires `countryCode`, send it from all equivalent paths.
- Use the right asset URL domain and protocol instead of string-fixing only the visible part of an S3 URL.
- Do not wrap an existing promise in `new Promise((resolve, reject) => promise.then(resolve).catch(reject))`.
  Return the promise or use `async`/`await`; wrappers like this can lose the return value and hide errors.
- In workers and Node fetch code, avoid full-body copies for large JSON.
  `await response.text()`, `JSON.parse`, `JSON.stringify`, and `response.clone()` can each duplicate memory; parse once, stream, range-fetch, or pass bytes through when possible.
- When comparing protobuf/custom serialization, native JSON, and network fanout, measure the real bottleneck.
  V8 JSON parsing can be fast enough that extra requests or extra copies cost more than the serialization format.
- Keep CDN/cache rules explicit: do not cache 4xx/5xx responses accidentally, and preserve `stale-while-revalidate` or other headers when the runtime depends on them.

Transfer these Java preferences into JS/TS like this:

- "Search before creating" means use existing hooks/components/middleware/helpers.
- "Services injectable" means avoid module-level mutable singletons when dependency injection, request locals, React context, or existing clients own the dependency.
- "Streams over loops" means prefer `map`, `filter`, `reduce`, `Object.fromEntries`, `flatMap`,
  and typed helper functions for pure data transforms, but use loops for side effects, async sequencing, and early exits.
- "Async explicitness" means do not fire-and-forget promises silently; `await`, return, queue, or intentionally log/catch them.
- "Async sequencing" means use loops for ordered/short-circuiting requests, `Promise.all` for all-or-nothing independent work,
  and `Promise.allSettled` or per-result wrapping when partial failure is a domain result.
- "Backpressure explicitness" means a queue, worker, or lambda is only safe after you know the consumer concurrency and retry/delete behavior.
- "Streaming" means fewer copies and less unnecessary work.
  It can mean Java streams, Node streams, Web Streams, R2 range reads, or simply parsing once into the smallest useful shape.
- "Null vs empty" means distinguish `undefined`, `null`, `[]`, `""`, and `0` in API and UI state.
- "Structured parsing" means use the platform APIs, stable JSON shapes, and typed DTOs instead of reaching through incidental strings or CSS class names.

Repo snippets:

```js
User: function ($api) {
    return $api.get("/v1/user").then(function (user) {
        return user;
    }, function () {
        return null;
    });
}
```

Return or await the real promise. Do not wrap this shape in a new `Promise` unless the code is adapting a callback API.

```js
const response = await fetch(argv._[0] || "https://www.pillsbury.com/recipe.xml");
const responseStr = await response.text()
const document = new jsdom.JSDOM(responseStr, { contentType: "text/xml" }).window.document;
const recipeUrls = [...document.querySelectorAll("url loc")].map(loc => loc.innerHTML);
```

Fetch once, parse once, and turn DOM collections into arrays before using array transforms.

```js
const recipeUrlChunks = _.chunk(recipeUrls, 50)

for (var i = 0; i < recipeUrlChunks.length; i++) {
    const _recipeUrls = recipeUrlChunks[i];
    const pillsburyProducts = (await Promise.all(_recipeUrls.map(async url => {
        try {
            const recipeJson = await (await fetch(
                `https://api.whisk.com/recipe/v2/get?id=${encodeURIComponent(url)}`
            )).json();
            return recipeJson.recipe.ingredients.map(ig => ig.text);
        } catch (e) {
            console.error(e);
            return [];
        }
    }))).flatMap(igs => igs || [])
}
```

Use `Promise.all` for independent bounded work only when the batch size is intentional.
Preserve per-item failures when partial success is useful.

```js
const waitForSelector = async (selector) => {
  while (!document.querySelector(selector)) {
    await timeout(500);
  }
  return document.querySelector(selector);
};
```

Keep loops for async polling, ordered browser automation, and early-exit DOM work.

## PR Repair Recipes

Use these when scanning a PR.

### If You See A New Utility

- Search for the same behavior.
- Move it to the existing utility class/module if it is general.
- Rename it if it is domain-specific.
- Add a low-level test.

### If You See A Loop

- If it builds a map, groups, filters, dedupes, or projects, consider a stream or JS array pipeline.
- If it mutates external state, saves entities, handles per-item exceptions, or scans a `ResultSet`, keep a loop or extract a helper.
- If it nests more than two levels, look for guard clauses or named intermediate collections.
- If it sends candidate HTTP/search requests and only needs the first match, keep it lazy with `findFirst`/`break`; do not collect every response first.
- If it uses `parallelStream()`, look for `Streams.parallelMap`, `Parallel.streamResults`, or an explicit executor instead.
- If it is in a hot path, count passes over the collection and avoid redundant sorting,
  repeated stream recomputation, or stream/loop mixtures that scan the same data several times.
- If the loop is clearer than a stream and not duplicating boilerplate, keep it. Streams are a readability tool here, not a speed requirement.

### If You See Async Work

- Find the executor, queue, pool, or promise owner.
- Add explicit executors to Java `CompletableFuture`.
- Avoid unbounded threads and implicit common pools.
- Treat `parallelStream()` as async work on the common pool; replace it with bounded helpers, batching, or a named executor when parallelism is truly needed.
- Use `saveAsync`/normal async save queues for entity saves.
- Make exception behavior visible.
- Check whether the caller should block, return a future, or fire background work.
- For SQS/SNS/Lambda or worker queues, verify consumer concurrency, retry policy, visibility timeout, and delete-on-timeout behavior before claiming there is backpressure.
- For JS/TS, return or `await` existing promises instead of wrapping them in a new promise.
- If the method returns a future/promise, put the slow or throwing work inside that future/promise.
- If the code submits work and then immediately waits, consider doing the work directly unless parallelism is real.
- If this is a queue/event loop, keep polling alive on ordinary runtime failures and let interruption/shutdown paths stay clear.
- Prefer repo async helpers and worker pools over custom blocking queues.
- Prefer `Parallel.allOf`, `Parallel.streamResults`, `Streams.awaitAll`, and `PearThreadPoolExecutor` over ad hoc future orchestration.
- Batch same-table DB writes when the storage layer wants batching more than parallelism.
- Make the caller's wait point explicit: built, saved, enqueued, acknowledged, or fully processed.
- When extracting async code, extract the synchronous work and let the caller create the `CompletableFuture` with the right executor.
- Use `PearThreadPoolExecutor` instead of `PearBatchingAsyncWorkerPool` when there is no batching.
- Use `submit` for background work and `submitAndBlockWhileQueued` only when blocking until queued work completes is intended.
- Use `completedFuture` when the value is already computed.
- Use `thenComposeAsync`/`thenApplyAsync` with the executor when a continuation belongs on a specific pool.
- Replace `join` with helpers or `get` paths that let the PR log/classify partial failures when that matters.

### If You See Fetching Or Loading

- Check the selected columns/entities.
- Check whether the query can be constrained by `vendorId`, `retailerId`, `storeId`, `zip`, country code, live/active flags, or source type.
- Group lookups to avoid one round trip per item.
- Avoid duplicate HTTP requests; keep the result or future and reuse it.
- Verify with the nearest real signal: admin inspector, captured browser request, endpoint response, logs, or replayable fixture.
- Do not bypass a broken fetch in a way that leaves the original call path silently broken for other inputs.
- Dedupe by the domain key.
- Prefer already-loaded entities, bulk ORM loads, and cache-aware helpers over repeated one-off ORM calls.
- Avoid `loadAll` or full-entity loads when IDs, cache dirty keys, or a streamed load are enough.
- For very large dirties/invalidation, load IDs or distinct index keys and dirty by key instead of hydrating all entities.
- Filter early before pairwise comparisons, geocoding, string normalization, or other expensive work.
- For widgets/frontend loads, defer expensive construction or network calls until the user-visible path needs them.
- For Worker/Node fetches, avoid full-body copies and parse/stringify round trips on large JSON. Range fetch, stream, or parse once where possible.
- If optimizing SQL load, change the query measured as hot and leave unrelated result-shaping queries alone unless the PR owns that semantic change.
- If the endpoint/helper already loaded the needed data, pass it forward rather than adding a second fetch.
- Keep format/canonicalization helpers from becoming validators. Add a separate helper for semantic validation or expansion.

### If You See Jurl Or External HTTP

- Decide whether an empty result is cacheable no-data or a failed fetch.
- Keep response validation inside `goThen` when jurlcache should only save successful validated responses.
- Preserve `goThen` semantics: returned object means success, `null` usually means retry,
  thrown failure means request failure, and empty domain result means cacheable no-data only when true.
- Use `throwOnNon200(true)` when non-200 means failure.
- Do not reuse a mutable Jurl instance when the code expects a fresh request object per proxy attempt.
- Prefer structured API/ld+json response data over CSS selectors when both are available.
- Log or throw `JurlException` when request details are needed for production debugging.
- Treat one JurlProxyFallback as one logical request. Use different inputs for different searches, not different fallback objects as a pseudo-loop.
- Cache valid no-match responses separately from UPC/item/domain matches.
- Include store, zip, itemId, group, headers, or body fields in the cache key only when they affect response content.
- Keep auth-only tokens out of cache keys unless they change the returned data.
- Add request/proxy/status/cache-hit dimensions before drawing conclusions from aggregate JurlCache error rates.
- Prefer `goBody(Class)`, `bodyJson(requestPojo)`, and typed DTOs over string request/response manipulation.
- Use `Optional.empty()` or an explicit sentinel intentionally when valid no-result needs to be cacheable.
- Whitelist success/no-result cases when high retry counts could otherwise retry persistent 2xx-4xx outcomes.

### If You See A Cache

- Require reason, busting story, kill switch, miss strategy, memory bound, and concurrency behavior.
- Prefer query improvement or dedupe if the cache only hides an avoidable load.
- Use `Optional` for cached misses when repeated misses are expensive.
- Watch for racey delete-then-recreate cache/Redis keys; a persistent "latest owner" marker can be safer.
- Do not copy app-config values into static constants unless one value per server startup is intended.
- Know whether invalidation is local, cross-server, S3-key-based, TTL-based, app-config-based, or explicit `invalidate(context)`.
- Check whether failures are cached intentionally. HTTP 4xx/5xx, timeout, invalid itemId, empty answer, and parse failure should not share one cache path.
- After direct DB/script changes, dirty every cache layer that can still hold the old value.

### If You See Status Changes

- Classify `INVALID`, `UNKNOWN`, and `UNAVAILABLE` using the domain definitions above.
- Return an explicit result for every UPC/store when metrics expect one.
- Do not hide bad data as a missing result.
- Keep expected invalid cases out of exception tracking unless they are truly unexpected.

### If You See Tests

- Make tests deterministic.
- Create needed data locally.
- Avoid network/scraper dependencies in unit tests.
- Keep slow/flaky markers justified.
- Verify the exact failure path when fixing an NPE, parser bug, status flip, or SQL escaping issue.
- If the code depends on Spring/resources in principle, use the Spring/API test base rather than a narrower base that only passes by accident.
- After import/annotation/build-file edits, run a compile/lint check even if the PR is "only" marking a test flaky.

### If You See Build Or Deploy Changes

- Verify the stage that consumes the dependency.
- Keep related shell commands together when that reduces layer cache size and still fails correctly with `&&`.
- Do not leave `|| true` around commands whose failure should stop a build.
- Prefer package-managed CLIs such as local `node_modules` binaries when that is the repo convention.
- For production deploy fixes, compare the old and new runtime image/environment directly, then watch the metric/log that originally proved failure.

### If You See A Production Incident Fix

- Keep the PR narrow enough to deploy safely.
- Preserve or add a rollback, kill switch, config disable, or placeholder path when possible.
- Include the stack trace, endpoint, query, or metric that proves the failure.
- Verify immediately after deploy with the same signal that found the bug.
- Ask whether failed work needs replaying and whether dashboards, DLQs, or logs caught it.

### If You See Try Or Exception Conversion

- Avoid `getOrNull()` unless an explicit preceding `onFailure` handles the failure.
- If swallowing an unchecked exception is intended, use an explicit catch or named ignored variable so lint/review can see it.
- Prefer `get`, `getOrElseThrow`, or `fold` when the caller needs to account for success vs failure.
- Convert expected domain failures to domain results; throw or track unexpected failures.
- Do not return empty lists from failure paths when the framework expects one result per UPC/store.

## High-Level Synthesis

Pear Commerce PR preferences cluster around a few principles:

- Be semantically honest. Do not collapse unknown, invalid, unavailable, empty, zero, null, failed, and skipped into one bucket.
- Make ownership obvious. Code that needs services should be in services; code that needs utility reuse should live in utilities;
  code that needs lifecycle coverage should live in the lifecycle path.
- Optimize the real bottleneck. Reduce round trips, duplicate HTTP calls, memory pressure, temporary tables,
  filesort, off-row columns, and unbounded async work before adding caches or broad config.
- Prefer small named surfaces. A precise helper, named record, stream grouping key, protected hook, or service method is better than a long method full of incidental branching.
- Treat production tools as part of correctness. Metrics, Sentry/Scalyr stack traces, app config kill switches, bounded pools, and reset endpoints are not afterthoughts.
- Keep PRs reviewable. A focused diff with tests and clear dataflow beats a clever refactor that makes reviewers reconstruct the entire system.
- Minimize existing-code surface area. Prefer new or clearly owned modules for most behavior, with only the essential hooks into shared utilities, registries, and call sites.
- Let lint and local style carry the boring parts. Fix Error Prone/ESLint issues early so review energy goes to behavior.
- Preserve compile-time help. Typed records, final template methods, annotations, Spring injection, DTOs,
  and explicit catches are valuable when they make illegal states harder to express.
- Keep cacheability separate from availability. A missing recipe, a 404 product, a proxy failure, a null upstream field,
  and bad source data may all look empty unless the code preserves why they are empty.
- Make expensive work visible. If something can create proxy cost, DB load, S3 writes, thread pressure, or stale CS-visible state,
  the code should show where that pressure is bounded and measured.
- Keep synchronization points explicit. "Queued", "future returned", "records streamed", "URZAs saved", and "results visible to caller" are different contracts.
- Use laziness as a load-control tool. Streams, loops, UI lazy loading, and cache hits are valuable when they prevent unnecessary requests
  or construction, not when they merely look modern.
- Treat missing observability as a product bug. If an exception, failed step, or missing result would not show up in the expected dashboard/log/DLQ,
  fix the signal as part of the PR or call out the gap.
- Bridge legacy code toward Spring and typed ownership without creating new legacy.
  Temporary `Resources` or static adapters are acceptable only when the real target remains injectable/testable.
- Optimize without changing meaning. A faster query, cache, batch, or async path is not an improvement
  if it changes which stores, zips, countries, statuses, or availability results are included.
- Prefer explicit contracts over incidental behavior. Cache keys, TTLs, null sentinels, async wait points,
  and status transitions should be visible at the call site or named in the helper.
- Use terse modern constructs when they reduce cognitive load. Streams, records, `Optional`, and futures are good when they reveal dataflow;
  they are bad when they hide cost, side effects, or failure.
- First remove unnecessary work. Prefer changes that reduce requests, round trips, wide loads,
  string copies, and duplicate saves before adding new caches or pools.
- Treat async as a load-bearing API design choice. The important questions are which pool owns the work,
  how much can queue, which failures survive, and what the caller can safely assume after return.
- Make concurrency legible before making it faster. A named bounded pool with metrics, an explicit queue consumer,
  or a returned future is easier to reason about than hidden common-pool work.
- Ask which layer owns backpressure. A stream, queue, lambda, worker, promise, or thread pool is only safe when its concurrency and retry behavior are visible.
- Make "no data" cacheable only when it is a real domain answer. A 404 product, empty recipe page, missing itemId,
  bad upstream body, and proxy failure should not share one empty path.
- Keep retry, cacheability, and domain matching separate.
  A response can be valid and cacheable while containing no requested UPC; a null upstream field can be retryable; a known bad itemId can be invalid without being an exception.
- Keep tests local to the contract being changed. Create data, parse captured responses, exercise lifecycle hooks,
  and prove SQL escaping or null behavior without depending on live partner state.
- Be conservative in production hot paths. Narrow, measured, reversible edits are better aligned with Pear Commerce production standards than broad cleanup
  when the loader, cache, scraper, deploy, or request path is already under pressure.
- Prefer changing the right interface over making every caller compensate. If the system wants all stores, all IDs,
  a typed result, or a future with a specific wait contract, expose that shape directly.
- Optimize bytes and copies, not only request count. Look for response-body copies, wide entity loads, redundant parsing, and oversized cache values.
- Treat local testability as part of code quality. If only one engineer can reproduce a resolver, scraper, startup path, or worker locally,
  improve the harness while fixing the bug.
- Use AI and automation as review multipliers. They are useful for breadth, stale suggestions, and lint-like issues,
  but the final standard is still code evidence, tests, and production signals.
- Keep helper purity useful. The best extracted helper usually does one synchronous thing and is easy to test;
  callers decide whether it runs inline, in a pool, behind a cache, or in a future.
- Prefer typed, inspectable surfaces over clever strings. DTOs, records, POJOs, query builders, and named cache keys make production behavior debuggable.
- Do not let generic helpers silently change meaning. Formatting, parsing, caching, and loading helpers should keep their old contracts
  unless the PR is explicitly about changing that contract.
- Make work disappear before making work parallel. Prefer pruning, reuse, cache hits, byte parsing, and one-pass loops before more threads.
- Treat "old code does it" as weak evidence. Old caches, static toggles, load paths, or external scraper configs can be copied only
  after their busting, ownership, and production behavior are still valid.

When improving a PR, do not merely mimic surface style.

Ask: "What data is being loaded, who owns this behavior, what happens on failure, what gets cached,
what work runs concurrently, who applies backpressure, and how will we know in production?"

## Output

At the end, report:

- What you changed.
- Which standards you applied.
- What checks you ran and their results.
- Any residual risk or follow-up that should be tracked.
