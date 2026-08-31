---
name: deal-risk-review
description: Flag risks on a live Pear sales deal and recommend specific next actions, using every recorded call and email on the account. Produces a ranked risk register with evidence and an owner-and-date action for each — deliberately not a close-probability score. Use when asked to review a deal, check what is at risk, prep a pipeline review, work out why a deal has gone quiet, or decide what to do next on an opportunity.
---

# Deal risk review

Reads every call and email on a deal, then reports **what is at risk and what to
do about it**. Output is a ranked register of concrete risks with evidence, not
a number.

Data access is `pear-gong-warehouse` (transcripts, participants, HubSpot email
bodies). Read it first — the joins have several traps that return plausible
wrong answers rather than errors.

## Why there is no percentage

A close-probability score is not supportable on Pear's data and should not be
invented. Measured on the subscription pipeline, closed 2025+ (n=499, base win
rate 19.8%), win rate by transcribed call count runs 5.6% at one call → 33.3%
at 2–3 → 60.5% at 4–6. **Call count alone spans an order of magnitude**, so any
qualification score risks being a restatement of "how many meetings has this
had," dressed up as insight. There are only ~82 wins in the scoreable
population — far too few to calibrate seven MEDDICC elements against.

Risk flags need none of that. Each one below is either a checkable fact or a
quoted absence, and each carries its own action. That is what a pipeline review
can act on.

## Step 1: Assemble the deal

Pull, via `pear-gong-warehouse`:

- **Every call on the account**, not just ones matching a title. Search by
  participant email domain — title search misses calls named after people
  (a real deal had a call titled "Natalia Nunez and Shannon Wnuk" that no
  `%CompanyName%` search would find).
- **Transcripts** for each, oldest first.
- **Email bodies** from `RAW_DATA_HUBSPOT.ENGAGEMENTS_EMAILS`, quoted history
  stripped.

Build a single chronology of calls and emails interleaved. **Most process
detail lives in email, not calls** — budget dates, contract end dates, legal
steps, and pricing rounds are negotiated in writing. A call-only review will
systematically under-read the decision process and over-read risk.

Do not trust call titles for sequencing. Sort by date and read the arc.

## Step 2: Deterministic signals

These are computed, not judged. Each is a fact you can put in front of a rep.

| Signal | How to compute | Flag when |
|---|---|---|
| **Silence** | Days since last *inbound* message, computed against today's real date | > 7 days, or past a date the buyer themselves promised |
| **Promise overdue** | Buyer said "I'll come back by X" — is X past? | Any overdue promise |
| **No next meeting** | Any future-dated meeting on the account | None scheduled |
| **Single-threaded** | Distinct external people who actually spoke across calls | Only 1–2, or all inbound email from one person |
| **Economic buyer unmet** | Has anyone from the funding org been on a call? | Never met |
| **Reciprocity skew** | Seller commitments vs buyer commitments in the last exchange | Seller ≫ buyer |
| **Ask unanswered** | A direct seller question with no buyer reply | Open > 2 weeks |
| **Buyer ask unmet** | A buyer request the seller has not delivered | Any open |

The last two matter most and are the easiest to miss. Search the chronology for
question marks in both directions and check each got an answer.

## Step 3: MEDDICC coverage

Score M / E / DC / DP / I / C / Competition as Strong / Partial / Missing
across the **whole deal**, not per call — an element can be established on call
one and never revisited. Cite the specific moment, quoted.

Two rules that change the answer:

- **Read coverage cumulatively, then look for regression.** An element that was
  Strong and is now unaddressed is a bigger risk than one that was never raised
  — it means something changed.
- **Absence of evidence in a call is not absence in the deal.** Check email
  before grading anything Missing. Decision Process in particular is usually
  established in writing.

## Grounding: separate the risk from the remedy

The most common failure of this skill is letting uncertainty about the *fix*
contaminate the statement of the *problem*. They are independent.

**A risk is a fact about the deal.** It is observable: a quote, a computed
date, a request with no reply, a person never met. It stands whether or not
Pear can do anything about it. Never soften, drop, or hedge a risk because the
remedy is unclear or because addressing it would be hard.

**Every risk statement must be traceable.** Quote the words with a date, or
show the computation. Label anything else:

- **Observed** — quoted or computed from the record. Default; everything in the
  register should be this.
- **Inferred** — a reading of the evidence. Say so, and give the evidence.
- **Unknown** — you could not see it (attachment, dropped number, unlinked
  call). Name the gap rather than filling it.

**Never assert a Pear capability you have not verified.** Do not describe a
deliverable, dataset, discount, or claim as available unless you have confirmed
it exists. Inventing a plausible artifact is worse than saying the approach is
undetermined — the rep will discover it doesn't exist in front of the customer.

**An unaddressed risk does not go away.** If nobody decides how to handle it,
it stays on the register and keeps costing the deal. Say that explicitly rather
than quietly dropping it between reviews.

## Step 4: Rank and write the register

Rank by **what would kill the deal**, not by how many elements are gapped. One
Missing element on the critical path outranks three Partials that don't matter.

Each entry:

```
RISK — <one line, specific to this deal>
  Evidence:  <quote or computed fact, with date>
  Why it bites: <the mechanism by which this loses the deal>
  Action:    <verb-first, named person, by when>
```

Severity, plainly: **Critical** = will lose the deal if unaddressed;
**Watch** = will cost time or leverage; **Note** = worth knowing.
No numeric scores, no weighted totals — a total invites the false precision
this skill exists to avoid.

## Step 5: Actions

Every risk gets exactly one action, and one of exactly three shapes. Picking
the wrong shape is how this skill produces confident nonsense.

**A. Do the thing** — only when you have verified the artifact exists and Pear
can produce it. Name it precisely.

**B. Get the missing input** — when the blocker is information the buyer holds.
Name the specific inputs and who to ask. Often the strongest move: building the
case *with* the champion from their numbers makes it a model they can defend
internally, rather than a vendor assertion they have to relay.

**C. Determine the approach** — when a real gap exists and you cannot verify
how Pear addresses it. This is a legitimate action, not a cop-out. Write it as
a decision someone owns with a date: *"Shannon + Eric to determine by Thu
whether Pear can give Katie a defensible ROI story for a 3x increase, and if
not, what to offer instead."* Escalating an open question beats fabricating an
answer.

Never convert a type-C into a type-A by inventing a plausible deliverable. If
you find yourself naming a document you have not confirmed exists, stop.

- **Name the person.** "Get to the economic buyer" is not an action. "Ask
  Natalia who in IT approves software spend, and whether Pear should present
  to them" is.
- **Prefer the cheapest test.** One email that resolves an unknown beats a
  deck. Sequence so the answer to step 1 determines step 2.
- **Compute every date interval; never eyeball one.** Get today's real date
  (`date`) and subtract — do not estimate "about N months" by inspection. This
  is the single easiest way to invert a deal's urgency, and it is silent: a
  wrong interval reads as fluent analysis. On one review an expiry 7 months out
  was described as 20 months, turning a live deadline into a non-issue.
- **Report both directions of urgency honestly.** Do not manufacture a deadline
  the buyer never stated — and do not miss a real one. A proposed signature
  date the buyer has not answered is a live clock even when the contract end
  is far off.
- **Close the buyer's open asks first.** A buyer request left unmet outranks
  any seller-initiated next step. It is the cheapest trust you will ever buy
  back.

## Output standards

- Write to the rep as "you". Be direct about risk; do not soften.
- Quote the transcript or email. Paraphrase reads as opinion and gets argued with.
- If the deal is healthy, say so and keep the register short. Manufacturing
  risk to fill a template destroys the tool's credibility faster than missing
  one.
- State what you could not see. Attachments (quotes, contracts, decks) are not
  in the warehouse, so dollar figures and terms are usually invisible; Gong's
  transcription also drops numbers mid-sentence. Flag those as unknowns rather
  than guessing.

## Known blind spots

- **No attachments.** Quote spreadsheets, NDAs, and contracts are referenced in
  email bodies but not retrievable. Pricing specifics live there.
- **ASR drops numbers.** Transcripts lose figures mid-sentence
  ("currently around, okay?"). Ratios stated in words survive; absolute dollars
  often do not.
- **Call linkage is patchy.** Resolve calls through both the `opportunity` and
  `account` paths — on closed 2025+ deals the account path found 379 deals with
  calls versus 327 via opportunity. A deal that looks call-free may not be.
- **Gong started in Sales in 2025.** No usable call history before that.
