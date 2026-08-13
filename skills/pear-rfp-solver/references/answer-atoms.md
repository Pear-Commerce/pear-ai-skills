# Pear RFP Answer Atoms

Use these as starting points, not final copy. Confirm customer scope, dates, and current counts before sending externally.

## Product Positioning

- Pear Commerce provides retail ecommerce infrastructure for CPG brands: onsite where-to-buy experiences and offsite shoppable media that connect brand touchpoints to retailer purchase paths.
- Core products include Store Locators, Shoppable PDPs, Recipes, Landing Pages, Direct URLs/direct-to-cart links, Pear Connect, and Pear Pulse.
- The durable differentiation is coverage plus shoppability: Pear can connect UPCs to digital shelves across thousands of retailers and many physical locations, then filter paths by geography and inventory.
- Use current source checks for metrics. Prior bundled materials say 3,000+ retailers/banners, 165,000 US/Canada locations, and daily inventory at the slowest refresh. Some older decks differ on sales-data retailer counts, so do not state a precise count without a current source.

## Data and Analytics

- Standard journey events: page load, retailer selection/retailer visit, add-to-cart where supported, and purchase confirmation where supported by retailer/affiliate integrations.
- Reporting can be cut by retailer, SKU/UPC, geography, campaign, UTM, audience, platform, creative, and product experience when those fields are available in the implementation.
- Pear can fire customer-approved ad/analytics pixels from Pear experiences so brands can measure results, build audiences, and optimize campaigns in their own ad platforms.
- Do not frame Pear as a generic attribution company. Prior RFP language positions Pear as a shoppable infrastructure and retail ecommerce data partner with sales signals where supported.

## Privacy and Data Categories

- Common answer pattern: Pear does not collect direct identifiers such as names, emails, phone numbers, postal addresses, payment data, cardholder data, or special-category data for standard shoppable experiences.
- Pear may process online/session identifiers and technical telemetry: pseudonymous IP address, first-party cookies/session IDs, user agent/device type, timestamps, page URL/referrer, campaign parameters, page views, retailer selections, add-to-cart clicks, purchase callbacks, UPCs/SKUs, selected retailer/store, and fulfillment mode.
- Location is usually coarse: user-provided ZIP/city, browser geolocation with consent, or IP-derived city/region/ZIP. Do not imply continuous location tracking.
- If asked whether IP tracking can be disabled, use the McCormick pattern: IP saving can be disabled, but shoppers may need to select a location first and fraud/attribution hygiene may be limited.

## Processors and Subprocessors

- Always define the scoped data first. Pear often does not process regulated/confidential scoped data or direct identifiers in standard experiences, but pseudonymous click/session data can still be in scope depending on the customer wording.
- Do not say "no subprocessors" without checking the question's data scope. Creation research found internal guidance that the answer changes if pseudonymous data is included.
- Common processor categories to verify: cloud hosting and logs/observability, code/security tooling, IP-to-geo, maps/geocoding, retailers and affiliate networks, customer-provided ad/analytics pixels, and data warehouse/reporting tools.
- Names seen in source or Slack research include AWS/CloudWatch, Datadog, Sentry, Snowflake, GitHub, MaxMind, Stadia Maps, Walmart, Target, Impact, Meta, TTD, LiveRamp, and Google. Scalyr was previously used for log search but has been canceled; VictoriaLogs (self-hosted) is the current log store. Verify the active list and country/processing details before sending a customer-facing table.

## Security Controls

- Encryption pattern: public endpoints and APIs use HTTPS with TLS 1.2 or higher; data stores are encrypted at rest with AES-256 using cloud-provider managed/KMS-backed encryption.
- Access pattern: Pear supports SSO via SAML 2.0 through Auth0 enterprise connections when configured; use MFA/access-review language from the SIG source when the form asks control-by-control questions.
- Patch management pattern: automated dependency/container/host detection, dev/staging/production rollout, peer review for production changes, monitoring, and remediation targets of critical within 7 days, high within 30 days, medium within 90 days, and low within 180 days unless a newer source overrides.
- DLP/security governance pattern: owned security/access policies, periodic access reviews, information classification and handling rules, retention/destruction requirements, encryption in transit, email security/phishing controls, intrusion detection, and change management.
- SFTP pattern from Salsify: SSH key authentication only, no password auth, sender owns private key, Pear stores public key, tenant-specific user/key, scoped/chrooted S3 path, IP allowlisting, SSH encryption, connection/file-operation logs, alerting, and configurable retention with 365-day default.

## Legal and IP

- For content/IP questions, use the McCormick pattern: Pear uses customer-provided or customer-approved content and does not generate new consumer-facing copy unless explicitly scoped.
- For recipe experiences, Pear may parse existing recipe/content data to build add-to-cart UX, but that does not mean Pear authors new recipes or brand copy.
- For work product, indemnity, liability, AI, or DPA commitments, draft a suggested response but clearly flag legal review unless the user supplies an approved contract clause.

## Implementation and Support

- Onsite where-to-buy/store-locator work is commonly positioned as under four weeks once UPCs/assets are received; offsite shoppable media is commonly positioned as under one week.
- Landing pages and direct URLs are commonly described as 3-5 day deliverables after an onboarding request with desired UPCs and retailers.
- Pear Connect commonly requires one-time ad-manager authentication, then self-serve operation in the ad platform.
- Customer team language: experienced CSM/retail ecommerce strategist, implementation specialists, solutions engineer, and leadership/escalation support as appropriate.

## Response Style

- For a questionnaire table, answer in the customer's requested format first, then add concise explanation and evidence.
- Use confident, direct prose for standard product questions. Use conditional language for legal/security answers whose truth depends on scope.
- Add a "Needs confirmation" note when the question asks for a number, country, subprocessor, certification, insurance, retention period, legal obligation, or customer-specific commitment not proven by current sources.
