---
name: mass-update-pear-pixels
description: >-
  Safely mass-update or append tracking pixels (Meta/Facebook, GTM, TikTok,
  Trade Desk, etc.) on Pear offers' OfferDOMInsertions rows — the pageLoad /
  retailerVisit / purchase / addToCart sections. Use whenever asked to add,
  append, replace, find-and-replace, or clear a tracking pixel / DOM insertion
  across many offers for a brand/vendor, scoped by vendorId + offerType. Runs
  as a read-only preview + write production JSP via the pear-prod-jsp workflow,
  keyed correctly by Offer.vendorId, with exact-token idempotency guards, an
  S3 offerId change-log, and verification against the LIVE PRIMARY (never the
  delayed Metabase replica). Trigger phrases: "add the meta pixel to all of a
  brand's offers", "append this pixel to their landing pages", "mass update
  the tracking sections", "update the pixel on all vendor offers".
---

# Mass-update Pear offer tracking pixels

Append/replace tracking-pixel HTML on many offers at once by editing the
`OfferDOMInsertions` table, safely and idempotently, through a production JSP.

This skill builds on [pear-prod-jsp](../pear-prod-jsp/SKILL.md) (read the
prereqs + preview→Run rules there) and assumes changes touch live production
data, so scope tightly and verify against the primary.

## The data model

`com.pear.entities.inventory.OfferDOMInsertions` — one row per offer (usually),
with `offerId`, `vendorId`, and four `longtext` sections:

| Column | Product label | Typical event |
|---|---|---|
| `pageLoad` | Page Load | Meta `PageView`, GTM load |
| `retailerVisit` | Retail Visit | Meta `AddToCart`, retailer click |
| `purchase` | Purchase | Meta `Purchase`, conversion |
| `addToCart` | (Add to Cart) | often empty |

The dashboard "tracking/pixel section" maps to these columns. `EventType` enum:
`PAGE_LOAD, ADD_TO_CART, PURCHASE, RETAILER_VISIT`.

## Non-negotiable gotchas (each of these has bitten us)

1. **`OfferDOMInsertions.vendorId` is UNRELIABLE.** Many rows have it null/0/wrong.
   ALWAYS resolve ownership by joining `OfferDOMInsertions.offerId = Offer.id`
   and filtering on `Offer.vendorId`. Filtering on the DOM row's own `vendorId`
   silently undercounts (we saw 78 vs the real 908).
2. **Metabase is a DELAYED REPLICA — do not scope from it.** Metabase
   `database_id=2` ("Pear Commerce" MySQL) lags the primary for fast-changing
   pixel content (we saw 315 "have it" on the replica vs 808 on the primary).
   Do all counting/scoping/verification with a **read-only prod JSP against the
   primary**, not Metabase. See [[metabase-db2-delayed-replica]].
3. **Jasper (JSP compiler) is below Java 15 — NO text blocks (`"""`).** Build
   multi-line pixel strings with `String.join("\n", ...)` (escape `"` as `\"`),
   never a text block, or the JSP 404s with
   `The Java feature 'Text Blocks' is only available with source level 15 and above`.
4. **Idempotency = exact-token guard.** Pick a stable substring unique to the
   pixel (e.g. `facebook.com/tr?id=<PIXEL_ID>`). Skip any section that already
   contains it, AND exclude already-done offers in the selection query. A rerun
   must not double-append. Verify "already present" is the *exact* token, not a
   substring of a longer number (regex-check `[0-9]<id>|<id>[0-9]` = 0).
5. **Duplicate DOM rows exist.** A few offers have >1 `OfferDOMInsertions` row.
   `loadWhere(OfferDOMInsertions.class, "offerId = ?", id)` returns a list —
   handle all rows (guarded), and note duplicates in the report.
6. **Scope is `vendorId` + `offerType` + missing-only, and confirm before write.**
   Never widen to a whole company account (siblings brands) or all offer types
   unless asked. The preview page must list the exact target offerIds.

## Workflow

### 1. Identify the vendor(s) — beware test/duplicate names
```sql
SELECT id AS vendorId, name, companyAccountId FROM Vendor WHERE name LIKE '%<Brand>%';
```
Exclude obvious test vendors (e.g. "…Test", companyAccountId 0) and confirm the
exact vendorId with the user. A brand may have several vendors (e.g. US vs
Canada) — pick deliberately.

### 2. Count / scope against the LIVE PRIMARY (read-only prod JSP)
Write a read-only JSP (preview + Run, per pear-prod-jsp) that runs, e.g.:
```sql
SELECT o.offerType,
  COUNT(DISTINCT d.offerId) AS offers_with_dom_row,
  COUNT(DISTINCT CASE WHEN CONCAT_WS(' ', d.pageLoad, d.retailerVisit, d.purchase, d.addToCart)
        LIKE ? THEN d.offerId END) AS offers_with_pixel      -- ? = %<token>%
FROM OfferDOMInsertions d JOIN Offer o ON o.id = d.offerId
WHERE o.vendorId = ?
GROUP BY o.offerType ORDER BY offers_with_dom_row DESC;
```
Do NOT use Metabase for this number — it will be stale.

### 3. Build the write JSP (preview → Run)
- Constants: `VENDOR_ID`, `OFFER_TYPE`(s), `TOKEN` (exact), `LIKE` (`%TOKEN%`),
  and the snippet(s) via `String.join` (see gotcha 3).
- Selection query (targets = missing-only):
  ```sql
  SELECT d.offerId FROM OfferDOMInsertions d JOIN Offer o ON o.id = d.offerId
  WHERE o.vendorId = ? AND o.offerType = ?
  GROUP BY d.offerId
  HAVING SUM(CASE WHEN CONCAT_WS(' ', d.pageLoad, d.retailerVisit, d.purchase, d.addToCart)
                  LIKE ? THEN 1 ELSE 0 END) = 0;
  ```
- No-param **preview** page: print vendor, offerType, target count, and the full
  offerId list; `Run` button; zero writes.
- `run=true`: for each offerId, `orm.loadWhere(OfferDOMInsertions.class, "offerId = ?", id)`,
  append per section with a guard, `row.save()` (PearSimpleORM, not raw SQL):
  ```java
  static String appendIfMissing(String existing, String snippet, String token) {
      String cur = existing == null ? "" : existing;
      if (cur.contains(token)) return existing;              // idempotent skip
      return cur.isEmpty() ? snippet : cur + "\n\n" + snippet;
  }
  ```
  Map snippets to columns: Page Load→`pageLoad`, Retail Visit→`retailerVisit`,
  Purchase→`purchase`. Leave `addToCart` alone unless asked.
- **Log every updated offerId** three ways: the run-report table, the server log
  (stable prefix for `devops/logs.sh`), and a durable **S3 JSON artifact**
  (`S3Util.uploadString(S3Util.ASSETS_S3_BUCKET, "jsp-log/<job>/<ts>.json", JSON._stringify(summary), ".json")`)
  containing offerId + which sections changed + counts. Print the S3 URL.

### 4. Deploy, preview, get approval, run
```bash
export AWS_PROFILE=<prod-capable-profile> AWS_DEFAULT_REGION=us-east-1 AWS_REGION=us-east-1
devops/jsp.sh -j /tmp/<job>.jsp -e PROD        # no --single; preview is side-effect-free; exits when done
```
Start `devops/vpn.sh` in a second terminal first (never pass `--start-vpn`) and keep it running so the private URL stays reachable. Open the printed private-IP URL (no params), confirm the plan + exact offerId list, and
**stop for the user to click Run** (or to explicitly approve you clicking it).
Never navigate to `?run=true` to bypass approval. After verification, Ctrl-C `vpn.sh` and confirm the VPN closes.

### 5. Verify against the primary
Re-run the step-2 count JSP; confirm the targeted `offerType` is now fully
covered (missing → 0) and `errors=0`. Point the user to the S3 change-log.

## Prod-JSP environment prereqs (one-time)
`devops/jsp.sh` needs, on the operator machine: the one-time guarded Client VPN setup (run `./devops/setup-client-vpn.sh` in the user's terminal if prompted),
`zx` (`brew install zx`), the `pear-scripts` submodule beside the repo (clone via
`gh` over HTTPS — SSH host-key verification often fails), and an authenticated
prod-capable AWS profile (`aws sso login --profile <p>`; export `AWS_PROFILE` +
`AWS_REGION=us-east-1`). See [[pear-dashboard-local-dev]] and pear-prod-jsp.
