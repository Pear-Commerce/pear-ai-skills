---
name: pear-rfp-solver
description: Answer Pear Commerce RFP, RFI, security questionnaire, legal diligence, privacy, data-processing, implementation, analytics, and technical buyer questions. Use when drafting or reviewing customer/prospect questionnaire responses, vendor assessments, SIG-style security forms, DPA/subprocessor answers, product capability matrices, or sales/enterprise RFP copy for Pear Commerce.
---

# Pear RFP Solver

## Purpose

Create accurate, sourced Pear Commerce RFP/RFI/security/legal answers by combining bundled precedent files with current Drive, Slack, website, and code/context checks when available.

## First Move

1. Identify the artifact type: questionnaire table, free-form questions, security form, legal redline/clarification, product RFP, implementation plan, or pricing/commercial response.
2. Identify the answer scope: product/module, customer, geography, data type, channel, retailer set, and whether the answer will be customer-facing.
3. Read `references/source-index.md` to pick sources, then read `references/answer-atoms.md` for reusable patterns.
4. Search bundled text with `rg` before opening large references:
   - Product/data: `rg -n "Pear Connect|Store Locator|Shoppable|inventory|sales data|retailer|dashboard" references/source-text`
   - Security/privacy: `rg -n "PII|personal|subprocessor|processor|encryption|SSO|patch|DLP|scoped data" references/source-text`
   - Implementation/support: `rg -n "SLA|turnaround|onboarding|go-live|support|weeks|3-5" references/source-text`

## Evidence Order

Use the narrowest reliable evidence stack:

1. User-provided questionnaire or file.
2. Bundled Pear precedents in `references/source-text/`.
3. Current Google Drive files when the user needs the latest, a customer-specific answer, an existing submission, or a source not bundled here.
4. Slack search for nuance, recency, owners, and edge cases that are not captured in formal docs.
5. pearcommerce.com or `pear-commerce-com.md` for public positioning and website claims.
6. Codebase or operational sources only when the question asks how something technically works and the bundled/Drive sources are insufficient.

When using Drive or Slack, record the search query and source title/permalink in your working notes. Cite the source in the final answer when the user expects traceability.

## Connector Playbook

Use Google Drive search with short keyword queries:

- `Pear RFP`
- `Pear RFI`
- `Pear security questionnaire`
- `SIG Questionnaire_Pear`
- Customer name plus `Pear`, `RFP`, `RFI`, `questionnaire`, `security`, `DPA`, or `Annex II`

Use Slack search for current nuance:

- `"RFP" "Pear"`
- `"security questionnaire" "Pear"`
- `subprocessor Pear data AWS Datadog Sentry Snowflake`
- Customer name plus `security`, `legal`, `RFP`, `subprocessor`, `PII`, `data`, or `privacy`

If Slack file reads fail because of missing scopes, use the result title as a breadcrumb and search Drive for the same file.

## Drafting Workflow

1. Group questions by topic: product capability, data/analytics, privacy/security, legal/IP, implementation/support, commercial/pricing, or AI risk.
2. Draft the direct answer first in the customer's required format: yes/no, short answer, table cell, or narrative.
3. Add explanation only where it improves trust or reduces ambiguity.
4. Include evidence notes or source links when the user asks for citations or when legal/security precision matters.
5. Add `Needs confirmation:` for any claim that depends on current counts, countries, subprocessors, certifications, insurance, pricing, contract terms, or unreleased roadmap.
6. For customer-facing output, remove internal names, Slack context, rough language, and unapproved legal conclusions.

## Legal and Security Guardrails

- Define "scoped data" before answering processors, subprocessors, storage, transfer, or access questions.
- Do not say Pear collects no personal data if IP address, cookies, session IDs, or device metadata are in scope under GDPR/CCPA-style definitions. Say Pear generally avoids direct identifiers and special-category/payment data for standard shoppable experiences.
- Do not say there are no subprocessors without checking whether pseudonymous click/session data is in scope. Use Drive/Slack to verify the current list before sending.
- Do not invent SOC 2, ISO, penetration-test, insurance, DPA, retention, or breach-notification commitments. Use bundled sources only as precedent and flag legal review when needed.
- Do not expose schema internals, customer names, pricing, contract terms, or Slack-only context in a customer-facing answer unless the user explicitly asks and the source is approved for that use.
- For AI-risk or automated-decision questions, draft cautiously and route legal/compliance commitments for human review unless the user provides approved language.

## Common Source Choices

- Product, platform, service model, and sales narrative: `pear-commerce-ab-inbev-rfp-final.md`, `pear-commerce-ab-inbev-rfp-final-pptx-extract.md`, `kimberly-clark-rfi-pear-commerce-submission-2024-10-31.md`, `pear-commerce-com.md`.
- Store locator, shoppable PDP, recipes, Pear Connect, data, and implementation details: `kimberly-clark-rfi-pear-commerce-submission-2024-10-31.md` and Drive matches for Post Consumer Brands or Kinder's.
- GDPR/privacy, IP tracking, content/IP, processors, encryption, patching, SSO, and DLP: `mccormick-clarification-questions.md`.
- Control-by-control security forms: `sig-questionnaire-pear-page-1.md`.
- Salsify or SFTP integrations: `salsify-security.md`.
- Schema verification: `user-data-schemas.md`, but avoid sharing raw schema details externally.

## Output Standards

Produce polished, usable answers, not just notes. For a batch questionnaire, preserve the user's numbering and columns. For unclear questions, answer with a reasonable assumption and label it. If a question creates legal or security risk, provide a strong draft plus a concise review note rather than blocking.
