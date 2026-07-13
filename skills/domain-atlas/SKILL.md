---
name: domain-atlas
description: >-
  Build a durable, drill-tested atlas that maps Pear's domain concepts to the
  packages, classes, flags, and helper methods that carry them — retroactive
  Domain-Driven Design ubiquitous-language work over a codebase that skipped
  DDD up front. Two modes. (1) Transcript mode — paste a scrum, 1:1, or
  lunch-and-learn transcript; extracts domain concepts and generates
  active-recall questions that test which entities, flags, helpers, and
  gating logic participate in each concept. (2) Concept mode — name a single
  domain term ("quiz me on location-agnostic ship-to-home", "concept: batch
  availability updater"); emits a scenario-based question. In both modes the
  default is a quiz; use `--explain` for a direct reference answer instead.
  Answers are progressively disclosed (hint → names → full context). Tracks
  per-concept mastery across sessions so previously-missed concepts resurface.
  Produces linked-markdown atlas entries under `scrum-qa/concepts/` that
  accrete into an institutional map. Use when someone pastes a Pear meeting
  transcript, names a Pear domain term and wants to be tested, asks for
  study/drill material on Pear internals, or wants to atlas a subsystem.
  **BEFORE running any drill, read this skill's `LESSONS.md` — it encodes
  the trust-but-verify, code-is-the-design, and argue-before-reveal
  disciplines that make the drill work. Skipping LESSONS.md produces a
  shallow quiz instead of a real drill.**
---

# Domain Atlas

Active-recall Q&A + persistent concept mapping for Pear's domain. The point
is durable understanding, not one-shot Q&A.

## Read LESSONS.md first

This skill's real value lives in the disciplines it encodes:
`skills/domain-atlas/LESSONS.md`. That file lists the drill lessons
(trust-but-verify, code-is-the-design, argue-before-reveal, cause-vs-symptom,
etc.) and one atlas-writing convention (name-stem disambiguation). **Read it
before generating the first quiz question or writing the first atlas entry.**
Without it, you'll produce a passable Q&A generator; with it, you'll produce
the drill this skill was actually built for.

## The user's stated goal

> "This is for me to skill & drill on. Pull out the domain concepts then ask
> me where/what participates in those items. Our domain is pretty good at the
> code level but not obvious."

The code-level names (`locationAgnosticShipToHome`,
`MultiUPCStoreIdBatchAvailabilityUpdater`, `RetailPartner`) read intuitively.
What's **not obvious** is how they **combine**: the gating helpers, the
AppConfig kill switches, the older-flag-vs-newer-flag pairs, the
parallelization axes, the strategy objects that should exist but don't yet.
That combinatorial layer is what the drill targets.

## Arguments

Parsed loosely from `$ARGUMENTS` and the surrounding user turn:
- Transcript text or file path → **transcript mode**
- A concept name → **concept mode**
- `--explain` anywhere → suppress the quiz, produce a direct reference answer
- `--depth=hint|names|full` → default is `hint` (progressive disclosure)

If `$ARGUMENTS` is empty and the surrounding turn doesn't contain a transcript
or a concept name, ask which mode the user wants.

## Modes

### Transcript mode

Trigger: the user pastes a transcript (VTT, plain text, or Zoom-style
speaker-labeled lines) and asks for Q&A, drill, quiz, or study material.

Steps below run in order. Use tool parallelism where a step says "in parallel."

**T1. Sniff the transcript.**
- Speaker-labeled scrum → likely daily standup, expect operational vocabulary
  (retailers, tickets, on-call).
- Long-form 1:1 or lunch-and-learn → expect architectural vocabulary (class
  hierarchies, patterns, refactors).
- If unclear, ask before proceeding — a stray paragraph shouldn't trigger a
  full crawl.

**T2. If it looks like a scrum, fetch this week's Notion standup page for context.**

The Meeting Notes data source is stable at
`collection://d0799c72-db62-48f8-95a3-e4accd8b4d27` (parent path: Pear Team
Home → team wiki → Meeting Notes). Page titles follow
`Week of M/D Standup & Parking Lot` (no leading zeros).

```
notion-search  query="Week of {M}/{D} Standup Parking Lot"
notion-fetch   id=<result>
```

Extract from the page: Q2 Top Projects list, Tickets-to-Discuss block,
Retailers-to-push-live and Retailers-for-feasibility blocks, day-by-day
standup notes, Parking Lot entries.

For 1:1/lunch-and-learn transcripts, **skip this step** — no Notion context
to pull, don't waste calls.

**T3. Extract candidate concepts from the transcript.**

Concept sources, in priority order:
1. **CamelCase / snake_case identifiers** — likely class names, fields, or
   config keys (`LogicalUPCRetailerData`, `offertologicalupc`,
   `locationAgnosticShipToHome`).
2. **Named strategies, patterns, or subsystems** — "batch availability
   updater," "URZA," "the orchestrator," "the async stream framework."
3. **Retailer names** — anchor operational concepts (Instacart, DoorDash,
   Petco, PetSmart, Target, Walmart, Chewy, Save a Lot, Price Chopper,
   Dierbergs, Fleet Farm, LCBO, SAQ, BC Liquor, Dick's, Footlocker, Champs,
   Hibbett, Trader Joe's, Blue Buffalo, Nutrabolt, Betty Crocker, Jarlsberg,
   GMI/General Mills, Dude Wipes, Costco, Meijer, Absco, Kroger, Whole Foods).
4. **Operational vocabulary** — availability, zone creation,
   retailerLinkStrategy, PDP, add-to-cart, tracking pixel, page load table,
   catalog regeneration, feasibility, circuit breaker, kill switch, Pulse,
   Vision, Zenduty, Trade Desk.
5. **DevRev tickets** — any `ISS-\d+` pattern.

Deduplicate. Drop candidates with **zero** code hits AND **zero** Notion
mentions (mis-tokenizations).

**T4. Cross-reference DevRev for `ISS-*` mentions** (in parallel).

```
fetch_object_context  id="ISS-XXXX"
```

Keep only ticket title, applied-to part, owner. Do not pull bodies or
comments.

**T5. Find code anchors for each concept** (in parallel where possible).

Grep priority: `~/pear-src/api.pearcommerce.com/src` first, then
`admin.pearcommerce.com`, `offers.pearcommerce.com`, `pear-dashboard`,
`pear-dashboard-api`. Skip repos not present locally.

For each concept, capture:
- **The primary anchor** — file path + line where the concept is defined
  (class declaration, field declaration, enum, or config key).
- **The gating helper** — if the raw field has a reader method (e.g.
  `shouldAllowXxx()`), record it. This is often where the "not obvious"
  logic lives.
- **The call sites that behave differently** — the files that *read* the
  flag/entity. Cap at ~5 most significant.
- **Related-but-distinct siblings** — flags in the same entity that
  participate in the same OR/AND expressions. These are the "older vs newer"
  pairs that trip people up. See `LESSONS.md` on name-stem disambiguation.
- **Kill switches** — grep the concept name against `AWSAppConfigUtil` /
  AppConfig keys. If a helper wraps a raw flag in an AppConfig check, note
  the key.

**T6. Load mastery state.**

Read `~/pear-src/pear-ai-skills/scrum-qa/mastery.json` if it exists. Shape:

```json
{
  "concepts": {
    "location-agnostic-ship-to-home": {
      "first_seen": "2025-07-24",
      "last_asked": "2025-08-14",
      "attempts": 3,
      "misses": 1,
      "notes": "confused with itemAvailabilityDependsOnZip"
    }
  }
}
```

Use this to:
- Sort concepts in the output: **previously-missed first**, then new, then
  previously-nailed.
- Skip concepts marked `mastered: true` unless they haven't been asked in
  30+ days.

If the file doesn't exist, create an empty `{"concepts": {}}` and continue.

**T7. Assemble the drill doc.**

Write to `~/pear-src/pear-ai-skills/scrum-qa/YYYY-MM-DD.md` (or
`YYYY-MM-DD-{shortname}.md` if a matching-date file exists).

Structure — see the **Concept entry template** section below.

**T8. Report.**

Print to chat:
- Path to the file
- Concept count broken down:
  `N new, M previously-missed re-surfaced, K mastered-skipped`
- Any concepts that had no code anchor (so the user can flag them)
- Instruction: after working through the drill, say "mark: X, Y as missed"
  or "mark all as got-it" and the mastery.json will update.

**Do not print the drill doc into chat.** Path + summary only.

### Concept mode

Trigger: the user names a single Pear domain concept and wants to be tested.
Examples:
- "quiz me on location-agnostic ship-to-home"
- "concept: MultiUPCStoreIdBatchAvailabilityUpdater"
- "what participates in URZA saving"

Procedure:

**C1. Resolve the concept.** Grep the codebase for the term (exact, then
case variants). Identify the primary anchor, gating helper, call sites,
sibling flags, kill switches — same as T5 above.

**C2. If `--explain` is set,** emit the direct reference-doc format (see
**Concept reference format** below) and stop.

**C3. Otherwise, emit a single-concept quiz entry** using the **Concept
entry template** and print it directly to chat (no file write for concept
mode — this is meant to be answered in-conversation).

**C4. Update mastery.json** to add or bump `last_asked` for this concept.

## Atlas entries — the persistent artifact

Alongside the mastery.json quiz state, the drill produces **atlas entries**:
concept-shaped markdown files under `~/pear-src/pear-ai-skills/scrum-qa/concepts/`.
These are the durable output — retroactive DDD ubiquitous-language mapping.

**File naming:** kebab-case concept name, e.g. `retailer-zones.md`,
`instacart-list-pipeline.md`, `nationwide-availability.md`. Named for the
**domain concept**, not for the incident that surfaced it (see
`LESSONS.md` on concept-name-over-trigger-name).

**File shape:**

```markdown
# Concept: {Human-readable name} (`{code identifier}`)

_First atlased YYYY-MM-DD after {short provenance — quiz miss, transcript
mention, incident}. Related: [[other-concept]], [[another-concept]]._

## The core idea

{One paragraph: what this concept *is* in the domain. Not the code —
the domain. What problem does it solve.}

## {How it's shaped in code}

{Specific files, classes, fields, gating helpers. File paths as inline code:
`src/com/pear/foo/Bar.java`. Line numbers when they help. Callouts for
sibling entities that share a name-stem — always disambiguate.}

## {Non-obvious rules / flag composition / hidden constraints}

{The tacit stuff. Which flag pairs are load-bearing, what breaks if you
assume 1:1 uniqueness, which class-header Javadoc is a lie.}

## Watch-outs

- {Trap 1 — with the specific query or grep that reveals it}
- {Trap 2}

## Edges

- {Open question the atlas can't answer yet}
- {Piece of the mechanism that isn't traced}
- {Placeholder for a future entry}
```

**Wikilink `[[other-concept]]` between entries liberally.** A link that
doesn't have a matching file yet is fine — it marks a placeholder for a
future entry, not an error. See `LESSONS.md` on edges-are-interesting.

**When an entry is wrong, correct it in place and say so.** Preserve the
correction in the entry's provenance note so future readers see the
adjustment. See `LESSONS.md` on bidirectional correction.

## Concept entry template (for the drill doc, not atlas)

Every quiz entry in the drill doc follows this shape:

```markdown
### {Concept Name}

**Scenario:** {a 1-3 sentence situation that names a symptom, an observation,
or a code fragment — NOT a definition}

**Question:** {what participates? which flags? which helper? what breaks if X?}

<details>
<summary>Hint</summary>

{one line: what area to think in, without naming the answer}

</details>

<details>
<summary>Answer — names only</summary>

{bullet list of the specific entities, methods, flags, files that
participate — no explanation}

</details>

<details>
<summary>Full context</summary>

- **Primary anchor:** [`path/to/File.java:LINE`](path/to/File.java) —
  one-line purpose
- **Gating helper:** `Class.method()` — what it wraps
- **Call sites:** [`caller1.java:LINE`](caller1.java),
  [`caller2.java:LINE`](caller2.java) — what each does with the concept
- **Sibling flags to disambiguate:** `otherFlag` — how it differs
- **Kill switch:** AppConfig `namespace/key` (or "none")
- **Watch-outs:** {gotchas — indexed columns, DTO fields that diverge,
  retailers where the flag is off, etc.}

</details>
```

### Rules for good questions

The learning target has three tiers, in strict priority order. Every quiz
should aim at tier 1 or 2. Tier 3 is a spelling test — avoid.

**Tier 1 — Model & relationships (primary).** What entities exist, what
they mean, what they belong to, how they connect. "Zones belong to
retailers, not ZIPs." "URZAs are scoped to `(upc, retailer, zone)`."
"`ZipRetailerZone` is the join, not the zone itself." Quiz these by asking
the user to describe the structure and then arguing with the parts they got
wrong.

**Tier 2 — Flag-driven behavior modulation (primary).** How an
otherwise-straightforward entity has its runtime behavior bent by flag
composition. `RetailPartner` normally requires a ZIP to answer availability;
flip `locationAgnosticShipToHome = true` and (with the AppConfig kill
switch and the `shouldAllowLocationAgnosticShipToHome()` reader) the same
entity now answers nationally. The class definition doesn't change; the
flags rewrite the semantics. **Most of Pear's "not obvious" domain
complexity lives here, not in class hierarchy.** Quiz these by naming a
symptom or an observed behavior change and asking which flag combo caused
it — or, given a flag flip, what changes downstream.

**Tier 3 — Enumeration (tertiary; usually avoid).** Field names, method
signatures, file paths. Reference material for `--explain`, not drilling.
Only quiz on this after the tier-1/tier-2 model is solid, and only when the
name itself carries meaning (`shouldAllowLocationAgnosticShipToHome` vs raw
field access — that distinction is tier-2 behavior, not tier-3 trivia).

**Question-writing rules:**

- **Scenario over definition.** Never open with "What is X?" Open with
  "You see X in the logs — ..." or "Retailer Y has flag Z = true but ..."
- **Ask what the model looks like, or how flags rewrite it.** Not what
  things are named.
- **Prefer "and what's the trap" endings.** Real recall lives in the
  disambiguation, not the recognition.
- **One question per concept.** No padding.
- **Two-phase drill: quiz, then react.** After the user answers, do NOT
  immediately reveal the full doc. If the answer is partially wrong, quote
  their claim back, name the specific parts that are wrong (without
  correcting them yet), and ask a follow-up. Only reveal after they take a
  second swing or ask for the answer. See `LESSONS.md` on
  argue-before-reveal.
- **When the user makes a claim, argue with it.** If they say "X avoids a
  messy M:N," ask them to describe the M:N alternative — this surfaces
  whether they actually understand the structure or just remember the
  vibe. Treat their words as hypotheses, not answers to grade.
- **Distinguish sibling classes only when the distinction itself teaches
  the model.** `RetailerZone` vs `ZipRetailerZone` is worth surfacing
  because it reveals what the join actually is. But don't test the naming
  for its own sake — test what each *represents* in the model.
- **For flag concepts, always test the composition.** A single flag is
  trivia; a flag + its reader method + its AppConfig kill switch + its
  sibling flag is the actual behavior. Ask the user to describe what
  changes when the flag flips, not what the flag is called.

### Concept reference format (for `--explain`)

Same anchor structure as "Full context" above, but presented flat (no
`<details>`), and preceded by a plain-English "What it means (business)"
paragraph and a "Switches that must all be true" list.

## Mastery updates

After a drill, the user reports results with phrasing like:
- "mark location-agnostic-sth as missed"
- "got URZA and BatchAvailabilityUpdater, missed partitioning"
- "mark all as got-it"
- "mark all as missed" (rare — usually means the drill was miscalibrated)

On each such report, update
`~/pear-src/pear-ai-skills/scrum-qa/mastery.json`:
- Increment `attempts`.
- Increment `misses` if missed.
- Update `last_asked`.
- If a concept has `attempts >= 3` and `misses == 0`, set `mastered: true`.
- If the user included a note ("I confused this with X"), append to `notes`.

Then confirm in chat:
`Updated mastery.json — {N} marked missed, {M} marked got-it, {K} concepts newly mastered.`

## Inputs and paths

- **Transcript source:** pasted inline, or a file path (`~/Downloads/*.vtt`,
  `~/pear-src/pear-ai-skills/scrum-qa/transcripts/*.txt`).
- **Notion source:** `collection://d0799c72-db62-48f8-95a3-e4accd8b4d27`
  (Meeting Notes DB). If stale, `notion-search` for the standup page title
  still resolves.
- **DevRev source:** `fetch_object_context` on any `ISS-\d+` — title + part
  only.
- **Code repos, in priority order:**
  - `~/pear-src/api.pearcommerce.com` (primary)
  - `~/pear-src/admin.pearcommerce.com`
  - `~/pear-src/offers.pearcommerce.com`
  - `~/pear-src/pear-dashboard`, `~/pear-src/pear-dashboard-api`
- **Drill doc dir:** `~/pear-src/pear-ai-skills/scrum-qa/` (create if missing).
- **Atlas dir:** `~/pear-src/pear-ai-skills/scrum-qa/concepts/` (create if
  missing).
- **Mastery file:** `~/pear-src/pear-ai-skills/scrum-qa/mastery.json`.

## Notes

- Never quote long transcript passages in the output. Short quotes
  (< 1 sentence) are fine as scenario anchors; longer is noise.
- If a concept has **no** code anchor and **no** Notion mention, don't
  invent one — mark it "no anchor found; likely business/product term"
  and let the user tag it later.
- For concept-mode invocations mid-conversation, keep the output tight —
  one concept, one question, three collapsible layers. No preamble.
- The mastery file is the source of truth for what's been asked. Don't
  re-ask a mastered concept in the same session unless the user explicitly
  says "include mastered."
- **Atlas entries are the durable artifact.** The drill docs are ephemeral
  quiz material; the atlas entries under `concepts/` are the retroactive
  DDD map that accretes over months. When a drill produces a new fact
  worth remembering, promote it into the relevant atlas entry — don't leave
  it in the dated drill doc.
