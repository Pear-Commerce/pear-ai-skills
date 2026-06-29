# Connection Bootstrap — Python and Java

The Node helper (`templates/scripts/db-connect.mjs`) is the primary template and mirrors the Pear dashboard API exactly. Use these equivalents when the intern app is Python or Java. All three read the **same** Secrets Manager secret shape (`{engine, host, port, dbname, username, password}`) and respect the same env-var overrides.

## Env-var reference (all runtimes)

| Var | Required | Default | Purpose |
|---|---|---|---|
| `DB_SECRET_ID` | yes | — | Secrets Manager secret id, e.g. `intern-app-<app>-db` |
| `AWS_REGION` / `AWS_DEFAULT_REGION` | no | `us-east-1` | AWS region for the secret fetch |
| `DB_SSL` | no | `true` | Enable TLS. Leave on for the public endpoint. |
| `DB_SSL_REJECT_UNAUTHORIZED` | no | `true` | Verify the server certificate |
| `MYSQL_HOST` | no | from secret | Overrides `secret.host` |
| `MYSQL_DATABASE` | no | from secret | Overrides `secret.dbname` |
| `MYSQL_USER` | no | from secret | Overrides `secret.username` |
| `MYSQL_PASSWORD` | no | from secret | Overrides `secret.password` |
| `MYSQL_CONNECTION_LIMIT` | no | `10` | Pool size |
| `MYSQL_CONNECT_TIMEOUT_MS` | no | `10000` | Connect timeout (ms) |

## Python (pymysql + boto3)

Dependencies:

```bash
pip install pymysql boto3
```

`scripts/db_connect.py`:

```python
"""Pear intern app — MySQL connection bootstrap (Python).

Same secret flow as the Pear dashboard API. Fetches credentials from
AWS Secrets Manager and exposes a pooled connection via DBUtils.
"""
import json
import os
import threading

import boto3
from dbutils.pooled_db import PooledDB
import pymysql

_pool = None
_lock = threading.Lock()
_credentials = None


def get_pool():
    global _pool
    if _pool is None:
        with _lock:
            if _pool is None:
                _pool = PooledDB(
                    creator=pymysql,
                    maxconnections=int(os.getenv("MYSQL_CONNECTION_LIMIT", "10")),
                    host=_credentials_value("host"),
                    port=int(_credentials_value("port", 3306)),
                    user=_credentials_value("user"),
                    password=_credentials_value("password"),
                    database=_credentials_value("database"),
                    connect_timeout=int(os.getenv("MYSQL_CONNECT_TIMEOUT_MS", "10000")) // 1000,
                    ssl=_ssl_config(),
                    charset="utf8mb4",
                    autocommit=True,
                )
    return _pool


def query(sql, args=None):
    conn = get_pool().connection()
    try:
        with conn.cursor() as cur:
            cur.execute(sql, args or ())
            return cur.fetchall()
    finally:
        conn.close()


def _credentials_value(key, fallback=None):
    creds = _load_credentials()
    env_map = {
        "host": "MYSQL_HOST",
        "port": None,
        "user": "MYSQL_USER",
        "password": "MYSQL_PASSWORD",
        "database": "MYSQL_DATABASE",
    }
    env_name = env_map.get(key)
    if env_name and os.getenv(env_name):
        return os.getenv(env_name)
    return creds.get(key, fallback)


def _load_credentials():
    global _credentials
    if _credentials is not None:
        return _credentials
    region = os.getenv("AWS_REGION") or os.getenv("AWS_DEFAULT_REGION") or "us-east-1"
    secret_id = os.environ["DB_SECRET_ID"]
    client = boto3.client("secretsmanager", region_name=region)
    raw = client.get_secret_value(SecretId=secret_id)["SecretString"]
    secret = json.loads(raw)
    _credentials = {
        "host": secret.get("host") or secret.get("hostname"),
        "port": secret.get("port", 3306),
        "user": secret.get("username") or secret.get("user"),
        "password": secret.get("password") or secret.get("pass"),
        "database": secret.get("dbname") or secret.get("database") or secret.get("db"),
    }
    return _credentials


def _ssl_config():
    if str(os.getenv("DB_SSL", "true")).lower() in ("0", "false", "off", "no"):
        return None
    return {"ssl": {}}
```

Usage:

```python
from scripts.db_connect import query
rows = query("SELECT 1 AS ok")
```

> For high-concurrency apps, `DBUtils.PooledDB` is the standard Python pool. For simpler apps, a single reconnecting `pymysql.connect(..., cursorclass=pymysql.cursors.DictCursor)` with `conn.ping(reconnect=True)` before each query is acceptable.

## Java (HikariCP + AWS SDK v2 + mysql-connector-j)

Dependencies (Maven):

```xml
<dependency>
  <groupId>com.zaxxer</groupId>
  <artifactId>HikariCP</artifactId>
  <version>5.1.0</version>
</dependency>
<dependency>
  <groupId>software.amazon.awssdk</groupId>
  <artifactId>secretsmanager</artifactId>
  <version>2.25.0</version>
</dependency>
<dependency>
  <groupId>com.mysql</groupId>
  <artifactId>mysql-connector-j</artifactId>
  <version>8.4.0</version>
</dependency>
<dependency>
  <groupId>com.fasterxml.jackson.core</groupId>
  <artifactId>jackson-databind</artifactId>
  <version>2.17.0</version>
</dependency>
```

`src/main/java/com/pear/intern/db/InternDb.java`:

```java
package com.pear.intern.db;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.secretsmanager.SecretsManagerClient;
import software.amazon.awssdk.services.secretsmanager.model.GetSecretValueRequest;

/** Pear intern app — MySQL connection bootstrap (Java).
 * Same secret flow as the Pear dashboard API. Exposes a shared HikariCP
 * pool backed by credentials from AWS Secrets Manager. */
public final class InternDb {

    private static final HikariDataSource DATA_SOURCE = build();

    private InternDb() {}

    public static HikariDataSource dataSource() {
        return DATA_SOURCE;
    }

    public static java.sql.Connection connection() throws java.sql.SQLException {
        return DATA_SOURCE.getConnection();
    }

    private static HikariDataSource build() {
        try {
            JsonNode secret = loadSecret();
            HikariConfig cfg = new HikariConfig();
            cfg.setJdbcUrl("jdbc:mysql://" + host(secret) + ":" + port(secret) + "/" + database(secret));
            cfg.setUsername(user(secret));
            cfg.setPassword(password(secret));
            cfg.setMaximumPoolSize(Integer.parseInt(envOr("MYSQL_CONNECTION_LIMIT", "10")));
            cfg.setConnectionTimeout(Long.parseLong(envOr("MYSQL_CONNECT_TIMEOUT_MS", "10000")));
            cfg.addDataSourceProperty("useSSL", sslEnabled());
            cfg.addDataSourceProperty("requireSSL", sslEnabled());
            cfg.addDataSourceProperty("verifyServerCertificate",
                envOr("DB_SSL_REJECT_UNAUTHORIZED", "true"));
            return new HikariDataSource(cfg);
        } catch (Exception e) {
            throw new RuntimeException("Could not bootstrap intern DB pool", e);
        }
    }

    private static JsonNode loadSecret() throws Exception {
        String region = envOr("AWS_REGION", envOr("AWS_DEFAULT_REGION", "us-east-1"));
        String secretId = System.getenv("DB_SECRET_ID");
        if (secretId == null || secretId.isBlank()) {
            throw new IllegalStateException("DB_SECRET_ID is not set");
        }
        try (SecretsManagerClient client = SecretsManagerClient.builder()
                .region(Region.of(region)).build()) {
            String raw = client.getSecretValue(
                GetSecretValueRequest.builder().secretId(secretId).build()
            ).secretString();
            return new ObjectMapper().readTree(raw);
        }
    }

    private static String host(JsonNode s) {
        return envOr("MYSQL_HOST", text(s, "host", "hostname"));
    }
    private static int port(JsonNode s) {
        String env = System.getenv("MYSQL_PORT");
        if (env != null && !env.isBlank()) return Integer.parseInt(env);
        return s.has("port") ? s.get("port").asInt() : 3306;
    }
    private static String user(JsonNode s) {
        return envOr("MYSQL_USER", text(s, "username", "user"));
    }
    private static String password(JsonNode s) {
        return envOr("MYSQL_PASSWORD", text(s, "password", "pass"));
    }
    private static String database(JsonNode s) {
        return envOr("MYSQL_DATABASE", text(s, "dbname", "database", "db"));
    }
    private static boolean sslEnabled() {
        return !"false".equalsIgnoreCase(envOr("DB_SSL", "true"));
    }

    private static String envOr(String name, String fallback) {
        String v = System.getenv(name);
        return (v == null || v.isBlank()) ? fallback : v;
    }
    private static String text(JsonNode s, String... keys) {
        for (String k : keys) {
            JsonNode n = s.get(k);
            if (n != null && !n.asText().isEmpty()) return n.asText();
        }
        return null;
    }
}
```

Usage:

```java
try (Connection conn = InternDb.connection();
     PreparedStatement ps = conn.prepareStatement("SELECT 1 AS ok");
     ResultSet rs = ps.executeQuery()) {
    rs.next();
    System.out.println(rs.getInt("ok"));
}
```

## Notes on the secret shape

All three helpers expect the secret JSON written by Step 3 of the skill:

```json
{
  "engine": "mysql",
  "host": "pear-intern-db.<account>.us-east-1.rds.amazonaws.com",
  "port": 3306,
  "dbname": "intern_<app>",
  "username": "intern_<app>",
  "password": "<random>"
}
```

This is the same shape as the dashboard API's `prod-db-10-2025` secret (which has `{dbClusterIdentifier, engine, host, password, port, username}`). The helpers tolerate alias keys (`user`/`username`, `pass`/`password`, `db`/`database`/`dbname`) so a future migration to AWS-managed rotation (the `rds!cluster-...` format) will not break them.
