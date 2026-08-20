---
name: pear-gong-warehouse
description: Query Gong call data — transcripts, participants, call metadata — from Pear's Snowflake warehouse through Metabase. Covers the working flatten query for transcripts, the predicate trap that 504s any conversation_key filter, the columns that do not exist despite being documented elsewhere, and how to map a Gong web/API call id to a warehouse conversation_key. Use when asked to pull a call transcript, analyze what was said on a sales call, score calls against a framework, or do any analysis over Gong data at scale.
---

# Gong data in Snowflake

Builds on [pear-metabase](../pear-metabase/SKILL.md) — read its credential and
`mb.py` setup first. Snowflake is Metabase database `13371339`.

**Do not use the Gong MCP connector for transcripts.** Its
`get_call_transcript` endpoint returns an HTML error page instead of JSON and
has been broken for a while. `search_calls` and `get_call_participants` do
still work and are the fastest way to browse recent calls by date or rep — but
anything involving what was actually *said* comes from the warehouse.

## Schema

Use `GONG.GONG_DATA_CLOUD.*`. `PEAR_DB.RAW_DATA_GONG.*` mirrors it but some of
its views declare fewer columns than the upstream share returns and fail to
compile.

The table is **`CALLS`, not `CALL`.** `RAW_DATA_GONG` uses the singular, so a
query copied from there fails with `Object 'GONG.GONG_DATA_CLOUD.CALL' does not
exist or not authorized` — which reads like a permissions problem and is not.

| Table | Notes |
|---|---|
| `CALLS` | One row per call. `CONVERSATION_KEY` (64-char hex) is the join key, `TITLE`, `EFFECTIVE_START_DATETIME`, `STATUS`, `CALL_URL`, plus Gong's own `CALL_SPOTLIGHT_*` summary columns. |
| `CALL_TRANSCRIPTS` | One row per call, ~3.3k rows total. `TRANSCRIPT` is a VARIANT array of monologues, ~18KB per call. |
| `CONVERSATION_PARTICIPANTS` | One row per participant per call. |

Only `STATUS = 'COMPLETED'` calls have transcripts.

## The predicate trap — read this before writing any query

`CALL_TRANSCRIPTS` is tiny, but **a bare `where conversation_key = '…'`
against it times out**, even for `count(*)`. Measured:

| Query | Time |
|---|---|
| `select count(*)` (no predicate) | 4s |
| `select conversation_key … limit 5` | 1.3s |
| `select count(distinct conversation_key)` | 1.3s |
| `select count(*) where conversation_key = '<key>'` | **504** |
| `select count(*) where etl_modified_datetime >= '2026-08-01'` | 2.3s |
| `select count(*) where etl_modified_datetime >= … and conversation_key = '<key>'` | 19.3s ✅ |

Reading the column is cheap; *filtering* on it is not. The fix is to always
pair a `conversation_key` filter with an `ETL_MODIFIED_DATETIME` lower bound —
the timestamp prunes partitions first, and the key filter then costs nothing.

```sql
where t.etl_modified_datetime >= '2026-08-01'   -- always, even for one call
  and t.conversation_key = '<key>'
```

`ETL_MODIFIED_DATETIME` is when the row was loaded, not when the call happened.
It is normally within a day or two of the call, so bound to the start of the
call's month and widen if you get zero rows.

The 504 comes from nginx at ~60s, not from Snowflake — the query keeps running
server-side, so an unbounded query burns warehouse time and returns nothing.
Snowflake's result cache does not save you here either; a retry re-times-out.
Bound the query instead of retrying it.

## Pulling a transcript

Two things are wrong with the query documented in `pear-metabase`, and both
fail hard:

1. **`lateral flatten` cannot sit to the left of a `LEFT JOIN`** —
   `SQL compilation error: Lateral View cannot be on the left side of join`.
   Flatten in a CTE, then join.
2. **`CONVERSATION_PARTICIPANTS` has no `TITLE` column.** Selecting it fails to
   compile in under a second. Job titles are not in the warehouse — get them
   from the Gong API (`get_call_participants`) or HubSpot.

Also: `CONVERSATION_PARTICIPANTS.SPEAKER_ID` is a **`NUMBER`**, while the
transcript's `m.value:speakerId` is a string. Cast one side or the join
silently matches nothing and every speaker comes back `NULL`.

Pull participants and transcript as two queries and stitch them in Python —
joining them in SQL works but roughly triples the runtime for no benefit.

```sql
-- participants
select to_varchar(speaker_id) as speaker_id, name, affiliation, email_address
from gong.gong_data_cloud.conversation_participants
where conversation_key = '<key>'

-- transcript, flattened to one row per sentence
with flat as (
  select m.value:speakerId::string as speaker_id,
         m.index as turn, s.index as sidx,
         s.value:text::string as text
  from gong.gong_data_cloud.call_transcripts t,
       lateral flatten(input => t.transcript) m,
       lateral flatten(input => m.value:sentences) s
  where t.etl_modified_datetime >= '2026-08-01'
    and t.conversation_key = '<key>'
)
select * from flat order by turn, sidx
```

A 30-minute call is ~480 sentence rows over ~100 turns, well under the
2,000-row cap. An hour-long call can exceed it — group by turn in SQL
(`listagg(text, ' ')`) if you are near the limit.

Group consecutive sentences by `turn` to reconstruct speaker turns; one turn is
one monologue.

**`affiliation` values are `company` and `non_company`.** `company` is Pear.
Treat everything else as external — `unclassified` shows up on phone dial-ins
and is external, not unknown.

## Finding the call

`CALLS.PROVIDER_UNIQUE_ID` is **empty for conference calls**, which is most of
Pear's book. So a Gong call id taken from a `search_calls` result or a
`app.gong.io/call?id=…` URL will not join to anything. Match on title and date
instead:

```sql
select conversation_key, title, effective_start_datetime::date as d, status
from gong.gong_data_cloud.calls
where title ilike '%Tillamook%'
order by effective_start_datetime desc
```

Check what comes back before assuming you have the right row. A title
containing "Intro" or "Demo" is not evidence that a call is the first one —
on the Tillamook account the call titled "Intro/Demo" was the third touch, and
a call titled "Part 2" sat a month *earlier* in the timeline. Pull every call
for the account and sort by date.

## Cost of the naive path

Roughly seven minutes of wall clock and four 504s to get one transcript, most
of it spent on the predicate trap and on two documented-but-nonexistent
columns. Following this file it is two queries and about 70 seconds.
