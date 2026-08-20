---
name: pear-metabase
description: Query Pear's Snowflake warehouse ad hoc through the Metabase API using the local API key. Covers the mb.py client, the query gotchas that waste the most time (uppercased columns, the 2,000-row cap, 504s on unbounded scans), and a map of the tables that actually matter — Pulse availability, Gong transcripts, HubSpot deals/companies/contacts, and the vendor/UPC/retailer chain. Use when asked to pull Pear data for analysis, answer a question from the warehouse, or debug a Metabase/Snowflake query outside Java.
---

# Pear Metabase → Snowflake

Ad-hoc analyst path. For Java code querying Snowflake via JDBC, use `snowflake-jdbc` instead.

## Credentials and client

- Credentials: `~/.config/pear-gtm/metabase.env`, mode 600, keys `METABASE_URL` and `METABASE_API_KEY`. If missing: `bash ~/setup-metabase-key.sh`.
- Client: `mb.py`, in the `pear-gtm` working repo — commonly `~/pear-gtm/mb.py`. Stdlib only, loads the env file itself. The key is read into memory and never printed or written to disk. Do not echo it. If the repo is elsewhere: `find ~ -maxdepth 3 -name mb.py -path '*pear-gtm*' 2>/dev/null`.
- **Snowflake is Metabase database id `13371339`.**

```bash
cd ~/pear-gtm
python3 mb.py whoami                                  # verify auth
python3 mb.py databases
python3 mb.py sql 13371339 "select current_warehouse()"
python3 mb.py sqlfile 13371339 sql/01_call_registry.sql
```

As a library:

```python
import mb
rows, cols = mb.native(13371339, "select 1")           # -> (rows, column_names)
print(mb.table(rows, cols))                            # aligned text table
```

## Gotchas that cost the most time

**`import mb` only works from the repo directory.** Otherwise `ModuleNotFoundError: No module named 'mb'`. Either `cd ~/pear-gtm` first or `sys.path.insert(0, str(Path.home() / "pear-gtm"))`.

**Snowflake uppercases unquoted column names.** `select foo` returns `FOO`. Lowercase before building dicts:

```python
rows, cols = mb.native(13371339, sql)
idx = {c.lower(): n for n, c in enumerate(cols)}
```

**Results cap around 2,000 rows.** A query that "returns everything" is silently truncated, which quietly corrupts any count you derive client-side. Aggregate in SQL — `group by`, `count_if`, `count(distinct …)` — instead of pulling rows and counting in Python.

**Unbounded scans of the huge tables 504.** `UPC_RETAILER_ZIP_AVAILABILITY_DAILY_UPDATES` is ~28B rows; a bare `min()/max()` over it times out at the nginx layer. Bound every query on such tables with a date predicate first (`where dateupdated >= dateadd(day,-14,current_date())`), then widen.

**`mb.table()` prints only the first 60 rows** by default (`limit=60`). Fine for eyeballing, wrong for anything you're counting. Count in SQL.

**Metabase reads a delayed replica.** Never verify a production write against it — see `mass-update-pear-pixels` and `pear-prod-jsp` for the live-primary path.

**Boolean columns often arrive as strings.** `iff(hidden, …)` fails with an IFF type error on `VARCHAR`. Use `lower(to_varchar(col)) = 'true'`.

## Table map

### Availability / Pulse
| Table | Notes |
|---|---|
| `PEAR_DB.RAW_DATA_MYSQL_DEV.UPC_RETAILER_ZIP_AVAILABILITY_DAILY_UPDATES` | ~28B rows, current. **A change log, not daily snapshots** — rows are written when availability changes, and only for UPCs explicitly configured for tracking. Absence of a row in a window ≠ no change; read the last row at or before the window start to know entry state. |
| `PEAR_DB.MYSQL_DEV.MYSQL_DEV__PULSE_INSTORE_CHANGES` | Store-level in-store availability with `INSTORESTATUS`, `START_DATE`/`END_DATE`, `DAYS_IN_STATUS`, `KNOWN_CARRY_LAST_90_DAYS`, `CURRENT_UNAVAILABILITY_90D`, `IS_CURRENT`. The 90-day columns need 90 days of history and read 0/false until then. |
| `PEAR_DB.MYSQL_DEV.MYSQL_DEV__PULSE_SHIPTOHOME_CHANGES` | Ship-to-home equivalent. A vendor missing from the in-store table may or may not be here — check both before concluding nothing was scanned. |
| `PEAR_DB.MYSQL_DEV.MYSQL_DEV__URSA_AVAILABILITY_HISTORY` | Store × item history with `FIRST/LAST_AVAILABLE_DATE`. The base URZA table is **overwritten daily** in production, so a full Snowflake replica of it is intentionally stale — do not read `URZA_ZIP_AVAILABILITY_CURRENT` as current. |

Duration analysis needs the change log, not `IS_CURRENT`. Point-in-time counts undercount badly: on one vendor, 87 store-SKUs were out of stock at a given moment while 346 had gone out at least once over three days, and 184 of the resolved outages lasted a single day.

### Vendor → UPC → retailer
| Table | Notes |
|---|---|
| `RAW_DATA_MYSQL_DEV.VENDOR` | ~3k brands. Has `NAME`, `DOMAIN`, `LIVE`, `COMPANYACCOUNTID`, `PULSECONFIGS`. |
| `RAW_DATA_MYSQL_DEV.UPC` | ~2.4M UPCs with `VENDORID`, `UPC`, `NAME`, `STATUS`, `SUBBRAND`. |
| `RAW_DATA_MYSQL_DEV.UPCRETAILERDATA` | ~69M UPC×retailer rows with `KNOWNCARRIES` / `KNOWNNOTCARRIES`. `RETAILERID` is frequently null even on resolved rows, so `count(distinct retailerid)` is not a coverage measure. |

Joining `UPC` and `UPCRETAILERDATA` in one aggregate fans out and inflates counts — count UPCs and retailer rows in separate queries.

### Gong
**Read [pear-gong-warehouse](../pear-gong-warehouse/SKILL.md) before writing any
Gong query.** The tables carry traps that cost about seven minutes and four
504s to rediscover: `CALL_TRANSCRIPTS` times out on a bare
`conversation_key` predicate unless paired with an `ETL_MODIFIED_DATETIME`
bound, the flatten cannot sit left of a `LEFT JOIN`, and
`CONVERSATION_PARTICIPANTS` has no `TITLE` column while its `SPEAKER_ID` is a
`NUMBER` rather than text. That skill has the working queries and measured
timings.

Orientation only: use **`GONG.GONG_DATA_CLOUD.*`** (the table is `CALLS`, not
`CALL`), not `PEAR_DB.RAW_DATA_GONG.*` — two of the latter's views
(`CONVERSATION_PARTICIPANTS`, `USERS`) declare fewer columns than the upstream
share returns and fail to compile on any select.
`CALL_TRANSCRIPTS.TRANSCRIPT` is a VARIANT array of monologues —
`[{speakerId, topic, sentences:[{start,end,text}]}]`.

**`affiliation = 'unclassified'` is external, not unknown.** Phone dial-ins get
two participant rows and affect ~15% of calls, often the decision-maker. Safe
rule: `company` = Pear, everything else external. Only `status = 'COMPLETED'`
calls have transcripts, and 100% of them do — filter on status rather than
chasing missing transcripts.

### HubSpot
| Table | Notes |
|---|---|
| `PEAR_DB.HUBSPOT.HUBSPOT__COMPANIES_UNNESTED` | `HUBSPOT_ID`, `COMPANY_NAME`, `COMPANY_INDUSTRY`, `PEAR_VENDOR_ID`, `ACTIVE_INACTIVE_STATUS`. No employee count — get that from the HubSpot API. |
| `PEAR_DB.HUBSPOT.HUBSPOT__DEALS_COMPANY_ID_UNNESTED` | Use `SINGLE_COMPANY_ID` to join. `DEAL_COMPANY_ID` is an ARRAY and joining on it throws `Can not convert parameter of type VARCHAR into expected type ARRAY`. |
| `PEAR_DB.HUBSPOT.HUBSPOT__DEALS_SUBSCRIPTION_PIPELINE` | Subscription Revenue pipeline, `PIPELINE_ID = 28268628`. |
| `PEAR_DB.HUBSPOT.HUBSPOT__CONTACTS` | Has `CONTACT_BUYING_ROLE` and `COMPANY_SIZE`, both sparsely populated. No job title — pull `jobtitle` from the HubSpot API. |

**Customer definition.** A customer is a company with a closed-won deal on pipeline `28268628`. An ex-customer is the same with `ACTIVE_INACTIVE_STATUS <> 'Active'`. Lifecycle stage is **not** reliable for this, and `ACTIVE_INACTIVE_STATUS` alone is not either — it is populated on companies that never bought.

```sql
select c.company_name, c.active_inactive_status,
       max(d.date_entered_closed_won_subscription_revenue_pipeline)::date won
from pear_db.hubspot.hubspot__companies_unnested c
join pear_db.hubspot.hubspot__deals_company_id_unnested d
  on to_varchar(d.single_company_id) = c.hubspot_id
where d.is_closed_won and d.pipeline_id = 28268628
group by 1, 2
```

Use `DATE_ENTERED_CLOSED_WON_SUBSCRIPTION_REVENUE_PIPELINE`; the unsuffixed `DATE_ENTERED_CLOSED_WON` is 100% null on that pipeline. **`amount` is not a real number** — the median is exactly $24,000 in every loss-reason bucket because it is a default stamped on deals. Use Maxio for contract values.

## See also

- `pear-gong-warehouse` — Gong transcripts, participants, and call metadata; the
  predicate trap and the working flatten query.
- `snowflake-jdbc` — the Java/JDBC path and its own uppercase-column trap.
- `pear-prod-jsp`, `mass-update-pear-pixels` — when a read must hit the live primary rather than the delayed replica.
