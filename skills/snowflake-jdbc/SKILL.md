---
name: snowflake-jdbc
description: Snowflake JDBC gotchas for Pear Java code. Use when writing Java code that queries Snowflake via JDBC, debugging Snowflake connection or query issues, or reviewing code that uses JDBCUtil.getConnectionSnowflake().
---

# Snowflake JDBC Gotchas

## Column Names Are Uppercase

Snowflake normalizes unquoted column aliases to **uppercase**. A query like:

```sql
SELECT upcId, retailerId AS retailerId FROM ...
```

returns column labels `UPCID` and `RETAILERID` in the `ResultSet`, not `upcId` and `retailerId`.

`ResultSet.getString("upcId")` will throw `SQLException: Column not found`. Use uppercase:

```java
// Wrong — throws Column not found
rst.getString("upcId")

// Correct
rst.getString("UPCID")
```

This applies to all aliases including `CONCAT(...) AS pk` — the label becomes `PK`.

## Connection Pool

Snowflake connections come from `JDBCUtil.getConnectionSnowflake()`, backed by a HikariCP pool configured in `Persistence.java`:

- Max pool size: 100
- Min idle: 25
- Leak detection threshold: 300,000ms (5 minutes)
- Connection init SQL: `ALTER SESSION SET TIMEZONE='UTC'`

Long-running queries that hold a connection for more than 5 minutes will trigger HikariCP's "Apparent connection leak detected" warning. This is expected for bulk sync operations and is not an actual leak if the connection is properly closed via try-with-resources.
