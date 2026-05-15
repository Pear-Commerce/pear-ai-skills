---
name: pear-proxy
description: JurlProxyFallback and Jurl HTTP patterns — proxy Type ordering, circuit breakers, Vavr Try error handling, virtual-thread pinning avoidance, and request deduplication. Use when writing or reviewing scraping/HTTP code.
---

## Key Files

- `src/com/alexwyler/jurl/Jurl.java` — Core HTTP client (Apache HttpClient wrapper)
- `src/com/pear/http/JurlProxyFallback.java` — Proxy fallback, circuit breakers, Type enum
- `src/com/alexwyler/jurl/LoggedJurl.java` — Logging + proxy-aware wrapper

## Proxy Types (JurlProxyFallback.Type enum)

Direct → `NO_PROXY`  
Datacenter → `STATIC`, `ISP`  
Residential → `RESIDENTIAL`, `RESIDENTIAL_GEO`, `RESIDENTIAL_WALMART`  
BrightData → `UNBLOCKER`, `UNBLOCKER_STATE`, `UNBLOCKER_GEO`  
ZenRows → `ZENROWS_DATACENTER_SCRAPE`, `ZENROWS_RESIDENTIAL_SCRAPE`, `ZENROWS_DATACENTER_RENDER`, `ZENROWS_RESIDENTIAL_RENDER`  
Scrapfly → `SCRAPEFLY_DATACENTER_SCRAPE_GEO`, `SCRAPEFLY_RESIDENTAL_SCRAPE_GEO`, and others  
Special → `PHANTOMCLOUD`, `WALMART`

**ZenRows RENDER types** (`*_RENDER`) execute JavaScript — required for Akamai-protected JSON APIs (e.g. `api.shoppersdrugmart.ca`). Direct scrape returns RESP001 from ZenRows.

## Weighted Proxy Selection

```java
// Example — higher weight = more likely selected
Map<Type, Integer> weights = Map.of(
    Type.STATIC, 200,
    Type.ZENROWS_DATACENTER_SCRAPE, 400,
    Type.ZENROWS_RESIDENTIAL_SCRAPE, 200,
    Type.UNBLOCKER, 200,
    Type.RESIDENTIAL, 50
);
List<Type> order = weightedRandom(weights, num);
```

Redis queue `jpf-proxy-history-{featureHash}` tracks `(Type, success)` for dynamic success-rate-based ordering.

## Vavr Try Pattern

```java
import io.vavr.control.Try;

Try<LoggedJurl> result = Try.of(() -> {
        LoggedJurl jurl = jurlSupplier.get();
        configureProxy(jurl, proxyType);
        return jurl.go();
    })
    .onFailure(e -> { recordProxyResult(proxyType, false); logFailure(e, proxyType); })
    .onSuccess(j -> recordProxyResult(proxyType, true))
    .recover(throwable -> handleFallback(throwable));
```

`Try`, `Tuple2–4` are the main Vavr types used. Tuples are immutable — `._1`, `._2`, etc.

## Circuit Breakers (Resilience4j)

```java
CircuitBreaker cb = CircuitBreaker.of("scrapfly-concurrency", () ->
    CircuitBreakerConfig.custom()
        .failureRateThreshold(20)
        .minimumNumberOfCalls(1)
        .slidingWindowSize(5)
        .waitDurationInOpenState(Duration.ofSeconds(2))
        .recordExceptions(Scrapfly429Exception.class)
        .build());
```

When a circuit breaker is tripped by prior errors during development, disable it with `.enableZenrowsCircuitBreaker(false)`.

## Virtual Thread Pinning — Avoid in HTTP I/O

```java
// In Jurl.java — delegates blocking socket I/O to a platform thread pool
if (awaitOnPlatformForHttpConnection()) {
    response = Parallel.virtual_AwaitOnPlatform(
        HTTP_EXECUTE_PLATFORM_YIELDER(),
        execute,
        (timeout > 0 ? timeout : 15_000) * 2);
} else {
    response = execute.call();
}
```

`synchronized` blocks and native methods also pin virtual threads. Delegate those to platform pools.

## Request Deduplication

```java
// Concurrent identical requests share one in-flight result
KeyedLockedReference<Tuple3<String, String, String>, LoggedJurl>
    LOCKED_CALL_RESULTS = new KeyedLockedReference<>(1_000);
```

## Concurrency Limiting

```java
// Limits concurrent Scrapfly requests to 200
LinkedBlockingQueue<String> SCRAPFLY_CONCURRENCY_QUEUE = new LinkedBlockingQueue<>(200);
```

## Hard Timeout Enforcement

```java
// Jurl schedules an abort() if request exceeds timeout
jurl.timeout(5000).hardEnforceTimeout(true);
```

## Response Body — Memory

Large response bodies use `WeakReference` to allow GC pressure to reclaim them. Use `.skipHeap()` for file-based responses.

## Red Flags

- ❌ Direct scrape against Akamai-protected JSON APIs without a RENDER type
- ❌ Blocking I/O on virtual threads without `virtual_AwaitOnPlatform()`
- ❌ Raw try-catch instead of Vavr Try composition
- ❌ Ignoring circuit breaker state when hitting repeated 403/429 errors
- ❌ No hard timeout when scraping external services
