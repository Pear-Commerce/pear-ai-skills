---
name: event-attendee-export
description: Discover, scrape, enrich, and export event attendee or exhibitor lists from a provided curl or website into Pear S3 using Pear proxy patterns and, when needed, a production JSP run flow.
---

# Event Attendee Export

Use this skill when the user wants to scrape attendees, participants, exhibitors, sponsors, or meeting-program people from an event site or event app and export the results to S3.

This skill is for workflows like:

- "Here is a curl, get me the full attendee list."
- "Figure out where the attendee list lives on this event website."
- "Export the attendees to CSV in the assets bucket."
- "Collect as much profile/contact info as possible, including LinkedIn and phone."

## Goal

Produce a reliable export of the full list into S3, usually `assets.pearcommerce.com`, with the richest available fields from list and detail endpoints.

Default output should be:

- a CSV in S3
- optionally a JSON artifact in S3 when useful for debugging or future enrichment
- a final report containing the bucket, key, public URL if intended to be public, row count, pagination behavior used, and any important gaps

## Inputs

This skill should work from either starting point:

1. A user-provided curl
2. A website or event app URL with no curl yet

## Source Patterns To Reuse

Ground your approach in existing Pear examples before inventing new patterns.

Relevant examples in `api.pearcommerce.com`:

- `test/com/pear/scrappers/GroceryShopScrapper.java`
  Uses a simple page-number pattern on a Grip API list endpoint.
- `test/com/pear/scrappers/NRFConfrence.java`
  Extracts list-level profile data including LinkedIn.
- `test/com/pear/scrappers/PossibleScraper.java`
  Uses `JurlProxyFallback` with a static-proxy ladder and list pagination.
- `test/com/pear/scrappers/ShoptalkParticipantScraper.java`
  Shows paginated meeting-program participant scraping.
- `test/com/pear/scrappers/ShoptalkEuropeAttendeeScraper.java`
  Shows POST-based pagination, static proxies, CSV generation, and S3 upload.
- `test/com/pear/scrappers/DigitalGroceryScrapper.java`
  Shows detail-level extraction of richer fields like email, phone, company site, and social profiles.

Also reuse the production JSP operating model from:

- `skills/pear-prod-jsp/SKILL.md`

And reuse proxy/request guidance from:

- `skills/pear-proxy/SKILL.md`

## Default Extraction Targets

Collect the richest fields available. Prefer these columns when present:

- `first_name`
- `last_name`
- `full_name`
- `company`
- `title`
- `headline`
- `email`
- `phone`
- `mobile_phone`
- `linkedin`
- `twitter`
- `instagram`
- `facebook`
- `website`
- `company_website`
- `location`
- `bio`
- `matchmaking_message`
- `role`
- `photo_url`
- `attendee_id`
- `attendee_guid`
- `source_event`
- `source_url`

If the list endpoint only has partial data, look for profile-detail endpoints and enrich the export before writing the final CSV.

In many event apps, the attendee list also includes links or IDs for attendee profile pages or profile-detail API calls. The scraper examples in `api.pearcommerce.com/test/com/pear/scrappers` show both patterns:

- some exports are good enough from the list response alone
- some exports become much more valuable after profile-detail enrichment for email, phone, website, LinkedIn, social links, company metadata, or bios

Treat list-to-profile enrichment as a discovery decision, not an automatic default.

## Working Modes

### If The User Gives A Curl

1. Replay the curl locally first.
2. Strip non-essential headers gradually, but preserve auth, cookies, custom app headers, origin/referer, and browser-like headers when they matter.
3. Identify the pagination mechanism by inspecting:
   - query params like `page`, `limit`, `offset`, `cursor`, `search`
   - POST body fields like `page`, `limit`, `sort`, `cursor`, `type`
   - response fields like `total`, `count`, `pageInfo`, `nextCursor`, `hasNextPage`
4. Determine the termination condition:
   - empty list
   - fewer than requested page size
   - cursor disappears
   - fetched count reaches reported total
5. Validate by pulling at least two pages before committing to the implementation pattern.
6. Inspect whether the list response contains profile URLs, attendee IDs, slugs, GraphQL node IDs, or other handles that enable useful profile-detail calls.
7. Decide whether the list data is already sufficient or whether detail enrichment is likely worth the extra calls.

### If The User Gives Only A Website

1. Find the attendee or exhibitor list route.
2. Prefer network discovery over HTML scraping when the site is app-backed.
3. Look for likely event platforms and patterns:
   - Grip
   - Shoptalk / meeting-program APIs
   - Swapcard / GraphQL
   - Personatech
   - Smallworld
   - custom WordPress/AJAX event apps
4. Inspect:
   - page HTML for embedded API hints
   - JS bundles for route names
   - XHR/fetch requests from the attendee page
   - GraphQL persisted query payloads
5. Once the list endpoint is found, switch to the curl-driven workflow above.
6. Look for profile pages or detail routes linked from list results and assess whether they add meaningful fields beyond the list payload.

## Discovery Checkpoint

Before building the final scraper or production JSP, stop and communicate the discovery findings to the user.

At minimum, summarize:

- the list endpoint you found
- the pagination method and stop condition
- the fields available directly from the list response
- whether attendee profile/detail calls exist
- which additional fields those profile/detail calls appear to provide
- the expected cost of enrichment:
  - extra request per attendee
  - extra request per page
  - likely rate-limit or auth risk
  - likely runtime impact

Then let the user decide whether the extra enrichment is worth it.

Your default recommendation should be:

- recommend list-only when the list already contains the fields the user cares about
- recommend enrichment when the detail calls clearly add meaningful fields like email, phone, LinkedIn, company website, or other high-value contact/profile data

Do not silently expand a scrape from list-only into per-attendee profile fetching without surfacing that tradeoff first.

## Proxy Rules

For event scraping, prefer Pear static proxies first unless the endpoint clearly works without them.

Use `JurlProxyFallback` with a static-heavy ladder modeled on the scraper examples, such as:

- `Type.STATIC`
- `Type.OXYLABS_STATIC`
- `Type.STATIC_SAFEWAY`
- `Type.SOAX_STATIC`
- `Type.SMARTPROXY_STATIC`
- `Type.PROXYEMPIRE_STATIC`
- `Type.WEBSHARE_STATIC`
- `Type.NETNUT_STATIC`
- `Type.RAYOBYTE_STATIC_DC`
- `Type.DATAIMPULSE_STATIC`

If the endpoint is known to require a narrower or more successful static provider, prefer that proven path.

Do not jump straight to residential or JS-render proxies unless the static path fails or the site clearly requires something heavier.

## Local Proving Before Production

Before creating a production JSP:

1. Prove the endpoint and pagination locally.
2. Confirm the key required headers, auth, cookies, and request body shape.
3. Determine which fields are available at list level and which require detail fetches.
4. Decide whether the final output should be:
   - CSV only
   - CSV + JSON
5. Decide whether the final S3 object should be public or private.
   Default to public only if the user expects a shareable file URL.

## Production JSP Pattern

When the export should run in production, use the `pear-prod-jsp` pattern.

Requirements:

- no-parameter preview page with zero side effects
- `Run` button for approval
- `run=true` path for the real work
- progress logging to both response and server logs
- formal output summary at the top when returning JSON or CSV metadata
- no raw secrets embedded in the JSP source

The JSP should:

1. Accept the token or auth material at request time when possible
2. Explain exactly what it will scrape and upload
3. Use the proven pagination logic from local testing
4. Upload the final artifact to S3
5. Print:
   - bucket
   - key
   - public URL if applicable
   - attendee count
   - pages fetched
   - elapsed time

## S3 Output Conventions

Default bucket:

- `assets.pearcommerce.com`

Suggested key patterns:

- `events/<event-slug>/attendees-<timestamp>.csv`
- `events/<event-slug>/attendees-<timestamp>.json`
- or a clearer vendor/event prefix like `bevnet/<event-slug>/...`

Prefer normalized, timestamped keys so reruns do not overwrite prior exports unless the user explicitly asks for replacement behavior.

If the output should be publicly accessible, upload with `PublicRead` and return a public URL like:

- `https://assets.pearcommerce.com/<key>`

If the output should be private, say so clearly and do not present the URL as if it were directly fetchable.

## CSV Rules

Always generate a stable CSV with explicit headers.

- escape commas, quotes, and newlines correctly
- preserve empty fields rather than dropping columns
- keep column names predictable and machine-friendly
- avoid changing header names mid-run

If list and detail data differ, merge into one final row per person whenever possible.

Prefer this decision sequence:

1. discover list fields
2. discover profile/detail fields
3. explain the delta to the user
4. get user confirmation on whether enrichment is worth the added calls
5. only then finalize the build/run approach

## Suggested Agent Behavior

Use this prompt behavior as the basis of the skill:

> When a user asks for an attendee, participant, exhibitor, or sponsor export, first determine whether they provided a working curl or only a website. If given a curl, replay it and identify the minimum required auth, headers, cookies, and payload. Infer the pagination mechanism by testing additional pages and reading the response shape. If given only a website, discover the backing attendee endpoint by inspecting the page and its network calls. Reuse proven Pear patterns from `api.pearcommerce.com/test/com/pear/scrappers`, especially Grip, Shoptalk, Possible, NRF, and Digital Grocery examples. Prefer `JurlProxyFallback` with static proxies for production-like scraping. During discovery, determine both what the list endpoint provides and whether attendee profile/detail calls exist that would materially enrich the export. Before building the final scraper, clearly summarize that tradeoff to the user: what fields are already available from the list, what extra fields profile enrichment would add, and what additional request volume and runtime it would cost. Let the user decide whether the enrichment is worth it. After that decision, build the export path, merge list and detail data where appropriate, and produce a production-safe Pear JSP using the `pear-prod-jsp` workflow when production execution is needed: no-side-effect preview first, then a `Run` button, then the actual export behind `run=true`. Upload the final CSV, and optionally JSON, to S3 with a timestamped key, and report the bucket, key, URL, row count, pagination logic, enrichment choice, and any missing fields or blockers.

## Residual Expectations

- Tell the user what pagination field or stop condition you discovered.
- Tell the user whether the export is list-only or list-plus-profile-enrichment, and why.
- Call out whether the export came from:
  - list endpoint only
  - list + detail enrichment
- Mention which requested fields were unavailable.
- If auth expires or the curl stops working, say exactly which part failed.
- If the site appears browser-only or heavily protected, say what discovery was attempted and what stronger browser/proxy path would be next.

## Anti-Patterns

- Do not assume page-number pagination without testing it.
- Do not bake live auth tokens into committed source.
- Do not return a private S3 URL as if it were public.
- Do not skip the preview/run safety pattern for production JSPs.
- Do not stop at a partial list response if richer detail endpoints are clearly available.
