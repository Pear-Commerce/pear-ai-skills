---
name: pear-log-search
description: Search and investigate Pear application logs in the self-hosted VictoriaLogs/Grafana system. Use for production or test log searches, cross-environment incidents, request/Jurl debugging, error counts, field discovery, log-volume checks, oversized response-body retrieval, or whenever Pear code/workflows previously referenced Scalyr (now canceled — VictoriaLogs is the replacement). Use devops/logs.sh only for immediate single-instance tailing.
---

# Pear Log Search

Use VictoriaLogs as Pear's primary searchable log store. The human UI is [logs.intern.pearcommerce.com](https://logs.intern.pearcommerce.com), authenticated with Pear Google login. Grafana Explore includes natural-language-to-LogsQL search and a query-aware field/value sidebar.

## Choose The Access Path

- Use Grafana Explore when the user wants to see or interact with results. Set the time range in Grafana; do not put `_time` in AI prompts.
- Use `scripts/query-victorialogs.sh` for read-only agent searches, exact evidence, counts, field discovery, or automation. It resolves the current `victorialogs-intern` EC2 instance and queries VictoriaLogs locally through SSM.
- Use `api.pearcommerce.com/devops/logs.sh -e <env>` only for an immediate live tail from one instance, such as watching startup or a reproduction. It is not the default for historical or fleet-wide searches.
- Scalyr has been canceled and is no longer available. VictoriaLogs is the sole log search system. For agent-accessible queries from a terminal, use `$fetch-pear-logs` (session-cookie CLI) or the `scripts/query-victorialogs.sh` helper below (SSM-based).
- When the investigation started from a customer complaint, pair the log search with `$front-api`: search the brand in Front to get the customer's exact symptom description and timestamps, then use those to bound the LogsQL time range.

## Query Safely

Always bound the time range and result size. Start narrow, inspect field names/facets, then widen only if necessary. Avoid returning broad `responseBody`, `jurl_responseBody`, headers, or stack fields unless the investigation needs them.

Common LogsQL filters:

```text
service:="list-scraper"
environment:="PRODUCTION"
level:="error"
tag:="jurl"
jurl_status:="200"
jurl_domain:~"instacart\\.(com|ca)"
"connection refused"
```

Combine source filters with spaces or `AND`. Pipes transform results:

```text
service:="list-scraper" tag:="jurl" jurl_status:="200"
service:="catalog-ingester" level:="error" | stats by (environment) count() as errors
tag:="jurl" | stats by (jurl_status) count() as requests | sort by (requests desc)
```

Do not invent SQL syntax. LogsQL exact field matching uses `field:="value"`; stream filters use `{service="list-scraper"}`. Let Grafana's selected time range remain authoritative in the UI.

## CLI Examples

Run from the canonical skill directory or use the installed copy:

```bash
SKILL_DIR="${PEAR_AI_SKILLS_REPO:-$HOME/pear-ai-skills}/skills/pear-log-search"

"$SKILL_DIR/scripts/query-victorialogs.sh" \
  --query 'service:="list-scraper" level:="error"' \
  --start -30m --limit 100

"$SKILL_DIR/scripts/query-victorialogs.sh" \
  --endpoint facets \
  --query 'service:="list-scraper" tag:="jurl"' \
  --start -1h --facet-limit 30

"$SKILL_DIR/scripts/query-victorialogs.sh" \
  --endpoint field_values --field environment \
  --query '*' --start -24h --limit 1000
```

Supported endpoints are `query`, `hits`, `field_names`, `field_values`, and `facets`. The helper prints VictoriaLogs JSON/JSONL and refuses unbounded queries.

## Pear Field Conventions

- `service`: logical service such as `list-scraper`, `catalog-ingester`, `dashboard`, `jobs`, or `upc-resolution`.
- `environment`: Pear deployment/environment name. Discover current values instead of guessing capitalization.
- `level`: stored application level. Grafana's `detected_level` is presentation-derived and may be `unknown`; query `level` for Pear logs.
- `tag:="jurl"`: structured Jurl request logs. Useful fields include `jurl_method`, `jurl_status`, `jurl_url`, `jurl_domain`, `jurl_duration`, `jurl_proxy`, request/response headers, and request/response bodies.
- `source:="pear-remote-logger"`: logs shipped by `PearRemoteLogAppender`.
- `instance_id`, `container_id`, `version`, `trace_id`, and `span_id`: deployment and correlation fields.

Field counts in Pear's Grafana sidebar are distinct-value cardinalities, exact through 99. `100+` means the facet limit was reached; `many` means VictoriaLogs skipped an unbounded/high-cardinality or long-value facet. Selecting a field shows its top 30 values and hit counts.

## Oversized Jurl Bodies

VictoriaLogs keeps a bounded preview when an individual Jurl response is too large. The full gzip-compressed body is private in S3 for 14 days. Relevant fields are:

- `jurl_oversizedResponseBodyLink`
- `jurl_oversizedResponseBodyS3Uri`
- `jurl_oversizedResponseBodyDownloadCommand`
- `jurl_oversizedResponseBodyBytes`
- `jurl_oversizedResponseBodySha256`

Retrieve a body only when needed and authorized; it may contain customer or upstream data. Prefer the stored download command, which has this shape:

```bash
aws s3 cp 's3://pear-victorialogs-oversized-bodies-042357577846-us-east-1/response-bodies/...' - | gzip -dc
```

## Retention

- Hot searchable data: approximately seven days on the primary VictoriaLogs datasource.
- Completed daily partitions: archived to S3, then Glacier Deep Archive after 14 days, retained indefinitely.
- Older searches require restoring the UTC-day partition and using the `VictoriaLogs Archive` Grafana datasource. Follow the restore procedure in the `Pear-Commerce/victorialogs-intern` README; do not improvise S3 object mutations.

## Report Findings

State the exact time range, query, environments/services covered, and whether counts are exact, sampled, limited, or inferred. Include a few representative rows or aggregates, not a broad log dump. Treat missing logs as a possible ingestion/observability failure, not proof that the event did not happen.
