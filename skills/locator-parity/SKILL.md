---
name: locator-parity
description: >
  Use Chrome browser automation to run visual and functional parity testing
  between the AngularJS locator (/product-locator/) and React locator
  (/react-product-locator/) for a given offer ID on test.offers.pearcommerce.com.
  Opens both locators side by side, adapts interactions to what's actually present
  for the specific offer, tests desktop and mobile, and prints a final parity report.
triggers:
  - locator-parity
  - parity test
  - compare locators
  - react locator ready
---

# locator-parity

Use Chrome browser automation to compare the AngularJS and React locators for a given offer ID and determine whether the React locator is ready for that vendor.

## Usage

```
locator-parity <offerId>
```

Example: `locator-parity 1740607387970560`

## What This Skill Does

1. Reads `PRODUCT_LOCATOR_TEST_PLAN.md` and `PARITY_BUGS.md` from the offers.pearcommerce.com repo to understand known/accepted divergences
2. Opens both locators side by side and discovers what's present for this specific offer
3. Tests at least 5 zip codes and both desktop + mobile viewports
4. Performs adaptive interactions based on what's actually in the UI
5. Prints a final parity report with screenshots inline

---

## Step-by-Step Instructions

### 1. Load context

Find the offers.pearcommerce.com repo root:
```bash
git -C ~/Develop/offers.pearcommerce.com rev-parse --show-toplevel 2>/dev/null \
  || find ~/Develop -maxdepth 3 -name "PRODUCT_LOCATOR_TEST_PLAN.md" -exec dirname {} \; 2>/dev/null | head -1
```

Read both files from that root:
- `PRODUCT_LOCATOR_TEST_PLAN.md` — full parity checklist
- `PARITY_BUGS.md` — known/accepted divergences

**Known divergences that must NOT be flagged as issues:**
- BUG-7: Map pin style differs (Angular uses circular Google Maps pins, React uses MapLibre teardrop pins) — intentional, different map library
- BUG-8: Different nearest-store ordering for the same zip — intentional, Angular uses Google geocoding, React uses Stadia Maps

Any other divergence found during testing must be flagged clearly.

### 2. Set up browser tabs

URLs:
- Angular: `https://test.offers.pearcommerce.com/product-locator/<offerId>`
- React: `https://test.offers.pearcommerce.com/react-product-locator/<offerId>`

Open Angular in tab 1, React in tab 2. Set desktop viewport (1280x800) to start.

### 3. Discover what's present

Before interacting, take a snapshot of each locator after load and identify:

**Tabs & labels:**
- Which tab is active by default (In Store or Buy Online)?
- Exact tab label text in Angular vs React — flag any mismatch
- Exact filter/narrow button label text — flag any mismatch

**Filter panel:**
- Is it open or closed on load?
- Flat product list or grouped categories?
- Is there a product search field?
- Are there store type checkboxes?
- Is there a retailer filter mode ("Tap to select a Retailer")?

**Store list:**
- Is there a "X products found" badge on any store card?
- Is there pagination (Previous/Next buttons)?

**Buy Online:**
- Is there a "X more retailers" expander?
- What do the CTA button labels say?

**Exit button:**
- Only present when `config.exitSelector` is set. If visible, note it. Do NOT click it.

### 4. Run interactions — desktop (1280x800)

For each of the 5 zip codes below, test on BOTH locators and compare:

**Zip codes to test:**
- 55401 (Minneapolis, MN)
- 10001 (New York, NY)
- 94103 (San Francisco, CA)
- 60601 (Chicago, IL)
- 78701 (Austin, TX)

Also test zip 55401 via URL param: load `https://test.offers.pearcommerce.com/product-locator/<offerId>?zip=55401` and verify stores are pre-loaded for that zip.

**For each zip, perform ALL of the following that are present:**

**Location search:**
- Click the location input, type the zip code
- Confirm autocomplete dropdown appears
- Select the first result
- Confirm stores reload and URL updates (contains zip= or address=)
- Compare: do both locators show the same store count / same top stores? (geocoding differences are acceptable per BUG-8)

**Default tab check:**
- Which tab is active after load? Must match between Angular and React.

**Filter panel:**
- If closed: click the filter/narrow button to open it
- If already open: proceed directly
- If grouped categories: click through each group, verify products filter in both
- If flat list: click a product tile, verify store list narrows in both
- If product search field: type a product name, verify filtering in both
- If store type checkboxes: toggle one, verify store list updates in both
- If retailer filter mode: select a retailer card, verify results filter, then click reset
- Click the reset/clear button and verify all filters clear

**"X products found" flow (if present):**
- Find a store card with "X products found" badge
- Click it on Angular, then the same action on React
- Verify on BOTH:
  a. Buy Online tab becomes active and shows ONLY those store's products
  b. Opening the filter panel shows those products pre-selected
  c. Buy Online retailer list has that store's retailer sorted first
- Flag any difference between Angular and React behavior

**Map interactions:**
- Click at least 3 different map pins
- Verify: correct store is highlighted in list and scrolled into view
- Drag the map to a new area
- Verify: stores refresh for new visible bounds

**Buy Online tab:**
- Click Buy Online tab manually
- Verify products and retailers load
- If "X more retailers" expander: click it, verify expansion; click "Show less", verify collapse
- Note CTA button labels — flag mismatches

**In Stores tab:**
- Click In Stores tab
- Verify store list restores correctly

**Pagination (if present):**
- Click Next page, verify store list changes
- Click Previous, verify it returns

### 5. Mobile viewport (390x844)

Switch both tabs to 390x844. Re-test:
- Verify no horizontal overflow (no horizontal scrollbar, no clipped content)
- Confirm mobile tab bar is present (map/list/buy-online views)
- Switch between map, list, and buy-online views
- Open filter panel on mobile and interact
- Do a location search on mobile
- Take screenshots of both locators in mobile view

### 6. Screenshots

Capture at these moments and include inline in the report:
- After initial load — Angular and React side by side
- After zip search / location update
- After map pin click / store selection
- After Buy Online tab opens
- After "X products found" click (if applicable)
- Filter panel open
- Mobile view — Angular and React

### 7. Classify divergences

At each comparison point:
- **Known/accepted** (BUG-7, BUG-8, or anything else in PARITY_BUGS.md): note it, do not flag
- **New parity issue**: flag clearly — state what Angular does, what React does, and where it diverges

### 8. Print final report

```markdown
# Locator Parity Report — Offer <offerId>

**Tested:** <date>
**Viewports:** Desktop (1280x800), Mobile (390x844)
**Zip codes tested:** 55401, 10001, 94103, 60601, 78701 (+ ?zip= param test)

## Test Summary

| Zip | Angular loads? | React loads? | Store count matches? | Notes |
|-----|---------------|-------------|---------------------|-------|
| ... | ... | ... | ... | ... |

## Interactions Performed

| Interaction | Present? | Angular behavior | React behavior | Match? |
|-------------|----------|-----------------|----------------|--------|
| Default tab active | — | ... | ... | ✅/❌ |
| Tab labels | — | ... | ... | ✅/❌ |
| Filter button label | — | ... | ... | ✅/❌ |
| Location search + autocomplete | ✅ | ... | ... | ✅/❌ |
| Filter panel | ✅/❌ | ... | ... | ✅/❌ |
| Product categories | ✅/❌ | ... | ... | ✅/❌ |
| Product search | ✅/❌ | ... | ... | ✅/❌ |
| Store type checkboxes | ✅/❌ | ... | ... | ✅/❌ |
| Retailer filter mode | ✅/❌ | ... | ... | ✅/❌ |
| Map pin clicks | ✅ | ... | ... | ✅/❌ |
| Map drag / bounds refresh | ✅ | ... | ... | ✅/❌ |
| "X products found" flow | ✅/❌ | ... | ... | ✅/❌ |
| Buy Online tab | ✅/❌ | ... | ... | ✅/❌ |
| "X more retailers" expander | ✅/❌ | ... | ... | ✅/❌ |
| In Stores tab | ✅ | ... | ... | ✅/❌ |
| Pagination | ✅/❌ | ... | ... | ✅/❌ |
| Exit button | ✅/❌ | ... | ... | ✅/❌ |
| Mobile layout | ✅ | ... | ... | ✅/❌ |
| Mobile tab switching | ✅ | ... | ... | ✅/❌ |

## Screenshots

[inline screenshots here]

## 🚨 New Parity Issues

| # | Severity | Angular | React | Notes |
|---|----------|---------|-------|-------|
| ... | HIGH/MED/LOW | ... | ... | ... |

*(None found — list only if issues exist)*

## ℹ️ Known/Accepted Divergences

- BUG-7: Map pin style differs (intentional — different map library)
- BUG-8: Nearest-store order may differ (intentional — different geocoding provider)
- *(list any others from PARITY_BUGS.md that were observed)*

## Verdict

**React locator ready for this vendor: YES / NO / YES WITH CAVEATS**

*(If caveats: list them here)*
```
