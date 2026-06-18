---
name: vendor-recipe-ingestor
description: Add or update recipe vendor ingestion in api.pearcommerce.com when a vendor recipe site needs a bespoke DOM parser in RecipeIngestor.java, branded ingredient handling, RecipeIngestorTest coverage, or a VendorRecipeIngestor data migration/config. Use when recipe import should not rely only on LD+JSON.
---

# Vendor Recipe Ingestor

## Quick Start

- Work in `api.pearcommerce.com` on a dedicated `codex/` worktree.
- Inspect `src/com/pear/recipe/service/ingestion/RecipeIngestor.java`, `test/com/pear/recipe/service/ingestion/RecipeIngestorTest.java`, `src/com/pear/recipe/service/ingestion/VendorRecipeIngestor.java`, and legacy `VendorRecipeIngestor` examples in `src/com/pear/admin/DataImports.java`.
- Fetch one or more live recipe pages and compare the actual DOM against LD+JSON before choosing selectors.

## Implement The Parser

1. Add a new `RecipeIngestorConfiguration` entry keyed by `URI.create(url).getHost().toLowerCase()`.
   If the site can appear with or without `www.`, make sure parser lookup and `VendorRecipeIngestor` domain lookup both tolerate that exact `www`/bare-host difference without collapsing other real subdomains such as `shop.vendor.com`.
2. Prefer stable recipe-specific selectors such as the recipe header, hero image, and ingredients section over theme-wide wrappers.
3. Add a host-specific customizer when ingredients need assembly, cleanup, or brand enforcement.
4. Keep branded ingredients branded.
   If the DOM marks a product ingredient with a logo, product card, or `/products/...` link but the text does not include the vendor name, append the vendor name in the customizer.
5. Normalize vendor whitespace before asserting ingredient text.
   Prefer existing helpers such as `StringUtils.normalizeSpace(...)`; if the site uses `\u202F` or `\u00A0`, convert those to plain spaces first.

## Add The Migration

- Create or update `src/com/pear/recipe/service/ingestion/DataMigrations.java`.
- Add an idempotent `@SimpleORMDataMigration(includeInCI = true, rerun = false, background = true)` method.
- Look up an existing `VendorRecipeIngestor` by domain first, then by `vendorId`, before creating a new row.
- Set:
  - `vendorId`
  - canonical `https://domain/`
  - `recipeIngestorClass`
- Point multi-vendor DOM entries at `RecipeIngestor.class.getName()` unless the vendor truly needs a dedicated ingestor class.

## Add The Test

- Add `@Script` coverage in `RecipeIngestorTest` for at least one live example recipe.
- Assert the important branded ingredient lines explicitly.
- Prefer `containsAll(...)` plus an exact ingredient-count assertion when the full ingredient list is stable enough.
- Add a focused helper test when brand-appending or normalization logic is easy to regress.

Run:

```bash
MYSQL_CREDENTIALS_SECRET=prod-db-10-2025 \
MYSQL_HOST=analytics-database.pearcommerce.com \
MYSQL_HOST_READ=analytics-database.pearcommerce.com \
MYSQL_HOST_WRITE=analytics-database.pearcommerce.com \
SNOWFLAKE_CREDENTIALS_SECRET=snowflake-2025-12-01 \
./gradlew test --tests com.pear.recipe.service.ingestion.RecipeIngestorTest
```

Treat these tests as local verification scripts for the parser. Do not add extra CLI automation just to run one vendor import path.

## Review Checklist

- Domain key matches the recipe URL host, or the code intentionally supports the matching `www`/bare-host equivalent.
- Ingredients selector reaches only the ingredients column, not steps or related recipes.
- Image extraction still strips query params consistently with existing behavior.
- Branded ingredient text contains the vendor name when needed.
- Migration updates existing config instead of creating duplicate `VendorRecipeIngestor` rows.
- Diff stays tight: parser, migration, and targeted tests only.
