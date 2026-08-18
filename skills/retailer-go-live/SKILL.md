---
name: retailer-go-live
description: Operational launch workflow for landed Pear retailer integrations in api.pearcommerce.com. Use when a retailer's availability updater, client, data imports, and resolver (if any) are already committed and the task is to deploy to a sandbox, import store zones, validate end-to-end availability and PDP links, and cut over to production. Triggers include phrases like "go live", "launch retailer", "import zones", "sandbox deploy", "run store import one by one", or "make retailer X live".
---

# Retailer Go-Live

Use this skill to launch a retailer whose integration code is already in the repo. This is the operational phase that comes after `$retailer-integration-feasibility` and `$retailer-production-integration`.

A retailer is **landed** when these classes exist in `api.pearcommerce.com`:
- `UPCRetailerZipAvailabilityRecomputer` subclass (availability updater)
- Retailer client (or client calls in the updater)
- `RetailPartner` setup migration in a `*DataImports.java`
- `ItemIdInfoResolver` subclass (if UPC resolution is required)

Go-live is the process that takes landed code and makes it operational in Pear's infrastructure.

## Companion skills

Always start with these:
- `$pear-engineering-workflow` for worktree rules, branch hygiene, and pre-PR review.
- `$pear-prod-jsp` for running JSPs on TEST or production.
- `$retailer-verify` for end-to-end landing-page and PDP click validation.
- `$pear-proxy` if the import route needs proxy debugging.

## Go-live workflow

1. **Inventory the retailer** — confirm enum name, expected flags (`itemAvailabilityDependsOnZip`, `locationAgnosticShipToHome`, `live`), store importer method, and availability updater class. See [references/inventory-template.md](references/inventory-template.md).
2. **Sandbox deploy** — deploy the current branch to `sandbox-peter-2026` (or the requested sandbox) and verify health. See [references/sandbox-deploy.md](references/sandbox-deploy.md).
3. **Store/zone import** — run `importStoresFromRetailer()` on the sandbox for each retailer that has a store importer. See [references/store-zone-import.md](references/store-zone-import.md).
4. **Validation** — run availability JSP probes, hit the retailer-list API, and click through a UPC-only offer landing page. See [references/validation-checklist.md](references/validation-checklist.md).
5. **Production cutover** — deploy to production, rerun imports, flip flags, and final validation. See [references/production-cutover.md](references/production-cutover.md).

## One-by-one store imports

When the user says "run the retailer store importing one by one", generate a per-retailer checklist from [references/inventory-template.md](references/inventory-template.md) and process each retailer independently: deploy to sandbox, import, validate, then mark done before moving to the next. Do not bulk-import multiple retailers in one step unless the user explicitly asks for it.

## Tracking artifacts

Use `scripts/generate_checklist.py` to create a Markdown tracking checklist for a batch of retailers. Use `scripts/update_status.py` to mark a retailer as done. Store the active checklist in the project's Codex outputs directory so the user can follow progress.

## When to stop

Stop and ask the user if any of the following are true:
- The retailer is not landed (no availability updater or migration exists). Route to `$retailer-integration-feasibility` or `$retailer-production-integration` instead.
- The requested sandbox environment is not `sandbox-peter-2026` and no other environment is specified.
- A write step requires production ORM changes and the user has not explicitly approved it.
