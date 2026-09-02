# Handoff — pipeline review work, as of 2026-08-31

Delete this file once `pipeline-review` has been validated end to end.

## The goal

Run a MEDDICC-based risk review across **all open Subscription Revenue pipeline
deals with a close date this quarter**, so reps get their risks *before* pipeline
review and the meeting is spent on forecast judgement and commitments rather
than live discovery.

Never got run. The data path broke mid-session.

## Read these first

| Skill | State |
|---|---|
| `pear-metabase` | Working. Credentials + `mb.py` |
| `pear-gong-warehouse` | Working, heavily updated. **Read before any query** |
| `deal-risk-review` | Exercised against one live deal |
| `pipeline-review` | **Never run.** Design only |
| `meddic-discovery-analyzer` | Third-party (Stage 2 Capital), two tool refs patched |

`deal-risk-review/fixtures/` has one full verbatim transcript plus every
verified quote from a complete real deal (Tillamook) — enough to test changes
without warehouse access.

## Data access as of 2026-08-31 17:30

A least-privilege migration to `PEAR_DASHBOARD_ROLE` was **in progress during
this session** — grants were being added live (all 24 `RAW_DATA_GONG` views
landed at 17:15:52). Re-test everything; it will have moved.

Working:
- `PEAR_DB.RAW_DATA_GONG.CALL_TRANSCRIPTS` (3,342), `.CALL` (6,384, **singular**),
  `.CONVERSATION_CONTEXTS` (1.3M), `.EMAILS` (540k, metadata only)
- Gong MCP `search_calls`, `get_call_participants`

Blocked:
- `GONG.GONG_DATA_CLOUD.*` — whole database ungranted
- `PEAR_DB.HUBSPOT.*`, `HUBSPOT_STAGING`, `HUBSPOT_ANALYTICS`
- `RAW_DATA_HUBSPOT.ENGAGEMENTS_EMAILS` (email bodies) and `.DEALS`

Broken regardless of grants:
- `RAW_DATA_GONG.CONVERSATION_PARTICIPANTS` and `.USERS` — view definitions
  declare 16 columns against a 17-column query. Any select fails. Use the Gong
  MCP `get_call_participants` tool instead.
- Gong MCP `get_call_transcript` — returns HTML, not JSON. Long-standing.

## What unblocks the run

Either path works; they yield the same data.

1. **HubSpot MCP** — `plugin:pear-gong-call-review:hubspot` was authorized at
   the very end of this session but MCP auth state is fixed at session start, so
   it never became visible. **Check for HubSpot tools first** (`ToolSearch` for
   `hubspot crm deals`). If present, that supplies deals and email bodies and no
   Snowflake grant is needed.
2. **Snowflake grants** — ask for `PEAR_DASHBOARD_ROLE` access to
   `PEAR_DB.HUBSPOT` (or `HUBSPOT__DEALS_SUBSCRIPTION_PIPELINE`) and
   `RAW_DATA_HUBSPOT.ENGAGEMENTS_EMAILS`.

## Two decisions needed from Ian before the run

- **Which close-date field is authoritative?** The pipeline table has
  `CLOSE_DATE`, `CALCULATED_CLOSE_DATE`, and `TRUST_CLOSE_DATE`. Guessing
  silently changes the deal set.
- **Does forecast category exist in HubSpot?** No forecast column was found.
  Step 3 of `pipeline-review` — the forecast-vs-evidence delta that drives the
  whole agenda — needs the rep's Commit / Best Case / Pipeline call. If it is
  not in the CRM, it comes from reps via the prep pack instead.

Also unverified: the deal-owner join for per-rep scoping. `DEAL_BOOKED_BY_ID`
and `HUBSPOT_STG__OWNERS` exist; the correct join was never confirmed.

## The run, once unblocked

1. Open Subscription Revenue deals (`pipeline_id = 28268628`, all new business)
   with close date this quarter. Expect 15–30 of ~70 open deals.
2. Per deal, resolve calls through **both** `CONVERSATION_CONTEXTS` paths —
   `object_type = 'opportunity'` (= deal id) and `'account'` (= company id),
   deduped, date-bounded to the deal's open window. Opportunity alone
   undercounts; account alone overcounts.
3. Pull transcripts and email bodies. **Cache to disk keyed by
   `conversation_key`** — this session pulled the same corpus three times and
   still lost it to a scratchpad wipe.
4. Run `deal-risk-review` per deal.
5. Assemble prep packs per `pipeline-review` step 4.

Batch job, tens of minutes. Not a live query.

## Verified baselines (do not re-derive)

Subscription pipeline `28268628`, closed deals. **Gong went live in Sales at the
start of 2025** — transcript coverage by close year: 2023 0%, 2024 4.8%,
2025 59.5%, 2026 78.8%. Scope historical analysis to 2025+.

Closed 2025+: 499 deals, 99 won, base win rate 19.8%. Win rate by transcribed
call count: 0 → 9.9% (n=172) · 1 → 5.6% (n=144) · 2–3 → 33.3% (n=141) ·
4–6 → 60.5% (n=38) · 7+ → 100% (n=4). Linkage: 327 deals via `opportunity`,
379 via `account`, 384 either, 115 genuinely call-free. ~70 open deals.

**Call count alone spans 5.6%–60.5%.** Any coverage or qualification score must
beat it to mean anything. This is why there is no close-probability score.

## Settled design decisions — do not relitigate

- **No close probability.** ~82 wins cannot calibrate 7 MEDDICC elements, and
  call count would dominate any score.
- **No forecast override.** The rep calls it; the register challenges.
- **Risks are facts, independent of the remedy.** Never soften a risk because
  the fix is unclear. Label Observed / Inferred / Unknown.
- **Actions are typed A / B / C** — do the thing / get the missing input /
  determine the approach. **Default to C** when Pear capability is unverified.
  Type-A needs a human on the deal confirming the artifact exists; collateral
  and RFP language do not clear that bar. `pear-rfp-solver` is **not** trusted
  for this yet (Ian's call).
- **Compute every date interval** against today's real date. An eyeballed
  interval turned a 7-month expiry into 20 months and inverted a deal's urgency.

## Open item on Tillamook itself

Live deal, genuinely at risk as of 2026-08-31: champion 13 days past her own
commitment, 20 days silence, a Sept 30 signature target unacknowledged for a
month, an ROI request open 20 days, and IT (who funds it) never engaged.
Details in `deal-risk-review/fixtures/README.md`.
