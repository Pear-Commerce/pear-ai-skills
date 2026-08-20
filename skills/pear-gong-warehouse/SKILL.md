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

**The 504 is a Metabase-proxy limit, not a Snowflake one.** If the Snowflake CLI
(`snow`) is set up on the machine, prefer it for transcript pulls — there is no
nginx in that path, so the `conversation_key` predicate should be usable
directly and the ETL-bound workaround becomes unnecessary. Setup lives in
[snowflake-jdbc](../snowflake-jdbc/SKILL.md) (config path, the stale
`host`/`port` failure signature, credential refresh from the
`snowflake-2025-12-01` secret). Not yet verified against these Gong tables —
`snow` was absent on the workstation where the timings above were measured, so
the Metabase path is what is actually proven here. If you do confirm the CLI
route, update this section with timings.

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

## Email content comes from HubSpot, not Gong

`GONG_DATA_CLOUD.EMAILS` is **metadata only** — timestamp, direction, invite
flag, `CONVERSATION_KEY`. No subject, no body. It tells you an email happened,
never what it said. For any deal analysis this is a trap: the timeline looks
complete and the content is entirely absent.

Bodies live in **`PEAR_DB.RAW_DATA_HUBSPOT.ENGAGEMENTS_EMAILS`** (~540k rows).
Useful columns, all prefixed `PROPERTIES_`:

| Column | Notes |
|---|---|
| `HS_TIMESTAMP` | Send time. Predicates on it prune normally — no 504 trap on this table. |
| `HS_EMAIL_DIRECTION` | Values are `EMAIL` (outbound) and `INCOMING_EMAIL` (inbound) — **not** `inbound`/`outbound`. |
| `HS_EMAIL_SUBJECT`, `HS_EMAIL_TEXT` | Subject and full plain-text body. `HS_EMAIL_HTML` and `HS_BODY_PREVIEW` also exist. |
| `HS_EMAIL_FROM_RAW`, `HS_EMAIL_TO_EMAIL`, `HS_EMAIL_CC_EMAIL` | Filter on these. |

Filter by counterparty domain across to/from/cc. Do **not** join on the
`COMPANIES` column — it is an `ARRAY`, and comparing it to a varchar throws
`Can not convert parameter of type VARCHAR into expected type ARRAY`, the same
trap `pear-metabase` documents for `DEAL_COMPANY_ID`.

```sql
select properties_hs_timestamp as ts,
       properties_hs_email_direction as dir,
       properties_hs_email_subject   as subj,
       properties_hs_email_from_raw  as frm,
       properties_hs_email_text      as body
from pear_db.raw_data_hubspot.engagements_emails
where properties_hs_timestamp >= '2026-06-01'
  and (properties_hs_email_to_email ilike '%@example.com'
    or properties_hs_email_from_raw ilike '%@example.com'
    or properties_hs_email_cc_email ilike '%@example.com')
order by 1
```

**Strip the quoted history or you will drown.** Bodies include the entire
quoted thread, so they grow monotonically — one real thread went 667 chars at
the first message to 33,372 by the twelfth, and reading all of them means
reading the same thread a dozen times over. Cut at the first reply marker to
keep only what is new:

```python
import re
cut = len(body)
for pat in [r"\nOn .{0,80}wrote:", r"\nFrom: ",
            r"\n-{3,}\s*original message", r"\n_{5,}"]:
    m = re.search(pat, body, re.I)
    if m: cut = min(cut, m.start())
new_content = body[:cut].strip()
```

Also strip HubSpot tracking links (`hs-sales-engage.com`) — a single wrapped
link runs over 1,000 characters and several per email is common.

**Sender addresses are sometimes masked.** `HS_EMAIL_FROM_RAW` arrives either
as `Name <addr@domain>` or as
`EmailAddress{name=Natalia Nunez, address=**REDACTED**, valid=true}`. The
display name survives in both; the address does not. Key identity off the name
or the to/cc columns, never off a parsed from-address.

**Attachments are not in the warehouse.** Quote spreadsheets, NDAs, and slide
decks referenced in the bodies are not retrievable here — only the fact that
they were sent. Expect dollar figures and contract terms to live in files you
cannot read from Snowflake.

Gong's and HubSpot's email counts will not match; Gong writes one row per
participant, HubSpot one per message. Prefer HubSpot for anything content-
related and treat Gong's `EMAILS` as a cross-check on timing only.

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

## Joining calls to HubSpot deals

`CONVERSATION_CONTEXTS` links conversations to CRM objects via `OBJECT_ID` /
`OBJECT_TYPE`. Three traps, all of which return plausible numbers rather than
errors:

1. **HubSpot deals appear as `object_type = 'opportunity'`**, not `'deal'`.
   Filtering `object_type ilike '%deal%'` returns zero rows and looks like
   "this deal has no calls." Valid types seen: `contact`, `account`,
   `opportunity`.
2. **The join fans out** — one row per deal × conversation. `count_if(is_closed_won)`
   over the joined rows counts call-pairs, not deals, and overstates badly
   (288+417=705 "outcomes" across 376 actual deals). Aggregate to one row per
   deal first with `max(iff(is_closed_won,1,0))`, then count.
3. **`CONVERSATION_CONTEXTS` covers emails too, not just calls.** Counting
   `distinct c.conversation_key` counts conversations; only some have
   transcripts. Join through `CALL_TRANSCRIPTS` and count *that* key to get
   calls. Measured on the subscription pipeline: 671 closed deals have a Gong
   conversation, but only 341 have a transcribed call.

```sql
with ctx as (
  select distinct to_varchar(object_id) oid, conversation_key
  from gong.gong_data_cloud.conversation_contexts
  where object_type = 'opportunity'
),
tx as (select distinct conversation_key from gong.gong_data_cloud.call_transcripts)
select to_varchar(d.deal_id) did,
       max(iff(d.is_closed_won, 1, 0))    as won,
       count(distinct tx.conversation_key) as n_calls   -- tx, not c
from pear_db.hubspot.hubspot__deals_subscription_pipeline d
left join ctx c on c.oid = to_varchar(d.deal_id)
left join tx    on tx.conversation_key = c.conversation_key
group by 1
```

**Gong only went live in Sales at the start of 2025 — scope every historical
analysis to 2025+.** Transcript coverage of closed subscription-pipeline deals
by close year: 2023 **0%** (0/256), 2024 **4.8%** (14/293), 2025 **59.5%**
(204/343), 2026 **78.8%** (123/156). Pooling across those years puts every
pre-2025 deal in the "no calls" bucket by construction and silently corrupts
any coverage metric. 2025 is a ramp year, not a clean one — prefer 2026 if the
sample allows.

Baselines on the correctly-scoped window (closed 2025-01-01 onward, 499 deals):
base win rate **19.8%** (99 won). Of those, **327 have at least one transcribed
call** and win at 25.1% — so the scoreable population is modestly
win-enriched, fine for within-population comparison, not for absolute
probability claims.

Win rate by transcribed call count, same window:

| Calls | Deals | Won | Win rate |
|---|---|---|---|
| 0 | 172 | 17 | 9.9% |
| 1 | 144 | 8 | 5.6% |
| 2-3 | 141 | 47 | 33.3% |
| 4-6 | 38 | 23 | 60.5% |
| 7+ | 4 | 4 | 100% |

**Call count alone spans 5.6% to 60.5%.** Any qualification, coverage, or
close-probability score built on this data must be shown to beat call count
before it means anything — it is a far stronger baseline than deal stage and a
trivial one to accidentally reinvent.

Column notes: there is **no `IS_CLOSED_LOST`** on this table — the lost flag is
`DEAL_LOST` (a real BOOLEAN). `IS_CLOSED_WON` and `DEAL_LOST` are disjoint and
sum to the closed population. Do not trust `IS_OPEN`: `count_if(is_open=0)`
returns 70, which is exactly the number of *open* deals, so its polarity does
not match its name. `amount` is unusable on this pipeline (see `pear-metabase`).

## Cost of the naive path

Roughly seven minutes of wall clock and four 504s to get one transcript, most
of it spent on the predicate trap and on two documented-but-nonexistent
columns. Following this file it is two queries and about 70 seconds.
