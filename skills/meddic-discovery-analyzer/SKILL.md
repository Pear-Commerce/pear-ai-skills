---
name: meddic-discovery-analyzer
description: Analyze sales discovery call transcripts against the MEDDIC qualification framework and generate priority next steps for the call owner. Use this skill whenever a user shares a call transcript (or call notes, call recording summary, or meeting notes from a sales call) and asks for analysis, feedback, a debrief, or next steps. Also trigger when someone says "analyze this call," "what did we miss," "score this against MEDDIC," "give me my next steps," or "debrief this discovery call." If a transcript is present and the context is B2B sales, default to using this skill even if MEDDIC isn't mentioned explicitly.
---

# MEDDIC Discovery Call Analyzer

A skill for analyzing B2B sales discovery call transcripts against the MEDDIC qualification framework and producing a structured debrief with prioritized next steps for the call owner.

## What This Skill Produces

1. **MEDDIC Scorecard** — a visual scorecard rating each of the 6 MEDDIC elements as Strong / Partial / Missing, with specific evidence from the transcript and a brief diagnosis of the gap
2. **Sales Leader Commentary** — a plain-language debrief written from the perspective of an experienced sales leader, covering what went well, what was missed, and what patterns stand out
3. **Priority Next Steps** — a short, opinionated list of the most important actions for the call owner, sequenced by urgency and impact
4. **Mutual Action Plan Email** — a ready-to-send follow-up email from the AE to the buyer contact, summarizing what was discussed, confirming next steps, and proposing a shared timeline to move the deal forward

## Output Standards

- Write from the perspective of a senior B2B sales leader who is direct, practical, and has seen these patterns before
- Don't pad. If an element is genuinely strong, say so and move on. Spend words on the gaps.
- Be specific — always reference exact moments, quotes, or named stakeholders from the transcript rather than making generic observations
- Next steps should be immediately actionable (specific ask, specific person, specific timeframe where possible)
- Avoid jargon-heavy MEDDIC lecture. The call owner already knows the framework — they need judgment, not definitions.

---

## Step 1: Read and Parse the Transcript

Real sales call transcripts often open with significant small talk — sports, logistics, technical issues, casual rapport-building. Skip past this. Your job is to find the substantive sales conversation, which typically begins when someone says something like "let's jump in" or "here's what I want to cover today."

Once you're in the substance, orient yourself:

- Who are the participants and their roles (buyer side vs. seller side)?
- What product/platform is being sold?
- What stage is this deal in (first call, follow-up, late-stage)?
- What is the competitive context (status quo, named competitors)?
- What is the timeline pressure, if any?

Extract this context from the substantive portion of the call only. Preamble chatter does not count as evidence for any MEDDIC element.

---

## Step 2: Score Each MEDDIC Element

For each element, assign a rating and write a 2–4 sentence assessment grounded in the transcript.

### Rating Scale

| Rating | Meaning |
|--------|---------|
| **Strong** | The element is well-established, mutually confirmed, and unlikely to blow up the deal |
| **Partial** | Some evidence exists but it's incomplete, unconfirmed, or one-sided |
| **Missing** | No meaningful signal. This is a live deal risk. |

### Element-by-Element Guidance

**M — Metrics**
What quantifiable business outcomes did the buyer confirm? Did the seller present ROI and did the buyer validate it, push back on it, or ignore it? Is there an agreed baseline and success metric, or just seller math the buyer hasn't bought into?

Watch for: Seller-built ROI the buyer hasn't endorsed. Vague statements like "there's definitely value here." No agreed definition of success.

**E — Economic Buyer**
Who controls the budget? Is the person in the room the decision-maker, or are they an influencer/champion who needs to sell up? Was the economic buyer named? Is there a path to them?

Watch for: Multiple layers above the contact. "I'll need to bring this to..." statements. Budget cycle questions that reveal the contact doesn't control spend.

**D — Decision Criteria**
What explicit criteria is the buyer using to evaluate options? Did they rank or prioritize them? Is there an RFP, a scorecard, or an informal list of requirements?

Watch for: Criteria stated but not prioritized. Criteria that favor the competitor. Unspoken criteria (ease of use, political safety, "free is hard to beat") that weren't surfaced.

**D — Decision Process**
What are the steps and timeline to a decision? Who needs to be involved at each stage? What approvals, security reviews, procurement steps, or executive sign-offs are required?

Watch for: "We'll circle back in a few months." No named next step. Budget cycle timing that makes the deal impossible in the current period. No map of internal stakeholders.

**I — Identify Pain**
Is the pain specific, quantified, and felt personally by the buyer? Did the buyer articulate it unprompted (stronger signal) or only in response to leading questions?

Watch for: Acknowledged pain that isn't urgent. "It's a problem but we're managing." Pain that exists for the field but isn't felt by the economic buyer.

**C — Champion**
Does the seller have a true champion — someone who has access to the economic buyer, is personally motivated to make the deal happen, and is willing to sell internally on the seller's behalf? Or do they have a coach who is friendly but passive?

Watch for: The "enthusiastic but powerless" contact. Someone who says "I'll take it back" but has no relationship with the buyer. No evidence the champion has tested internal appetite.

---

## Step 3: Render the Scorecard Visually

Use the `mcp__visualize__show_widget` tool to render an SVG scorecard (call `mcp__visualize__read_me` with `modules: ["data_viz"]` first if you have not already this session). If no visualize tool is available, render the scorecard as a markdown table with the same columns instead — never skip the scorecard. See the visual format spec in `references/scorecard-visual-spec.md`.

The scorecard must:
- Show all 6 MEDDIC elements as rows
- Use color coding: green (#1D9E75) for Strong, amber (#BA7517) for Partial, red (#A32D2D) for Missing
- Include the deal name and buyer/seller context in the header
- Include 2-line evidence summaries per row (pulled from the transcript)
- Show the rating badge on the right side of each row

---

## Step 4: Write the Sales Leader Commentary

After the scorecard, write 3–5 paragraphs of plain-language debrief. Structure:

1. **What the call accomplished** — give credit where it's due. What intel was gathered, what rapport was built, what signals were positive?
2. **The critical miss(es)** — identify the 1–2 things that, if left unaddressed, are most likely to stall or kill the deal. Be specific about the moment it happened and what should have been said or asked instead.
3. **The competitive situation** — assess the actual competitive risk based on what was said. Don't just restate the facts; offer a judgment.
4. **Pattern recognition** — if there's a broader pattern in how the seller ran the call (too passive, let the buyer control the agenda, presented too early, didn't push on the buyer, etc.), name it.

---

## Step 5: Write Priority Next Steps

Write 4–6 next steps, ordered by urgency and impact. Each step should include:

- A clear action (verb-first)
- The specific person or audience it targets
- The purpose/goal
- A suggested timeframe where relevant

Format as a numbered list. Be opinionated — don't list everything, just the things that actually move the deal.

---

## Step 6: Write the Mutual Action Plan Email

After the priority next steps, draft a follow-up email the AE can send to the primary buyer contact within 24 hours of the call. This email serves two purposes: it shows professionalism and follow-through, and it creates a written record of agreed next steps that the buyer has to actively disagree with — which flushes out ghosting early.

### Email Structure

**Subject line:** Following up — [Company] × [Seller] next steps

**Opening (1–2 sentences):** Thank them briefly and reference one specific thing from the call that signals you were listening — not generic "great talking to you" filler. Name something real.

**What we covered (3–5 bullet points):** A tight summary of the substantive topics discussed. Not a transcript recap — just the key points that matter to the buyer. Frame these from the buyer's perspective (their challenges, their goals) not the seller's (our product, our features).

**What we're sending / doing on our end (seller commitments):** List 2–3 specific deliverables the seller committed to on the call, with a timeframe. If none were explicitly committed to, include what the AE should logically be sending based on the MEDDIC gaps — e.g., a creative pricing proposal, a champion enablement brief, a data comparison.

**Proposed next steps with dates (the MAP):** A short table or bulleted list with:
- Action item
- Owner (Seller or Buyer)
- Target date

Pull these from the priority next steps, but translate them into buyer-friendly language — no internal sales framework terminology, no mentions of "champion" or "economic buyer." Frame everything around the buyer's goals and timeline.

**Soft CTA:** Close with one clear ask — typically to confirm the proposed next steps or suggest a time to reconnect. Make it easy to say yes.

### MAP Email Standards

- Tone: warm but businesslike. Not sycophantic, not stiff.
- Length: scannable in under 60 seconds. If it's too long, the buyer won't read it.
- Specificity: every bullet and action item should be concrete — named people, named deliverables, named dates where possible. Generic follow-up emails get ignored.
- Seller commitments go first — lead with what you're doing, not what you're asking for. It signals good faith.
- The MAP table should have no more than 5–6 rows. If there are more actions than that, prioritize.
- Do not include MEDDIC gaps, internal deal assessments, or anything that reads as "sales process" to the buyer. This is their document, not yours.
- If there were items discussed but left unresolved (e.g., a meeting that needs to be scheduled, a stakeholder who needs to be looped in), include those as open items with a soft nudge.

### Render the Email

Output the email inline in the response as markdown, inside a fenced block so the AE can copy it cleanly. Include the subject line as the first line.

If the AE asks for something they can forward or open in a mail client, publish it with the `Artifact` tool instead (load the `artifact-design` skill first).

Note: the `message_compose_v1` tool referenced by the original upstream version of this skill does not exist in Claude Code. Do not attempt to call it.

---

- This is a post-call debrief tool, not a training module. Skip preamble, definitions, and framework recaps.
- Write to the call owner directly. Use "you" and "the team" rather than "the seller."
- Be honest about deal risk. Don't soften it.
- If the deal looks strong, say so. Don't manufacture gaps just to fill a rubric.
- If the call was poorly run, say so clearly — but make the feedback constructive and forward-looking.

---

## Reference Files

- `references/scorecard-visual-spec.md` — SVG layout spec and color system for the scorecard widget
- `references/map-email-example.md` — Example mutual action plan email showing correct tone, structure, and MAP table format
