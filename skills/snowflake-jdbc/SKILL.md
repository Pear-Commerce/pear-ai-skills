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

## Secret Role Parameters (Last-One-Wins)

`Persistence.java` builds the JDBC URL from the `jdbc_url` key of the `snowflake-2025-12-01` Secrets Manager secret. That URL currently contains **two** `role` parameters:

```text
jdbc:snowflake://sfb24665.us-east-1.snowflakecomputing.com/?warehouse=PEAR_WH&db=PEAR_DB&role=PEAR_DASHBOARD_ROLE&schema=RAW_DATA_MYSQL_DEV&role=ACCOUNTADMIN
```

JDBC last-wins means the effective role is **ACCOUNTADMIN**, not `PEAR_DASHBOARD_ROLE`. `PEAR_DASHBOARD_ROLE` is not granted to `pear_snowflake_user`, so any connection that actually applies it fails with `250001 (08001): Role 'PEAR_DASHBOARD_ROLE' ... is not granted to this user`. Do not "fix" code by forcing `role=PEAR_DASHBOARD_ROLE` unless a Snowflake admin has granted it first; mirror the secret's last-wins role instead.

## CLI Access (`snow`)

Workstation CLI access works via Snowflake CLI (`snow`, installed under Homebrew). Key facts verified 2026-08-20:

- Config file on macOS lives at `~/Library/Application Support/snowflake/config.toml` — **not** `~/.config/snowflake/`. `snow connection list --debug` prints the exact path being read when in doubt.
- The connection entry should have `account = "sfb24665"`, `region = "us-east-1"`, `user`/`password` from the `snowflake-2025-12-01` secret (keys: `jdbc_url`, `username`, `password`), `database = "PEAR_DB"`, `schema = "RAW_DATA_MYSQL_DEV"`, `warehouse = "PEAR_WH"`, `role = "ACCOUNTADMIN"`, and **no `host`/`port` keys**. A stale `host = "localhost"` / `port = "8000"` pair (a long-dead local tunnel) is the historic failure signature — connection-refused with everything else correct. Delete those keys rather than starting a tunnel; the SaaS endpoint `sfb24665.us-east-1.snowflakecomputing.com:443` is directly reachable from workstations.
- Refresh credentials by writing them from the secret straight into the config (never echo them): `aws secretsmanager get-secret-value --secret-id snowflake-2025-12-01 --query SecretString --output text | jq -r '.username | @json'`. Keep the config `chmod 600`.
- Verify with: `snow sql -q "select current_account(), current_user(), current_role(), current_warehouse()" --format json`.
