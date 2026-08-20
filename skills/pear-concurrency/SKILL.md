---
name: pear-concurrency
description: Parallel utility, thread pool patterns, KeyedLock, AtomicVelocityCounter, virtual vs platform threads, and timeout anti-patterns. Use when writing or reviewing any concurrent or async code.
---

## The Central Rule

**Always use `Parallel.getAll()` with a timeout. Never use `CompletableFuture.allOf().join()` or bare `future.get()` without a timeout parameter.**

```java
import com.pear.concurrency.Parallel;

List<Future<Result>> futures = tasks.stream()
    .map(task -> pool.submit(() -> processTask(task)))
    .toList();

// Correct
List<Result> results = Parallel.getAll(futures, TimeUnit.MINUTES.toMillis(5), true);

// Wrong — hangs forever
CompletableFuture.allOf(futures).join();
for (var f : futures) f.get();  // also wrong
```

`Parallel.java` is at `src/com/pear/concurrency/Parallel.java`.

## Thread Pool Creation

```java
// Bounded platform thread pool (CPU/I/O bound jobs)
PearThreadPoolExecutor pool = Parallel.createBoundedPlatformThreadPool(
    50, "my-pool", 6, true, false);

// Platform + virtual overflow (high-concurrency scraping)
PearThreadPoolExecutor pool = Parallel.createBoundedPoolWithOverflowExecutor(
    256, 1_000, "hybrid-pool", false, Thread.NORM_PRIORITY, true);

// Ad-hoc pool — always shut down in finally
PearThreadPoolExecutor pool = new PearThreadPoolExecutor(20, "task-pool");
try {
    ...
    Parallel.getAll(futures, timeout, true);
} finally {
    pool.shutdown();
}

// Reuse global background pool instead of creating a new one for single tasks
ExecutorService pool = Pools.global().getLowPriBackgroundPlatformExecutor();
```

## Default Parallelism Implementation (Per-Service Fan-In)

This is the default pattern for a singleton Spring service that consumes a queue or stream
(SQS consumers, import workers, batch processors). Each such service owns ONE bounded pool
sized from AppConfig, so per-server parallelism is tunable without a deploy.

```java
@Service
public class ExampleQueueService {
    private static final String FLAG = "example-queue";
    private static final String POOL_SIZE_KEY = "consumer-pool-size";
    private static final int DEFAULT_POOL_SIZE = 10;

    private final AWSAppConfigUtil appConfigUtil;
    private volatile PearThreadPoolExecutor workerPool;

    public ExampleQueueService(AWSAppConfigUtil appConfigUtil) {
        this.appConfigUtil = appConfigUtil;
    }

    // Pool size is AppConfig live-read but the pool is created once: resizing requires a restart.
    private PearThreadPoolExecutor workerPool() {
        PearThreadPoolExecutor current = workerPool;
        if (current == null) {
            synchronized (this) {
                current = workerPool;
                if (current == null) {
                    int size = Math.max(1, appConfigUtil.getIntegerNow(FLAG, POOL_SIZE_KEY, DEFAULT_POOL_SIZE));
                    current = Parallel.createBoundedPlatformThreadPool(size, "example-workers", false, false);
                    workerPool = current;
                }
            }
        }
        return current;
    }

    private void processBatch(Queue<Message> batch) {
        Parallel.submitAllAndBlockWhileQueued(workerPool(), batch.stream().map(this::process));
    }

    private Callable<Void> process(Message message) {
        return () -> { handle(message); return null; };
    }

    public void shutdown() {
        PearThreadPoolExecutor current = workerPool;
        if (current != null) {
            current.shutdown();
        }
    }
}
```

Rules:

- ONE pool per service, created once (double-checked lazy getter or in `startProcessor`); never create/shut pools in a loop.
- Size comes from injected `AWSAppConfigUtil.getIntegerNow(flag, key, default)`, default as the safe current value.
  Live-read on creation only — document that resizing needs a service restart.
- Fan in with `Parallel.submitAllAndBlockWhileQueued` — it backpressures the produce/receive loop at pool
  saturation instead of buffering unbounded work, so no extra semaphore or queue gate is needed.
- Size receive batches (e.g., SQS `maxNumberOfMessages`, max 10) to `min(poolSize, cap)` so the pool,
  not batching, is the concurrency control.
- Shut the pool down in the service's `shutdown()`.
- Do NOT hand-roll `new Thread(...)`, unbounded executors, or semaphores+gates when the bounded pool plus
  `submitAllAndBlockWhileQueued` already provides the bound.

Reference example: `UPCResolutionQueueService` (SQS FIFO consumer in api.pearcommerce.com) uses
`upc-resolution` / `sqs-consumer-pool-size`, default 10.

## Submit Helpers

```java
Parallel.submit(() -> doWork());                          // default pool
Parallel.submitAll(pool, callables);
Parallel.submitAndBlockWhileQueued(pool, callable);       // backpressure
Parallel.submitAllAndBlockWhileQueuedCF(pool, callables); // returns CFs

// Get first matching result, cancel others
T result = Parallel.submitAndGetAny(pool, callables,
    r -> r.isValid(), TimeUnit.SECONDS.toMillis(30), true);
```

## Virtual Thread Pinning — Avoid

Pinning causes: `synchronized` blocks, native methods, some blocking socket I/O.

```java
if (Thread.currentThread().isVirtual()) {
    return Parallel.virtual_AwaitOnPlatform(platformPool, () -> blockingOp(), timeout);
} else {
    return blockingOp();
}
```

## Keyed Locking

```java
import com.pear.concurrency.Locks;

Locks.GET_RESOURCE_LOCK.lock(key);
try {
    processUser(userId);
} finally {
    Locks.GET_RESOURCE_LOCK.unlockQuietly(key);
}
```

**KeyedLock is Caffeine-backed with time-based eviction.** If a lock entry is evicted between `lock()` and `unlockQuietly()`, the unlock silently operates on a different lock instance — broken mutual exclusion. Flag this risk when lock hold time could exceed the cache expiry.

## Request Deduplication

```java
KeyedLockedReference<String, Result> cache = new KeyedLockedReference<>(1000);
Result result = cache.compute(key, () -> expensiveOperation(itemId));
// Concurrent callers with the same key wait for the first to complete
```

## Cross-Server Distributed Lock

```java
CrossServerKeyedLock lock = new CrossServerKeyedLock();
if (lock.tryLock("global-task", Duration.ofMinutes(5))) {
    try { performGlobalTask(); } finally { lock.unlock("global-task"); }
}
```

## Progress Tracking

```java
AtomicVelocityCounter counter = new AtomicVelocityCounter();
counter.updateTarget(total);
// inside task:
if (counter.tick() % 1000 == 0)
    logger.info(STR."\{counter.getTicks()}/\{counter.getTarget()} ETA: \{counter.remainingTimeDisplay()}");
```

## Pool Sizing Guidelines

- CPU-bound: `availableProcessors() + 1`
- I/O-bound: `availableProcessors() * 10`
- Virtual threads: thousands (let the JVM schedule)

## Red Flags

- ❌ `CompletableFuture.allOf().join()` without timeout
- ❌ `future.get()` with no timeout parameter
- ❌ Thread pool created without `shutdown()` in finally
- ❌ `synchronized` block on a virtual thread
- ❌ Plain `boolean` for shared state (use `AtomicBoolean`)
- ❌ Unbounded pool with no backpressure
- ❌ Assuming `KeyedLock` entry survives for the full lock hold time
