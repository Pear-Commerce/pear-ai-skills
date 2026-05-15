---
name: pear-jobs
description: Quartz job patterns — PearScheduledJob/PearSimpleIntervalJob structure, AtomicBoolean guards, Parallel.getAll() timeouts, AppConfig toggles, and anti-patterns. Use when writing or reviewing any scheduled job.
---

## Job Base Classes

| Class | Use for |
|---|---|
| `PearScheduledJob` | Cron or `SimpleScheduleBuilder` based |
| `PearSimpleIntervalJob` | Fixed-interval; override `executionFrequency()` (seconds) |

```java
@Component
public class MyJob extends PearScheduledJob {
    @Override public ScheduleBuilder<? extends Trigger> getSchedule() {
        return CronScheduleBuilder.cronSchedule("0 0 2 * * ?");
    }
    @Override public boolean allowLocal() { return true; }
    @Override public boolean runOnAllBoxes() { return false; }
    @Override public void execute(JobExecutionContext ctx) throws JobExecutionException { ... }
}
```

## Preventing Concurrent Runs — AtomicBoolean (required)

```java
private static final AtomicBoolean running = new AtomicBoolean(false);

@Override public void execute(JobExecutionContext ctx) throws JobExecutionException {
    if (!running.compareAndSet(false, true)) return;
    try {
        processData();
    } finally {
        running.set(false);
    }
}
```

❌ **Never use plain `boolean running`** — race condition between check and set.

## Timeout Handling — Parallel.getAll() (required)

```java
List<Future<Void>> futures = retailers.stream()
    .map(r -> pool.submit(() -> { processRetailer(r); return null; }))
    .toList();

int timeoutMinutes = awsAppConfigUtil().getIntegerNow("partner-configs", "retailer-job-timeout-minutes", 60);
Parallel.getAll(futures, TimeUnit.MINUTES.toMillis(timeoutMinutes), true);
```

❌ **Never use `CompletableFuture.allOf(futures).join()`** — no timeout, can hang indefinitely.

## Thread Pool Pattern

```java
PearThreadPoolExecutor pool = new PearThreadPoolExecutor(20, "my-job-pool");
try {
    List<Future<Void>> futures = items.stream()
        .map(item -> pool.submit(() -> { process(item); return null; }))
        .toList();
    Parallel.getAll(futures, TimeUnit.HOURS.toMillis(2), true);
} finally {
    pool.shutdown();  // always in finally
}
```

## AppConfig Toggles

```java
boolean enabled = awsAppConfigUtil().getBooleanNow("job-toggles", "my-job-enabled", true);
if (!enabled) return;

int batchSize = awsAppConfigUtil().getIntegerNow("job-configs", "my-job-batch-size", 100);
```

## Progress Tracking

```java
AtomicVelocityCounter counter = new AtomicVelocityCounter();
counter.updateTarget(items.size());
// inside pool task:
long ticks = counter.tick();
if (ticks % 100 == 0)
    logger.info(STR."\{counter.getTicks()}/\{counter.getTarget()} ETA: \{counter.remainingTimeDisplay()}");
```

## Red Flags

- ❌ Plain `boolean` running flag
- ❌ `CompletableFuture.allOf().join()` (no timeout)
- ❌ Thread pools created but never `shutdown()`
- ❌ Hard-coded config values (use AppConfig)
- ❌ Synchronous saves in tight loops (use `orm.saveAsyncWithBackpressure()`)
