# Operator Checklist

Quick checklist for tracking progress on each hosted app. Use this to stay organized and to populate the Final Operator Summary.

---

## Intake

- [ ] Read entrypoint file (`index.js`, `worker.js`, `server.js`, `app.js`, etc.)
- [ ] Read `package.json` — dependencies and start script
- [ ] Check for `app.listen()` or `server.listen()` — signals Node server runtime
- [ ] Check for native modules, filesystem writes, background processes
- [ ] Note anything that would break in a Workers edge runtime

## Decision

- [ ] Chosen target: **Cloudflare Workers** / **AWS Lightsail** (circle one)
- [ ] One-sentence reason recorded

## Subdomain

- [ ] Confirmed app name and target hostname: `<app-name>.intern.pearcommerce.com`
- [ ] For Workers: custom domain bound, DNS record proxied, TLS verified
- [ ] For Lightsail: instance provisioned or reused, app running behind nginx on port 80 origin path
- [ ] For Lightsail: DNS-only origin record created or reused (`<app>-origin.intern` or equivalent)
- [ ] For Lightsail: ACM cert requested in `us-east-1`, DNS validation CNAME added in Cloudflare as DNS only, cert status `ISSUED`
- [ ] For Lightsail: CloudFront distribution created with alias `<app-name>.intern.pearcommerce.com`, ACM viewer cert, HTTP origin, HTTPS viewer redirect, cache disabled / viewer details forwarded
- [ ] For Lightsail: public Cloudflare record is DNS-only CNAME from `<app-name>.intern` to the CloudFront domain
- [ ] For Lightsail: confirmed no direct Cloudflare-proxied `A` record exists for the public intern hostname unless exact Cloudflare custom-hostname certificate coverage is configured

## WAF Score Check (Step 3.5)

- [ ] App name does NOT contain "api" (if it does, rename slug — `*api*.pearcommerce.com` is subject to the "Block known bad attacks" rule regardless of WAF score)
- [ ] Operator did not run heavy curl/API probing during deploy (if they did, WAF score may be degraded — wait 15–30 min before verifying, or test from a different IP)
- [ ] If 403 block seen: confirmed via Security → Analytics → Events that "Block known bad attacks" fired (not a Worker error)
- [ ] Note: there is NO slug allowlist — new intern subdomains do not need to be registered anywhere

## Verification Triage

- [ ] `curl -sI https://<app-name>.intern.pearcommerce.com` returns 200/302 (not 403)
- [ ] Lightsail/CloudFront apps show CloudFront headers (`x-cache`, `x-amz-cf-*`) and a browser-valid Amazon-issued cert for the exact hostname
- [ ] If 403 + large HTML body (~4KB+): WAF score block — confirm via Security → Analytics → Events, then wait 15–30 min or test from different IP
- [ ] If 403 + small JSON or Cloudflare 1xxx page: Worker-level error — debug code/secrets
- [ ] If app name contains "api": aware it falls under `*api*.pearcommerce.com` WAF wildcard — tested from a clean IP
- [ ] Checked that existing apps (e.g. sample.intern.pearcommerce.com) are reachable from same IP (if not, operator IP is the issue, not the new app)

## Auth

- [ ] Auth lane selected: v2 for new apps (`auth-v2.intern.pearcommerce.com`) or legacy only for deliberate migration/support (`auth.intern.pearcommerce.com`)
- [ ] App has a `/login` route that generates `state` + `nonce` and redirects to shared auth start URL
- [ ] App has an `/auth/google/callback` route that validates `state`, `session_token`, nonce, hosted domain
- [ ] Local session created after successful validation
- [ ] Env vars set: `AUTH_BASE_URL`, `AUTH_CALLBACK_URL`, `AUTH_SHARED_SECRET`, `GOOGLE_HOSTED_DOMAIN`
- [ ] New app `AUTH_SHARED_SECRET` synced from `intern-app-hosting-auth-v2-shared-secret` in `us-east-1`
- [ ] New app includes an auth verification helper equivalent to `scripts/auth-lane.mjs verify-app`
- [ ] `SESSION_SECRET` set (Lightsail only)

## Verification

- [ ] Anonymous user → sees login redirect ✓ / ✗
- [ ] Auth verification helper proves the live app accepts v2 tokens ✓ / ✗
- [ ] `@pearcommerce.com` user → reaches app ✓ / ✗
- [ ] Non-Pear user → blocked clearly ✓ / ✗
- [ ] Logout → session cleared ✓ / ✗

## Final Summary

- [ ] Summary written with all required fields
- [ ] Remaining manual steps listed (if any)
