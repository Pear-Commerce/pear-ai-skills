# Domain-Atlas: Lessons

These lessons are the disciplines that make the drill produce durable
understanding instead of shallow Q&A. **Read this file every time you invoke
the `domain-atlas` skill, before generating the first question or writing
the first atlas entry.** The lessons are short; the cost is a few hundred
tokens; the effect is that you run the drill Keith and Alex both value
rather than the generic "quiz me on my codebase" version an ML would
default to.

Lessons are grouped into two sections: **drill lessons** (how to run the
back-and-forth) and **atlas-writing conventions** (how to shape the
persistent entries once you've drilled).

---

## Drill lessons

### 1. Trust but verify

Every ML assertion about the codebase goes through a code check before it
lands in an atlas entry. Grep, read the file, run a query — not just quote
what a transcript said or what "seems reasonable."

**Why:** early in this project, the ML claimed
`Status.PENDING`'s Javadoc said "unused" and treated it as vestigial. The
user knew from code patterns it was live; grep found 15+ call sites. The
Javadoc had drifted; the code was truth.

**How to apply:**
- When the ML makes a claim about how a class/flag/method behaves, cite the
  file and line, not just the name.
- When a Javadoc or docstring makes a claim about usage or lifecycle, grep
  for the actual usage before believing it.
- When the user asserts something that contradicts an ML claim, treat the
  user's assertion as a hypothesis worth checking — don't defend the ML
  claim by re-quoting the source that produced it.

### 2. Code is the design

Pear's codebase does not have a canonical design doc separate from the
code. The design lives in the code, in the tacit rules that show up in
sibling method conventions, class-header Javadocs, populator ordering, and
flag composition. Alex Wyler (co-founder) has said this explicitly. Reeves's
1992 "What Is Software Design?" essay is the philosophical basis.

**Why:** if you look for a "the real docs are somewhere else" source of
truth, you'll waste time. The atlas is the retroactive design doc.

**How to apply:**
- Don't ask the user for a design doc that doesn't exist. Read the code.
- When the atlas describes a subsystem, source claims from specific files
  and line numbers, not from a hypothetical spec.
- Class-header Javadocs are one form of embedded design commentary — read
  them, but verify against actual call sites (see Lesson 1).

### 3. Concept → code map

The atlas is DDD's ubiquitous-language work done retroactively. Each entry
maps a **domain concept** (the thing a product person or a support engineer
would name) to the **packages, classes, fields, flags, and helper methods**
that carry it. Not the other way around.

**Why:** the user's stated gap is: *"our domain is pretty good at the code
level but not obvious."* Meaning: the code has good names for the pieces
but the *combinations* — how a straightforward entity gets its behavior
bent by flags and gating helpers — aren't legible without domain framing.
Concept→code is the direction that closes the gap.

**How to apply:**
- Start every atlas entry with the concept, in the reader's vocabulary.
  ("Location-agnostic ship to home." "Zones." "Availability states.")
- Follow with what pieces of code carry it. Not the reverse.
- If a concept doesn't yet have a name in Pear's vernacular, propose one
  and mark it as a working name.

### 4. Argue before revealing

When quizzing the user, do not immediately reveal the answer. Ask the
question, wait for the user to defend a position, and then argue with the
specific parts of their answer that are wrong or partial. Only reveal the
full answer after the user takes a second swing or explicitly asks for it.
And the same discipline applies in the other direction: when the user
makes a claim, argue with it rather than nodding.

**Why:** the learning happens in the reaction to being challenged, not in
reading the answer. When the user says "X avoids a messy M:N," asking them
to describe the M:N alternative surfaces whether they actually understand
the structure or just remember the vibe. Similarly, when the ML has an
answer that looks right on its face, forcing it to defend the answer often
surfaces that it was pattern-matching, not reasoning from the code.

**How to apply:**
- Never open a quiz reveal with the answer. Open with a follow-up question
  or a quoted-back version of the user's claim.
- When the user pushes back on an ML claim, do not defend it by re-asserting.
  Go back to the code and check.
- Treat both parties' claims as hypotheses, not answers. See Lesson 13
  (bidirectional correction).

### 5. Cause vs symptom

When a ticket, commit, or discussion names a specific retailer, brand, or
scenario, ask: *is this the cause, or is this a symptom of a base-class
shape?* Base-class fixes signal a symptom-shaped bug that likely applies
to sibling subclasses.

**Why:** Pear's codebase has repeated shapes across retailers. When
`RecipeToUPCResolver` was fixed "for Ahold," the actual bug was in the
resolver's general handling of flexible-ingredient UPCs — Ahold was one
symptom of that shape, not the whole story. Atlasing the fix as "the Ahold
bug" would have missed the concept entirely.

**How to apply:**
- When a commit message names a retailer, look at what class the fix
  actually touches. If the class is a base class or a general-purpose
  helper, the bug is symptom-shaped.
- Atlas entries should be named for the domain concept
  (`flexible-ingredients.md`), not the trigger incident
  (`ahold-bug.md`).
- When the user asks "why is retailer X broken," check whether the same
  breakage would apply to retailers Y and Z given the code shape.

### 6. Systemic vs unblock

Two legitimate goals when triaging a ticket: **systemic correctness** (fix
the underlying data/code/class-of-bug via normal write paths) and
**unblock speed** (get this campaign live via direct manipulation — manual
flag flip, JSP one-shot, ad-hoc DB update). Neither is universally
"better"; pick which dominates *right now* before recommending an approach.

**Why:** Pear runs time-boxed brand campaigns constantly. Many tickets
have the shape *"[Brand] going live [this week] with [product] at
[retailer], please fix availability."* The urgency is real; the underlying
fix is often systemic; and the temptation to lecture about "the right way"
instead of unblocking is real. Both goals deserve tools.

**How to apply:**
- When triaging, ask about the launch/deadline dimension before
  recommending an approach.
- Recommend fixes in tiers, cheapest-to-most-systemic. Name what each
  tier does, what it doesn't, and when it's the right choice.
- Do not frame the systemic fix as universally better.
- When an unblock-speed fix is chosen, name the systemic followup that
  should still happen. Both can be true simultaneously.
- Prefer JSP one-shots for direct manipulation over ad-hoc DB updates —
  the `s3://assets.pearcommerce.com/jsp-log` archival trail creates an
  audit record.

### 7. Verify database claims with queries, not assumptions

When the ML makes a quantitative claim about the database — sizes, counts,
ratios, cardinality — run the query. Do not cite numbers from transcripts
or hypothesize from "reasonable defaults."

**Why:** during atlas work, the ML claimed "~100k UPCs" from a transcript
paraphrase; the user's `SELECT COUNT(*) FROM UPC WHERE hidden = 0` returned
2.3M. The ML also claimed a "3× mapping ratio" between two tables; the
query showed 1:1. Both fabrications survived until challenged.

**How to apply:**
- Anytime the ML wants to make a numerical claim, offer to run the query
  first.
- Never quote numbers from a transcript unless you can point to the
  authoritative source that produced them.
- Prefer `SELECT COUNT(*)` and `SELECT DISTINCT` for cardinality claims.
  Prefer `EXPLAIN` for index-shape claims.
- **At Pear specifically:** never propose unbounded SELECT against
  `UPCRetailerZipAvailability` or `PageLoad` — these are the only tables
  with write volume high enough to drive the RDS-crash history-length
  alert. Bound queries with `LIMIT`, `WHERE dateAdded >`, or specific keys.

### 8. Edges are interesting

Atlas entries should end with open questions and placeholder slots, not
polished conclusions. Entries that read as "here's the complete story"
go stale silently — they *look* current when they aren't.

**Why:** the atlas is a living map, not a spec. The interesting work
happens at the edges — the piece of the mechanism that isn't yet traced,
the assumption that hasn't been checked, the sibling entity whose
relationship to this one is unclear.

**How to apply:**
- Every atlas entry ends with an "Edges" or "Open questions" section
  listing things the entry can't answer.
- Placeholder wikilinks `[[future-concept]]` that don't have a matching
  file yet are fine — they mark future work.
- When an atlas entry starts to look "done," add an edge deliberately.
  If nothing is unknown, you're not looking hard enough.

### 9. Grep beats docstrings in legacy codebases

Sub-case of Lesson 1, but named separately because it's the *specific
verification move* most often applicable. Docstrings and class-header
Javadocs make claims about a class's usage, lifecycle, or intent. In a
long-lived codebase, those claims drift. The grep is the code.

**Why:** the `Status.PENDING` moment. Also: many "unused" comments in
Pear code turn out to reference call sites that were added later. The
comment claims the code is dead; the grep proves it live.

**How to apply:**
- When a docstring says "deprecated," "unused," "legacy," "TODO remove,"
  or similar — grep before believing.
- When a Javadoc describes a method's purpose, cross-check against 2-3
  callers to see if the actual usage matches the described purpose.
- If the docstring and the code disagree, atlas the mismatch — that's
  meta-lesson content for other readers.

### 10. Concept name over trigger name

Atlas entries are named for the **domain concept** they map, not the
**incident that surfaced them**. `flexible-ingredients.md`, not
`ahold-bug.md`. `cold-start-trap.md`, not `iss-7984.md`.

**Why:** the trigger is a snapshot in time. The concept persists. Naming
by trigger produces entries that go stale as soon as the ticket closes;
naming by concept produces entries that stay useful across future
incidents that touch the same shape.

**How to apply:**
- Before creating a new entry, ask: "if this ticket had never existed,
  would I still name it this way?" If no, rename to the concept.
- If a concept doesn't have a clean domain name yet, propose one and
  mark it as a working name.
- Related to Lesson 5 (cause vs symptom) but architecturally distinct:
  cause-vs-symptom is about *what to fix*; concept-over-trigger is about
  *how to organize the atlas*.

### 11. When a senior engineer isn't sure, that's data

When someone with deep tenure — a co-founder, a long-time senior engineer,
a domain expert — is fuzzy on a mechanism they wrote or reviewed, that
fuzziness is atlas-shaped signal. Two common causes: (a) the boundary
moved (the mechanism was refactored), or (b) it *feels like* a service
without *being* one (e.g., a headless Chromium spawned by a Quartz job
that "acts like a Lambda" but isn't).

**Why:** in scrum today, Alex Wyler said "I forget if it's like a Lambda
or something else, or maybe just Pear Commerce" about the purchase-event
pixel firing path. The Explore agent found it's not Lambda; it's a Quartz
job spawning headless Chromium behind a proxy. The fuzziness itself
mapped to a legibility hazard — the mechanism looked like a service
from a distance without being one.

**How to apply:**
- When a senior person is uncertain about a mechanism, don't just resolve
  the uncertainty — atlas the *shape of the uncertainty*. "Feels like X,
  is actually Y" is a legibility hazard worth naming.
- Don't assume the senior person is right about their own uncertainty
  (see Lesson 1) — verify.
- These moments are especially good candidates for atlas entries because
  they combine "worth explaining" (the fuzziness signals non-obviousness)
  with "verifiable" (the code has an actual answer).

### 13. Bidirectional correction

The drill catches both the user and the ML being wrong. When the ML
generates a quiz question, gets a partial or wrong answer from the user,
reveals a "correct" answer, and then discovers the "correct" answer was
*also* wrong — the atlas records both corrections, not just the user's.

**Why:** the retailer-zones story. The user's first-quiz answer conflated
`RetailerZone` and `ZipRetailerZone`. On the re-quiz, the ML's prior
atlas entry had done the same thing — collapsed the two into one. The
drill produced the atlas correction rather than either party's starting
position.

**How to apply:**
- When correcting the user, cite the code, not authority. If the code
  turns out to have been read wrong by the ML, correct the atlas openly.
- Preserve the correction in the atlas entry's provenance note. Don't
  pretend the entry was right the first time.
- Bidirectional correction is what makes this a drill and not a lecture.
  If the quiz only ever catches the user, it's a lecture.

### 14. Retroactive DDD is legitimate work

The atlas is neither notes nor documentation nor design-up-front. It's
**design reconstruction from a running system** — retroactive
ubiquitous-language mapping over a codebase that skipped DDD initially.
This is a legitimate third category of software engineering work, distinct
from "code the design" and "test-driven emergent design."

**Why:** users (and reviewers, and future readers) will sometimes dismiss
the atlas as "just notes." It isn't. It's the ubiquitous-language layer
Evans described, produced retroactively because the codebase already
exists. Named explicitly, this legitimizes the effort and helps future
maintainers understand *what kind of artifact* they're reading.

**How to apply:**
- When explaining the atlas to a new reader, frame it as retroactive DDD
  work, not as notes.
- When someone asks "why not just read the code?" — the code answers
  "what," the atlas answers "what does this map to in the domain." Both
  are needed.
- The atlas is *institutional memory* once it accretes. Don't underweight
  entries just because they're small — they compound.

---

## Atlas-writing conventions

### 12. Disambiguate name-stem collisions explicitly

Pear's codebase has repeated patterns where two things share a name-stem
and differ only by prefix or suffix: `RetailerZone` vs `ZipRetailerZone`,
`URD` (`UPCRetailerData`) vs `LURD` (`LogicalUPCRetailerData`),
`RetailPartnerPostalCodePrefix` vs `RetailPartner_to_Zipcode`,
"Partner API" vs "the API." Readers hear the shared stem and assume the
things are the same, or nearly-the-same. **They usually aren't.**

**Why:** the human ear/mind reads "sounds like" as "is." That mapping is
often wrong in this codebase. The retailer-zones entry had to explicitly
call out `RetailerZone` vs `ZipRetailerZone` as *two different tables
with different purposes* because a prior atlas version had denied one of
them existed.

**How to apply:**
- When an atlas entry names a concept, explicitly disambiguate any
  sibling name-stems in the same paragraph. Don't leave the reader to
  discover the distinction.
- Prefer paired tables of the form:
  ```
  | `Foo`     | "What foos exist?" — canonical set   |
  | `BarFoo`  | "Given a bar, which foo?" — lookup   |
  ```
- When atlasing a concept whose name is a substring of another concept,
  cross-link both entries and state the disambiguation on each side.
- This convention differs from the other lessons in that it's a
  **rule about atlas entries**, not a rule about running the drill.
  Included here because entries that skip it produce silent misreads.
