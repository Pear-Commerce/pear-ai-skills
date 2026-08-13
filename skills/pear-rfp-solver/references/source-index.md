# Pear RFP Source Index

Use this file to choose the smallest useful evidence set before drafting an RFP, RFI, security questionnaire, legal clarification, or diligence response for Pear Commerce.

## Bundled Source Text

All files below are searchable Markdown extractions under `references/source-text/`.

- `pear-commerce-com.md`: website snapshot. Use for current public positioning, product names, and high-level claims.
- `pear-commerce-ab-inbev-rfp-final.md`: original AB InBev text export. Use for broad product/platform story, cross-channel shoppability, service model, and pricing/deal language.
- `pear-commerce-ab-inbev-rfp-final-pptx-extract.md`: text extracted from the AB InBev PPTX. Use when slide ordering or deck-specific language matters.
- `kimberly-clark-rfi-pear-commerce-submission-2024-10-31.md`: enterprise RFI deck. Use for data, product, implementation, API, support, case-study, and enterprise packaging answers.
- `wella-pear-commerce.md`: Wella response. Use for customer/proposal tone and brand-specific RFP phrasing.
- `mccormick-clarification-questions.md`: legal/security/privacy clarification Q&A. Use first for GDPR, data categories, IP tracking, content/IP, processors, encryption, patching, SSO, and DLP.
- `sig-questionnaire-pear-page-1.md`: SIG security questionnaire extract. Use for control-by-control yes/no posture, scoped-data language, risk management, policies, HR, physical security, access control, SDLC, incident response, continuity, and vendor risk.
- `salsify-security.md`: Salsify SFTP integration security answer. Use for SFTP/authentication/key-rotation/network/logging/retention questions.
- `user-data-schemas.md`: schema snapshot. Use only for technical verification of user/admin data fields. Do not expose schema internals unless the user needs engineering detail.
- `ai-system-risk-assessment-questionnaire-pear.md`: AI risk questionnaire. Use for AI-system diligence and to identify questions that need a human/legal owner before finalizing.

## Original Assets

Original compact source files are preserved under `assets/source-files/` with normalized names. Duplicated Wella and Kimberly-Clark uploads were deduplicated by SHA-256. The large AB InBev PPTX was not bundled to avoid bloating the canonical skill repo; use the supplied AB InBev text export and the PPTX extraction instead.

## Live Drive Sources Found During Creation

Prefer Drive search over hardcoding old answers when the user asks for current or customer-specific content. Useful queries and known matches:

- Query `Pear RFP`: `Pear Strategy GPT Supplement 10/2024`, a Google Doc that appears to have fed the old custom GPT and contains strategy/positioning material.
- Query `Pear RFI`: `Copy of Pear Commerce x Post Consumer Brands RFI Submission`, a Google Slides deck with product, market, service model, case-study, and pricing language.
- Query `Pear RFI`: `RFI_Kinder's_Pear.xlsx`, a spreadsheet with concise store-locator, data, analytics, support, pricing, and onboarding answers.
- Query `Pear security questionnaire`: `SIG Questionnaire_Pear`, a Google Sheet with the full SIG response.
- Query `McCormick Annex II` or `Pear Commerce Agreement and Order Form - McCormick`: legal/DPA/order-form examples may exist in Drive. Use only when the user's task specifically needs legal terms, and avoid copying contract terms into generic answers.

## Slack Discovery Notes

Use Slack search for nuance and recency, especially before answering legal/security questions:

- Search `"RFP" "Pear"` to find RFP discussions, old GPT references, customer-specific RFP context, and RFP-related files.
- Search `"security questionnaire" "Pear"` for security questionnaire precedents. Creation research found a Blue Buffalo/TikTok data-flow answer and a McCormick SIG completion note.
- Search `subprocessor Pear data AWS Datadog Sentry Snowflake` before answering subprocessors. Creation research found a 2025-11-07 #partners-internal discussion: scope matters; if pseudonymous click data is in scope, the normal list discussed internally included AWS/CloudWatch, Datadog, Sentry, and Snowflake. (Scalyr was also listed historically but has since been canceled; VictoriaLogs is self-hosted and not a subprocessor.) Verify before sending.
- If Slack file reads are unavailable because the connector lacks scope, use the search result as a breadcrumb and search Drive for the same title.
