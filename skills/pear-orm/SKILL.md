---
name: pear-orm
description: PearSimpleORM patterns — load/save/query/async-batch syntax, caching, ID generation, and anti-patterns. Use when writing or reviewing any database access code.
---

**DO NOT suggest Hibernate, JPA, Spring Data, or any standard ORM. This codebase uses PearSimpleORM exclusively.**

## Core Operations

```java
@Autowired PearSimpleORM orm;

// Load by ID
UPC item = orm.load(UPC.class, upcId);

// Load single with WHERE
Store store = orm.loadSingleWhere(Store.class, "retailerId = ? and storeId = ?", retailer.id, storeId);

// Load single with extra SQL
ApiLocateItemTask task = orm.loadSingleWhereExtra(
    ApiLocateItemTask.class, false,
    "end IS null AND UPC = ?", "ORDER BY start desc", upcCode);

// Load multiple
List<UPC> upcs = orm.loadWhere(UPC.class, "id IN (?)", ids);

// Save
orm.save(entity);
orm.saveAsync(entity);                    // returns CompletableFuture<Void>
orm.asyncSaveObjects(listOfEntities);     // fire-and-forget batch
orm.saveAsyncWithBackpressure(entities);  // blocks when queue full
```

## Async Save Architecture

Entities are queued to per-class `PearBatchingAsyncWorkerPool`. Within a batch, duplicates by primary key are deduplicated, and entities are sorted by ID to reduce deadlock risk. In-flight saves for the same key are deduplicated — waiting callers chain on the existing CompletableFuture.

**Batch size overrides** (defaults to 150):
- `UPCRetailerZipAvailability` → 150 (450 on async envs)
- `AvailabilityLogRow` → 120, `Store` → 50, `PearSession` → 10, `PageLoad` → 5

**Batch timeout**: 5 s (prod), 15 s (other envs). `PageLoad` → 100 ms.

## Association Management

```java
List<Store> stores = orm.loadAssociation(retailer, "stores");
orm.addAssociation(upc, store, "stores");
orm.deleteAssociation(upc, store, "stores");
```

## Entity Annotations

```java
@SimpleORMTimestampID   // client-side ID (Snowflake-like); affects batch size bucket
public class MyEntity extends PearEntity { public Long id; ... }
// No annotation → server auto-increment ID
```

`onSave()` / `onLoad()` hooks called automatically around persistence operations.

## Entity Response Serialization

PearEntity response serialization is not ordinary Jackson field serialization. Production API paths may serialize entities through SimpleORM, which emits only `id` and `@SimpleORMField` fields.

Strict rule: never put any value the client must receive on a `PearEntity` as `transient`. `transient` fields are not reliable JSON response fields, and `@JsonProperty` or a passing local `ObjectMapper` test does not make them safe in real PearEntity endpoint responses. Use an explicit response DTO or mapper for hydrated/computed/UI-only fields. Add `@SimpleORMField` only when the value is intentionally persisted schema.

## Delete

```java
entity.queuedForDeletion = true;
orm.saveAsync(entity);   // deleted during batch processing
// or:
orm.delete(entity);
```

## Common Pitfalls

- ❌ Synchronous `orm.save()` in tight loops — use `saveAsyncWithBackpressure()`
- ❌ Ignoring the `CompletableFuture` from `saveAsync()` when you need completion
- ❌ JPA/Hibernate annotations (`@Entity`, `@Table`, `@Column`, etc.)
- ❌ `CompletableFuture.allOf(...).join()` without timeout after bulk async saves — use `Parallel.getAll()`
