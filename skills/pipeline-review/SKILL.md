---
name: pipeline-review
description: Prepare and run a sales pipeline review. Generates a per-rep prep pack of deal risks ahead of the meeting so review time is spent discussing forecast judgement and commitments rather than discovering problems live, then tracks what each rep committed to and checks it at the next cycle. Use when asked to prep a pipeline review, build a forecast review agenda, review a rep's pipeline, or follow up on what was committed last cycle.
---

# Pipeline review

Turns pipeline review from a status readout into a decision meeting. Risks are
found **before** the meeting; the meeting is spent on why the rep is forecasting
what they are forecasting, and what they will do about it before next time.

Per-deal analysis is `deal-risk-review`. Data access is `pear-gong-warehouse`.
This skill is the portfolio layer and the accountability loop.

## The shape

```
  T-2 days   generate prep pack per rep, send it to them
  T-1 day    rep fills in forecast call + reasoning + reads risks
  Review     discuss deltas and commitments only
  After      write commitments to the ledger
  Next cycle open with the ledger — what was committed, what happened
```

The rep must see their risks **before** the meeting. If risks are revealed live,
the rep spends the meeting defending rather than thinking, and the manager
spends it reading. That is the failure this skill exists to prevent.

## Step 1: Scope the review

Pick the deal set deliberately and say what it is:

- One rep's open deals on the Subscription Revenue pipeline (`pipeline_id
  28268628` — all new business), or
- Everything forecast Commit/Best Case this quarter, or
- Everything above a value threshold.

Reviewing every open deal every cycle guarantees a shallow pass. Prefer a
bounded set reviewed properly.

## Step 2: Risk pass per deal

Run `deal-risk-review` on each deal in scope. Keep its output intact — the
evidence quotes are what make the conversation concrete and stop it becoming
opinion-versus-opinion.

Carry forward each deal's **previous** register so change is visible: risks
resolved, risks still open, risks that are new since last cycle. A risk that has
been open across three reviews is itself the finding.

## Step 3: The forecast delta — this is the agenda

For each deal, put the rep's forecast category next to the risk register and
look at the gap. The gap is the entire reason to meet.

| Rep says | Evidence shows | Discuss |
|---|---|---|
| Commit | Critical risks open | **Most important conversation in the review.** What do they know that the record doesn't show? |
| Commit | Clean | Fast confirm, move on |
| Best case | Clean, champion strong | What would move it to commit, and by when? |
| Pipeline | Clean, strong signals | Is it being under-called or under-worked? |
| Any | Same risks as last cycle | Why did nothing move? |

Deals where forecast and evidence agree need almost no time. **Spend the meeting
on disagreements.** A rep confidently committing a deal whose champion has gone
silent for three weeks either has information the record lacks — which should be
captured — or is forecasting on hope.

Do not let the tool make the call. The rep forecasts; the register challenges.
A manager overriding a forecast because a skill flagged risks will teach reps to
game the inputs.

## Step 4: The prep pack

One page per deal, sent ahead. Nothing the rep has to decode live.

```
DEAL — <name> · <stage> · <close date> · <days since last buyer contact>

Your forecast call: ______   Why: ______________________

Open risks
  1. CRITICAL — <one line>
       <quoted evidence, dated>
       Suggested action: <type A/B/C from deal-risk-review>
  2. WATCH — ...

Still open from last review
  - <commitment> — committed <date>, due <date>  [ done / not done ]

What I will do before next review
  1. ____________________  by ____
```

The rep fills in the forecast call, the reasoning, and the commitments. Blank
fields at meeting time are themselves an agenda item.

## Step 5: Commitments

The loop only works if commitments are written down and checked. Rules:

- **Verifiable next cycle.** "Email Natalia to ask who in IT approves software
  spend, by Thursday" is checkable. "Work on the ROI story" is not. Reject the
  second.
- **One owner, one date.** Not the team, not "ongoing".
- **Three or fewer per deal.** A rep with fifteen commitments has none.
- **Carry the type.** A type-C action ("decide the approach") is a decision the
  rep owes, not work they owe — different follow-up, and it may need someone
  else in the room.
- **Check them first, next cycle.** Open the next review with the ledger, before
  any new analysis. Commitments that are silently dropped teach everyone the
  review is theatre.

Persist per rep per cycle so the carry-forward is mechanical, not remembered.
Record: deal, commitment, owner, due date, cycle committed, status at next
cycle. Store it wherever the team will actually maintain it — a versioned file
or HubSpot notes on the deal — but store it in exactly one place.

## Step 6: After the review

Write back: forecast calls with reasoning, new commitments, risks accepted with
eyes open. "We know the EB is unmet and are proceeding anyway" is a legitimate
outcome — record it as a decision so it is not rediscovered as a surprise.

## What this deliberately does not do

- **No close probability.** See `deal-risk-review` for why: call count alone
  spans a 5.6%–60.5% win rate on this pipeline, so a coverage score largely
  restates meeting count, and there are far too few wins to calibrate against.
- **No automatic forecast override.** The rep calls it. The register informs.
- **No risk score or weighted total.** Ranked severity with evidence. A number
  invites arguing with the number instead of the deal.
- **No manufactured risk.** A clean deal gets a short register and a fast
  confirm. Padding erodes trust in the whole exercise faster than a miss does.

## Notes and unknowns

- **Deal owner field unconfirmed.** Scoping by rep needs the owner column on
  `HUBSPOT__DEALS_SUBSCRIPTION_PIPELINE`; `DEAL_BOOKED_BY_ID` exists and
  `HUBSPOT_STG__OWNERS` is available, but the correct join has not been
  verified. Confirm before relying on per-rep scoping.
- **~70 open deals** on the subscription pipeline at time of writing — small
  enough that full coverage per cycle is feasible if desired.
- Risk registers are only as good as linked calls. Resolve through both the
  `opportunity` and `account` paths (see `pear-gong-warehouse`) or deals will
  look thinner than they are.
