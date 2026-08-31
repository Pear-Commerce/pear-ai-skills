# Fixtures — Tillamook deal (worked example)

A single real deal, used to develop and test `deal-risk-review` and
`pipeline-review`. Preserved because Snowflake access broke mid-development
(see "Access outage" below) and the scratchpad holding the raw pulls was wiped.

## What is here

| File | Provenance | Completeness |
|---|---|---|
| `tillamook-2026-06-26-call.txt` | Pulled verbatim from `GONG.GONG_DATA_CLOUD.CALL_TRANSCRIPTS`, flattened and speaker-attributed | **Full transcript.** 141 turns, ~6,400 words |
| this file | Reconstructed from quotes verified during the session | **Partial.** Quotes are verbatim; surrounding context is not |

The Aug 10 and Jul 10 transcripts and the 13 email bodies were pulled and read
but the files were lost. Everything quoted below was verified against the
source at the time. **Treat the quotes as real and the coverage as incomplete** —
absence of a quote here is not evidence of absence in the deal.

## The deal

Tillamook County Creamery Association (HubSpot company `43759384878`),
Subscription Revenue pipeline (`28268628`, all new business). Open as of
2026-08-31. Rep: Shannon Wnuk. Displacing incumbent **Destini**.

Three calls, all `STATUS = 'COMPLETED'`:

| Date | Title | conversation_key | Attendees |
|---|---|---|---|
| 2026-06-26 | "Natalia Nunez and Shannon Wnuk" | `4de3adb8…` | Natalia Nunez, Katherine "Kat" Morrison · Shannon |
| 2026-07-10 | "Pear <> Tillamook \| Part 2" | `45bbeab6…` | Natalia, Kat, Emma Andersen · Shannon |
| 2026-08-10 | "Pear <> Tillamook \| Intro/Demo" | `fc22c4aa…` | Natalia, Katie Macdonald · Shannon, Eric Martell |

**Note the titles mislead.** The call named "Intro/Demo" is the third touch;
"Part 2" precedes it by a month; the first call is titled after two people and
would be missed by any `%Tillamook%` title search. This deal is the reason
`deal-risk-review` says to search by participant email domain.

## Cast

| Person | Role | Notes |
|---|---|---|
| Natalia Nunez | Sr Manager, Marketing | **Champion.** Drives everything |
| Katie Macdonald | Director, lifecycle marketing (martech, paid media, digital, loyalty, service) | Natalia's boss. Joined 2026-08-10 |
| Katherine "Kat" Morrison | Digital Marketing Manager | |
| Emma Andersen | PR / creator team | Joined 2026-07-10 |
| — | **IT team** | **Funds the contract. Never met Pear** |
| — | VP | Socialized secondhand by Natalia. Never met Pear |

## Verified quotes

### 2026-06-26 — pricing and process (full transcript in this directory)
- Rate card: $15,000/yr base **per product**, plus a tiered per-UPC fee. Sized
  at 208 UPCs pulled from Tillamook's Destini locator; locator alone ≈ $45k/yr.
- Natalia: *"end of July, I need to kind of get in like this is the number I'm
  asking for to switch from Destiny to a new vendor next year."*
- Natalia: *"We have to do some internal politicking… I anticipate that
  socializing is going to take me at least a few weeks."*
- Natalia: *"Decision not a me decision."*
- Kat: can't email consumers about a new product until it appears in Destini;
  Sarkana takes weeks, plus Destini lag on top.

### 2026-07-10 — budget season
- Natalia: *"we are in budget season right now and I am making the pitch for at
  least product finder, PDPs, shoppable recipes."*
- Natalia: *"it is more than we're paying for Destiny right now significantly"*;
  later, *"we're asking three times more."*
- Natalia: *"we currently have support of our directors. Emma was in a meeting
  yesterday where I very intentionally brought it up in front of our VP as well
  to kind of get excitement about it."*
- Natalia: *"I don't expect this to be a fast closing deal. We're just trying to
  ensure we have budget for this next year."*
- Natalia: *"Kat and I are just like, we really want to replace Destiny with you
  all."*
- Natalia on strategy: ask for everything, let them whittle it down.
- Natalia on Destini expiry: *"I want to say it's like February"* — **wrong, she
  corrects this by email on Jul 29**.
- Emma's creator pilot baseline: 5 creators, 2.5K clicks, **161 add-to-carts,
  ~$1,000 in sales**; *"that would probably be our starting KPI for like a
  quarter."* Incumbent tool caps campaigns at 12 weeks and 6 SKUs, not evergreen.
- Emma: *"our direct person we'd be reporting to she's very data driven."*
- Shannon offers 15 months at the 12-month rate, free onboarding, no double-pay.

### 2026-08-10 — Director diligence
- Natalia: *"I'm going to ping my boss, Katie."*
- Shannon: *"instead of making Natalia hear me do that for the third time"* —
  confirms this is not an intro.
- Katie: *"I lead the lifecycle marketing team at tillamook overseeing our
  marketing technology, our paid media, our digital, our loyalty, and our
  customer service group."*
- Katie: *"we're using Destiny today and obviously it's based off of scans data…
  what else would you say is a big differentiator of your product versus what
  we're using today?"* — answered with a feature list, not a displacement case.
- Katie: *"if we're considering bringing a product or service on board, what it
  can do in total"* — buying language.
- Katie ranks: *"that's the longer tail here. But back to the core product."*
- Katie diligence: does Pear resell their data; is it proprietary to them; can
  it reach attribution; can it include their own DTC.
- Katie: *"I know you've hit all in our top six, which is great."*
- Shannon's shelf-intelligence demo fails live: *"I can't get it to pull up
  right now, which is my own problem."*
- No next step set. Call ends *"we'll be in touch with you soon."*

### Emails (27 between 2026-06-16 and 2026-08-12; thread history back to Dec 2023)
- **Jul 28**, Shannon: *"I know you were planning to work through internal
  discussions and budget planning… any updates?"*
- **Jul 29**, Natalia: *"I'm currently scheduled to enter budget meetings on
  August 7."* · *"We're hoping to ride this positive momentum into budget
  approval with our **IT team, who will be funding the contract**."* · asks for
  an NDA · *"we realized our contract end with Destini is **April 2027**."*
- **Jul 29**, Shannon: NDA yes. Free onboarding Jan 1–Mar 31 2027; paid term
  Apr 1 2027–Mar 31 2028. *"Do you think it would be realistic to work towards a
  signed agreement by **end of September**?"* — **never answered**.
- **Jul 30**, Shannon: scope grows to **312 UPCs**, +~$5k across options; V2
  quote tab. NDA redlines (Delaware venue, 5-year term).
- **Aug 4**, Natalia: *"My Legal team accepted all redlines and signed."* ·
  *"my Director is requesting to participate in a Pear demo. Of particular note
  is how Pear will track inventory."*
- **Aug 4**, Shannon: countersigned; offers Eric for the technical questions.
- **Aug 11**, Natalia: *"Katie and I are actively in budget discussions right
  now, and likely need at least another week."* · *"To help bolster our case,
  Katie was curious if Pear had any case studies pointing towards ROI."*
- **Aug 12**, Shannon: four-step methodology, case-study links, and the hedge
  *"we're careful not to position Pear as providing a complete view of total
  sales attribution."* No figures. **Last contact.**

## Why this deal is a good test case

It breaks the naive analysis in six separate ways, each of which drove a rule
in `deal-risk-review`:

1. Title search misses a third of the calls.
2. The call titled "Intro/Demo" is the last one, not the first.
3. The decision process lives almost entirely in **email** — a call-only read
   scores Decision Process as Missing when it is well mapped.
4. Gong's *synthesized* account insights get the champion, the call stage, and
   the criteria count wrong. Only verbatim works.
5. ASR drops the dollar figures (*"currently around, okay?"*), so the incumbent
   rate is unknown while the **ratio** (3x) survives in words.
6. The economic buyer (IT) appears **only** in email and in no call.

## Known-good analysis output

MEDDICC across the whole deal, scored 2026-08-31: Metrics **Partial** ·
Economic Buyer **Partial** · Decision Criteria **Strong** · Decision Process
**Strong** · Identify Pain **Strong** · Champion **Strong** · Competition
**Partial**.

Live risks at that date: ROI request open 20 days; 20 days silence with the
champion 13 days past her own commitment; Sept 30 signature target
unacknowledged for a month; IT never engaged. Destini expires 2027-04-01
(7 months out — **not** 20; an early draft got this wrong by eyeballing).

## Pipeline baselines (verified before the outage)

Subscription pipeline `28268628`, closed deals. **Gong went live in Sales at the
start of 2025** — transcript coverage by close year: 2023 **0%**, 2024 **4.8%**,
2025 **59.5%**, 2026 **78.8%**. Scope any historical analysis to 2025+.

Closed 2025+: 499 deals, 99 won, base win rate **19.8%**. Win rate by
transcribed call count: 0 → 9.9% (n=172) · 1 → 5.6% (n=144) · 2–3 → 33.3%
(n=141) · 4–6 → 60.5% (n=38) · 7+ → 100% (n=4). Call linkage: 327 deals via the
`opportunity` path, 379 via `account`, 384 via either, 115 genuinely call-free.
~70 open deals on the pipeline.

## Access outage (2026-08-31)

Metabase's Snowflake connection resolves to `PEAR_DASHBOARD_ROLE`, which cannot
reach the `GONG` database, `PEAR_DB.HUBSPOT`, `HUBSPOT_STAGING`,
`HUBSPOT_ANALYTICS`, `RAW_DATA_GONG`, or most of `RAW_DATA_HUBSPOT` (only the
`*_ANALYTICS_*_REPORT` tables remain). MySQL and Maxio schemas are unaffected.
Confirmed org-wide, not specific to one API key. See `snowflake-jdbc` for the
double-`role`-parameter hazard that matches this signature.

Until it is restored, these fixtures are the only available input for
developing these skills.
