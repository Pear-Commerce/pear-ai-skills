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

## Streaming Large Result Sets

Use `PreparedStatement.setFetchSize()` to control JDBC cursor buffering. This does not limit the result set — it controls how many rows the driver buffers from the cursor at a time:

```java
try (Connection conn = JDBCUtil.getConnectionSnowflake();
     PreparedStatement stmt = conn.prepareStatement(sql)) {
    stmt.setFetchSize(10000);
    try (ResultSet rst = stmt.executeQuery()) {
        while (rst.next()) {
            // process row
        }
    }
}
```

Do not use `JDBCUtil.executeQueryToConnectedRowset_MUST_CLOSE_ResultSet_AND_Statement` — it is deprecated. Use plain `PreparedStatement` + try-with-resources instead.

## Checking Snowflake Connectivity

Before running Snowflake queries, check if the server is actually connected to Snowflake (not aliased to MySQL):

```java
if (!JDBCUtil.isTargettingRealSnowflake()) {
    return; // skip on dev/local environments
}
```

## QUALIFY Clause

Snowflake supports `QUALIFY` for filtering on window functions without a subquery wrapper:

```sql
SELECT retailerid, storeid, countrycode
FROM raw_data_mysql_dev.store
WHERE live = 1
QUALIFY ROW_NUMBER() OVER (PARTITION BY retailerid, storeid ORDER BY id DESC) = 1
```

This is a Snowflake extension — not standard SQL, will not work in MySQL.

## JSP Compatibility

JSP files do not support Java text blocks (`"""..."""`). Use string concatenation for SQL in JSP files. Text blocks are fine in `.java` files.
