# Scorecard Visual Spec

## SVG Layout

- ViewBox: `0 0 680 [H]` where H = 70 (header) + (number of elements × 84) + 20 (bottom padding)
- For 6 MEDDIC elements: H = 70 + (6 × 84) + 20 = 594
- Safe x range: 40–640

## Color System

| Rating | Left bar | Badge fill | Badge stroke | Badge text |
|--------|----------|------------|--------------|------------|
| Strong | #1D9E75 | #EAF3DE | #3B6D11 | #27500A |
| Partial | #BA7517 | #FAEEDA | #BA7517 | #854F0B |
| Missing | #A32D2D | #FCEBEB | #A32D2D | #791F1F |

## Row Structure (per element)

Each row is 80px tall with 4px gap between rows.

```
y_start = 70 + (row_index × 84)

<rect x="40" y="{y_start}" width="600" height="80" rx="8" fill="none" stroke="var(--color-border-tertiary)" stroke-width="0.5"/>
<!-- 6px left accent bar (color = rating color) -->
<rect x="40" y="{y_start}" width="6" height="80" rx="3" fill="{rating_color}"/>
<!-- Element label -->
<text class="th" x="60" y="{y_start + 26}">M — Metrics</text>
<!-- Evidence line 1 -->
<text class="ts" x="60" y="{y_start + 46}">Line 1 of evidence (max ~90 chars)</text>
<!-- Evidence line 2 -->
<text class="ts" x="60" y="{y_start + 60}">Line 2 of evidence (max ~90 chars)</text>
<!-- Rating badge -->
<rect x="590" y="{y_start + 28}" width="38" height="22" rx="4" fill="{badge_fill}" stroke="{badge_stroke}" stroke-width="0.5"/>
<text class="ts" x="609" y="{y_start + 43}" text-anchor="middle" fill="{badge_text}">{Strong|Partial|Missing}</text>
```

## Header Structure

```
<!-- Title -->
<text class="th" x="40" y="36" style="font-size:16px">{Deal name} — {Buyer company} × {Seller company}</text>
<!-- Subtitle -->
<text class="ts" x="40" y="54">{Date if available} · {Key participants}</text>

<!-- Legend -->
<rect x="400" y="22" width="12" height="12" rx="3" fill="#1D9E75"/>
<text class="ts" x="418" y="33">Strong</text>
<rect x="463" y="22" width="12" height="12" rx="3" fill="#BA7517"/>
<text class="ts" x="481" y="33">Partial</text>
<rect x="529" y="22" width="12" height="12" rx="3" fill="#A32D2D"/>
<text class="ts" x="547" y="33">Missing</text>
```

## Required Defs Block

Always include at the top of every SVG:

```svg
<defs>
  <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
    <path d="M2 1L8 5L2 9" fill="none" stroke="context-stroke" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  </marker>
</defs>
```

## Evidence Text Rules

- Max ~90 characters per line before it risks overflow at 12px
- Pull direct evidence from transcript (paraphrased, not quoted)
- If an element is Missing and there's no evidence to cite, state what was NOT surfaced: e.g., "No economic buyer named. Contact may not control budget."
- Keep both lines tight — the row is only 80px tall

## Full Example (6 rows, H=594)

```svg
<svg width="100%" viewBox="0 0 680 594" role="img">
<title>MEDDIC scorecard</title>
<desc>MEDDIC qualification scorecard for [deal name]</desc>
<defs>...</defs>

<!-- Header -->
<text class="th" x="40" y="36" style="font-size:16px">Deal Name — Buyer × Seller</text>
<text class="ts" x="40" y="54">Date · Participants</text>
<rect x="400" y="22" width="12" height="12" rx="3" fill="#1D9E75"/>
<text class="ts" x="418" y="33">Strong</text>
<rect x="463" y="22" width="12" height="12" rx="3" fill="#BA7517"/>
<text class="ts" x="481" y="33">Partial</text>
<rect x="529" y="22" width="12" height="12" rx="3" fill="#A32D2D"/>
<text class="ts" x="547" y="33">Missing</text>

<!-- Row 0: M — Metrics (y_start=70) -->
<rect x="40" y="70" width="600" height="80" rx="8" fill="none" stroke="var(--color-border-tertiary)" stroke-width="0.5"/>
<rect x="40" y="70" width="6" height="80" rx="3" fill="#BA7517"/>
<text class="th" x="60" y="96">M — Metrics</text>
<text class="ts" x="60" y="116">Evidence line 1...</text>
<text class="ts" x="60" y="130">Evidence line 2...</text>
<rect x="590" y="98" width="38" height="22" rx="4" fill="#FAEEDA" stroke="#BA7517" stroke-width="0.5"/>
<text class="ts" x="609" y="113" text-anchor="middle" fill="#854F0B">Partial</text>

<!-- Row 1: E — Economic buyer (y_start=154) -->
<!-- Row 2: D — Decision criteria (y_start=238) -->
<!-- Row 3: D — Decision process (y_start=322) -->
<!-- Row 4: I — Identify pain (y_start=406) -->
<!-- Row 5: C — Champion (y_start=490) -->
</svg>
```

## y_start Quick Reference (6 rows)

| Row | Element | y_start | Title y | Line 1 y | Line 2 y | Badge y |
|-----|---------|---------|---------|----------|----------|---------|
| 0 | M — Metrics | 70 | 96 | 116 | 130 | 98 |
| 1 | E — Economic buyer | 154 | 180 | 200 | 214 | 182 |
| 2 | D — Decision criteria | 238 | 264 | 284 | 298 | 266 |
| 3 | D — Decision process | 322 | 348 | 368 | 382 | 350 |
| 4 | I — Identify pain | 406 | 432 | 452 | 466 | 434 |
| 5 | C — Champion | 490 | 516 | 536 | 550 | 518 |
