---
name: intern-app-hosting
description: Host and update internal standalone apps on Pear-managed subdomains (*.intern.pearcommerce.com). Use this skill whenever someone brings an app that needs to be deployed internally at Pear Commerce, and always after building or substantially finishing a new standalone app/tool/site/demo/service so the AI assistant proactively suggests publishing it. Covers choosing between Cloudflare Workers and AWS Lightsail, wiring shared Google OAuth, binding the subdomain, CloudFront/ACM SSL for Lightsail apps, verifying, and redeploying future changes. Trigger on phrases like "host this app", "deploy this internally", "get this on a Pear subdomain", "set up intern hosting", "put this on intern.pearcommerce.com", "getting this live", "sharing this internally", "redeploy", or any request to make an internal tool accessible to the team. Also trigger for shared auth, subdomain setup, SSL/DNS setup, or Cloudflare/Lightsail hosting decisions at Pear.
---

# Intern App Hosting

## Canonical Skill Source

The canonical Pear skills repository is `https://github.com/Pear-Commerce/pear-ai-skills`.

When asked to update this skill from any in-repository copy, first read the canonical copy at `skills/intern-app-hosting/SKILL.md`, make the canonical repo change, and push it. Then update any vendored app-repo copy that should stay in sync. For app repos other than `api.pearcommerce.com`, commit and push directly after verification. For `api.pearcommerce.com`, use a `codex/` branch and open a pull request instead of pushing directly to `master`.

This skill takes an already-built app and hosts it on a Pear-managed subdomain like `sample.intern.pearcommerce.com`. It acts — using available tools — rather than just advising.

## Standalone App Prompt

When a task creates or substantially finishes a standalone app, tool, site, demo, or service that is not merely an embedded component of an existing product, always proactively ask the user whether they want it published internally. If they say yes, continue with this skill. If they already asked to share it with the team or get it live, do not ask again; proceed through the hosting workflow.

## Your Role

Work through the intake, decision, provisioning, auth wiring, and verification steps in order. At each step, use whatever tools are available (Cloudflare API, AWS CLI, MCP connectors, bash) to take action directly. Only fall back to telling the human what to do when a step genuinely requires credentials or console access you don't have.

---

## Step 1: Intake — Understand the App

Before making any decisions, inspect the app:

- Read the entrypoint (e.g., `index.js`, `worker.js`, `server.js`, `app.js`)
- Read `package.json` for dependencies and scripts
- Look for `app.listen()`, `server.listen()`, or equivalent — this signals a conventional Node server
- Note any native modules, filesystem writes, background processes, or long-running state

If you can't find these files, ask the user where the app lives or what its runtime looks like.

---

## Step 1.25: Resolve the Directory Manifest and Source Repo

Do this for every new app, existing app update, redeploy, favicon change, auth fix, or manifest-only metadata change. The manifest is not the source of truth for DNS, but it is the first place to find the app's durable source repo.

1. Determine the app hostname (`<app-name>.intern.pearcommerce.com`) before editing or deploying.
2. Fetch the current manifest from S3:

```bash
curl -fsSL https://public-pearcommerce.s3.amazonaws.com/intern-app-manifests/index.json \
  | jq '.manifests[] | select(.subdomain=="<app-hostname>")'
```

3. If the manifest has `githubProjectUrl`, use that repo as the source of truth. Find or clone a local checkout, confirm its `origin` matches the manifest URL, and inspect `git status -sb` before editing.
4. If the manifest is missing or has no `githubProjectUrl`, create or identify the Pear-Commerce repo before finishing the hosting/update workflow. For an already-deployed Worker with no local source, export the live Worker bundle, scaffold a minimal repo, commit it, push it, then write the repo URL back to the manifest.
5. If the manifest points to a personal namespace or a stale repo, transfer or recreate under `Pear-Commerce`, update the local remote, and write the corrected `githubProjectUrl` back to the manifest.
6. Do not leave an app update with source changes only on the local machine. Every code, config, favicon, README, deployment script, or skill-created app artifact change must be committed and pushed to the app's GitHub repo.

---

## Step 1.5: Required — Publish and Push Source to GitHub

Do this whenever the app has no durable source repo yet, when the manifest is missing a GitHub URL, when the source repo is not under `Pear-Commerce`, or whenever you change app source/config/docs as part of hosting or updating it. Skip only when the app is already in the right repo and there are no source changes to commit.

All intern app source repositories must live under the `Pear-Commerce` GitHub organization. Do not create or leave intern app source in a personal GitHub namespace. If an existing intern app repo is under a personal account, transfer it to `Pear-Commerce`, update the local `origin` remote to `https://github.com/Pear-Commerce/<repo-name>.git`, and update the app manifest `githubProjectUrl`.

Use the GitHub publish workflow before hosting:

1. Confirm `gh` is installed and authenticated with access to the `Pear-Commerce` GitHub org.
2. Inspect `git status -sb` and the diff. If the worktree is mixed, stage only the app files and docs that belong to this intern app.
3. If the manifest names an existing GitHub repo, pull or fetch it before editing so the local checkout is current.
4. If there is no repo yet, create a private `Pear-Commerce` repo with a clear app name, initialize `main`, add a `.gitignore`, `.env.example`, README, deployment notes, and any source files needed to rebuild the app.
5. Commit with a terse message and push `main` to GitHub. Standalone intern app repos should not be left on unpushed local branches after a deploy or update.
6. If the app lives inside an existing product repo instead of a standalone intern app repo, follow that repo's normal Pear workflow, but still commit and push the branch before finalizing.
7. Never commit secrets. Document required secrets and environment variables in `.env.example` or the README.
8. Write the GitHub repo URL to the app manifest with `--github-project` before finalizing.
9. Record the GitHub repo URL and pushed commit SHA for the final hosting summary.

For new standalone repos, a typical CLI path is:

```bash
gh repo create Pear-Commerce/<repo-name> --private --source=. --remote=origin --push
```

---

## Step 2: Choose a Hosting Target

**Default: Cloudflare Workers**

Choose Workers when the app is:
- Stateless and request/response oriented
- A lightweight HTTP app or simple UI
- Free of native binaries and unrestricted filesystem needs
- Not reliant on a long-running process

**Fallback: AWS Lightsail**

Choose Lightsail when any of the following is true:
- The app uses `app.listen()` or a conventional Node server that should stay intact
- It depends on native modules or binaries incompatible with the Workers runtime
- It expects local disk writes or persistent local state
- It needs background processes or a long-running server model
- Rewriting for Workers would add more risk than preserving the app as-is

State your choice and the one-sentence reason. The goal is the lowest-risk path that keeps the app working as built.

---

## Step 3: Provision the Subdomain

The target hostname follows the pattern: `<app-name>.intern.pearcommerce.com`

Confirm the intended `<app-name>` with the user if not obvious.

**For Cloudflare Workers:**
1. Deploy the Worker (or confirm it's already deployed)
2. Bind the custom domain `<app-name>.intern.pearcommerce.com` to the Worker
3. Verify the DNS record is proxied (orange cloud)
4. Confirm TLS is served by Cloudflare

**For Lightsail:**
1. Confirm or provision the Lightsail instance and get its public IP
2. Do **not** use a Cloudflare-proxied `A` record directly on `<app-name>.intern.pearcommerce.com` unless exact Cloudflare edge certificate coverage has already been configured. Cloudflare's normal wildcard certs cover one label only and do not cover second-level intern hostnames like `<app>.intern.pearcommerce.com`.
3. Preferred proven pattern for conventional Lightsail apps: create/confirm a DNS-only origin record, serve the app from nginx over HTTP on port 80, request an ACM certificate in `us-east-1`, validate it with a DNS-only Cloudflare CNAME, create a CloudFront distribution with the ACM cert, then point the public hostname to CloudFront with a DNS-only CNAME.
4. Configure CloudFront as: alias `<app-name>.intern.pearcommerce.com`, origin `<app-name>-origin.intern.pearcommerce.com` or another DNS-only origin hostname pointing at the Lightsail IP, origin protocol `http-only`, viewer protocol policy `redirect-to-https`, cache disabled, forward viewer request details, and ACM viewer certificate.
5. Confirm HTTPS from the real hostname returns a browser-trusted cert before handing the URL back.

Read `references/cloudflare-ops.md` for step-by-step Cloudflare actions.
Read `references/lightsail-ops.md` for Lightsail provisioning steps.

---

## Step 3.25: Preempt Hostname Drift and Natural Aliases

Do this before final verification and before giving the user a URL. This prevents the recurring failure where the app is live at one slug but the user naturally tries a repo-name or app-name variant that returns `DNS_PROBE_FINISHED_NXDOMAIN`.

1. Collect likely hostnames:
   - The explicit user-requested hostname, if any.
   - The display-name slug, e.g. `Pear AI Skills` -> `pear-ai-skills.intern.pearcommerce.com`.
   - The GitHub repo slug, e.g. `pear-ai-skills-app` -> `pear-ai-skills-app.intern.pearcommerce.com`.
   - The Worker/service/process slug, if different.
   - The same slugs with a trailing `-app` removed or added when that variant is natural and unclaimed.
2. Pick one canonical hostname for the directory card and primary handoff.
3. For every other likely hostname that is safe and unclaimed, bind it as an alias to the same app:
   - Workers: add another `[[routes]]` custom domain or equivalent Cloudflare custom-domain binding, then redeploy.
   - Lightsail/CloudFront: add the alias to CloudFront and certificate coverage, or create a redirect host if that is lower risk.
4. For alias hostnames, add or update S3 manifests with `excludeFromDirectory: true` and an `excludeReason` like `Alias for <canonical-host>; hidden to avoid duplicate directory cards.`
5. Verify DNS with public resolvers, not only the local resolver:

```bash
dig @1.1.1.1 +short <alias-hostname>
dig @8.8.8.8 +short <alias-hostname>
```

6. Also verify the user's default resolver path, because Chrome and normal curl use it:

```bash
dig +short <alias-hostname>
curl -I --connect-timeout 10 https://<alias-hostname>/ 2>&1 | sed -n '1,8p'
```

7. If public resolvers and Cloudflare authoritative nameservers return records but the default resolver returns `NXDOMAIN` or curl says `Could not resolve host`, call it a local/ISP resolver cache issue, not a Cloudflare hostname failure. Flush local DNS cache and retry:

```bash
dscacheutil -flushcache || true
killall -HUP mDNSResponder 2>/dev/null || true
```

8. If the default resolver still returns `NXDOMAIN`, identify the configured DNS server with `scutil --dns`. If it is a home/ISP/router resolver, tell the user the hostname is already created in public DNS and offer to switch the active network service to public DNS for immediate access. On macOS Wi-Fi, the reversible command is:

```bash
networksetup -setdnsservers Wi-Fi 1.1.1.1 8.8.8.8
```

To restore automatic DNS later:

```bash
networksetup -setdnsservers Wi-Fi Empty
```

9. If the public resolvers return records but the local resolver still returns NXDOMAIN, do not call the hostname broken and do not keep re-creating Cloudflare bindings. Fix or explain the local resolver path instead.
10. In the final summary, list the canonical hostname and any aliases that were bound.

If an alias is unsafe, already owned by another app, or intentionally skipped, mention that explicitly in the final summary.

---

## Step 3.5: Check for WAF Score Degradation Before Verifying

**Do this before verification.** Heavy curl probing and API calls during a deploy can degrade the Cloudflare WAF attack scores (`cf.waf.score.sqli`, `cf.waf.score.rce`) for the operator's IP. The Pear zone has a custom rule called **"Block known bad attacks"** (Security → Security rules, order 2) that fires when these scores drop to ≤ 20. When triggered it returns Cloudflare's branded 403 block page (~4577 bytes) — which looks like a Worker or code error but is happening entirely at the WAF layer before the Worker runs.

**The "Block known bad attacks" rule expression:**
```
(
  http.host in {
    "api.pearcommerce.com"
    "dashboard.pearcommerce.com"
    "availabilities.pearcommerce.com"
    "jobs.pearcommerce.com"
    "list-scraper.pearcommerce.com"
    "catalog-ingester.pearcommerce.com"
    "recipe-importer.pearcommerce.com"
  }
  or http.host wildcard "*api*.pearcommerce.com"
)
and (
  cf.waf.score.sqli le 20
  or cf.waf.score.rce le 20
)
```

Two things to check before verifying:

**1. Does the app name contain "api"?**

The wildcard `*api*.pearcommerce.com` catches any intern hostname with "api" in the name (e.g. `myapi.intern.pearcommerce.com`, `retailer-api.intern.pearcommerce.com`). If the app name contains "api", it will always be subject to this rule — regardless of WAF score. Rename the slug to avoid "api" in the hostname, or accept that the rule will apply and ensure the operator's WAF score is healthy before testing.

**2. Is the operator's WAF score degraded from deploy probing?**

High-volume curl and API probing during deploy can temporarily lower the WAF score enough to trigger the block. Signs this is the cause:
- The 403 block affects `*.intern.pearcommerce.com` from the operator's IP but not from other IPs
- The operator was running curl probes heavily during the deploy session
- Existing apps like `sample.intern.pearcommerce.com` also return 403 from the same IP

If this is happening, the score recovers on its own within minutes to hours. To confirm and speed up resolution:
- Go to Security → Analytics → Events in the Cloudflare dashboard
- Filter by the cf-ray from the failed request to confirm the "Block known bad attacks" rule fired
- If confirmed: wait 15–30 minutes and retry from the operator's IP, or have them test from a different IP or the Pear VPN in the meantime
- Do **not** add the intern hostname to the "Block known bad attacks" rule's host list — that rule is for blocking, not allowlisting

**There is no slug allowlist.** New intern subdomains do not need to be registered anywhere. The block is score-based and IP-transient, not hostname-based.

---

## Step 4: Wire Up Shared Google Auth

All apps use the shared Google OAuth client at `auth.intern.pearcommerce.com`. No app should register its own Google redirect URI.

Read `references/shared-auth-contract.md` for the full contract. The key points:

- **Login start**: app redirects user to `https://auth.intern.pearcommerce.com/auth/google/start` with `return_to`, `state`, `nonce`, `hosted_domain`, `app_name`
- **Callback**: shared auth service completes Google OAuth and redirects back to the app's callback URL with `state` and a signed `session_token`
- **Validation**: app validates `state`, validates `session_token` using `AUTH_SHARED_SECRET`, checks nonce and `hosted_domain`, then creates a local session

**Important: do not rotate or reinterpret `AUTH_SHARED_SECRET`.** The auth service and every hosted app must use the exact same byte string. When fixing one app, update only that app's secret unless the user explicitly asks for a shared rotation.

At Pear, the safe source for Worker secret setup is the exact raw `SecretString` from AWS Secrets Manager secret `intern-app-hosting-auth-shared-secret` in `us-east-1`. Do not JSON-parse it, pick an inner field, trim quotes from it, or substitute a stale KV value. If stores disagree, treat the currently deployed auth service as the source of truth and verify candidate values against a fresh `session_token` before setting the app secret.

Set a Worker app's shared secret like this:

```bash
AUTH_SHARED_SECRET="$(
  aws secretsmanager get-secret-value \
    --secret-id intern-app-hosting-auth-shared-secret \
    --region us-east-1 \
    --query SecretString \
    --output text
)"
printf '%s' "$AUTH_SHARED_SECRET" | npx wrangler secret put AUTH_SHARED_SECRET --name <worker-name>
```

If the user reports `Bad shared auth token signature`, do not touch `auth-intern` or other apps. Update only the affected app's `AUTH_SHARED_SECRET`, then retry the callback. A stale pasted callback may then say `Shared auth token expired`; that is progress and means the signature now verifies.

**Required env vars for the hosted app:**
```
AUTH_BASE_URL=https://auth.intern.pearcommerce.com
AUTH_CALLBACK_URL=https://<app-hostname>/auth/google/callback
AUTH_SHARED_SECRET=<shared secret — retrieve from Pear secrets store>
GOOGLE_HOSTED_DOMAIN=pearcommerce.com
```

**For Worker apps**, session state lives in a signed cookie.
**For Lightsail/Node apps**, use `express-session` with `connect.sid`. Add `SESSION_SECRET` to env vars.

Set these secrets/env vars using whatever secrets management is available (Workers secrets, Lightsail instance env, etc.).

---

## Step 5: Verify

Start with a quick triage probe before running the full verification suite — this saves operators from chasing a code bug when the real issue is upstream.

### 5a. Triage probe

```bash
curl -sI https://<app-name>.intern.pearcommerce.com
```

Read the response before going further:

| What you see | What it means | What to do |
|---|---|---|
| `HTTP/2 200` or `HTTP/2 302` with Worker headers | Worker is reachable | Proceed to 5b |
| `HTTP/1.1 403` + `server: cloudflare` + large HTML body (~4KB+) | WAF block — not a Worker error | Go back to Step 3.5 |
| `HTTP/2 403` or `HTTP/2 500` + small JSON body or Cloudflare `1xxx` error page | Worker reached, Worker-level error | Debug the Worker code/secrets |
| `curl: (6) Could not resolve host` | DNS not propagated yet | Wait 1–2 min, retry |

To confirm a WAF block vs. a Worker error, check response size:
```bash
curl -s https://<app-name>.intern.pearcommerce.com | wc -c
```
A WAF block page is typically 4000–5000 bytes of branded HTML. A Worker exception is usually under 500 bytes of JSON or a terse Cloudflare error. If you see a large HTML response with a `cf-ray` header in the headers output, it's WAF — stop and resolve Step 3.5 before continuing.

Also check whether existing apps are affected from the same IP:
```bash
curl -sI https://sample.intern.pearcommerce.com
```
If a known-good app is also returning 403, the block is IP-level (rate limit or VPN gate), not slug-specific. Advise the operator to connect to the Pear VPN or wait out the rate limit cooldown.

### 5b. Functional verification

Once the triage probe returns a clean response, run the full suite:

1. **Anonymous user** — visit the app URL without being logged in. Expect: redirect to login path, then to Google OAuth.
2. **Allowed user** — complete OAuth with a `@pearcommerce.com` account. Expect: land on the app successfully.
3. **Denied user** — attempt OAuth with a non-Pear Google account. Expect: clear block or error from the shared auth service.
4. **Logout** — if the app has a logout route, trigger it. Expect: local session cleared.

Record what you observed for each check.

---

## Step 5.5: Update the S3 App Manifest and Browser Favicon

Do this every time you create, deploy, or materially update an intern app. DNS remains the source of truth for registered hostnames; the manifest is display metadata for `apps.intern.pearcommerce.com`.

Manifest updates are mandatory when you create, transfer, discover, or change the app's GitHub repo. Keep `githubProjectUrl` populated for every user-facing app source repo, and update `lastUpdated` whenever code, config, favicon, or app metadata changes.

Manifest location:

```text
s3://public-pearcommerce/intern-app-manifests/index.json
s3://public-pearcommerce/intern-app-manifests/manifests/<app-hostname>.json
```

Manifest fields:

```json
{
  "schemaVersion": 1,
  "name": "<human app name>",
  "subdomain": "<app-name>.intern.pearcommerce.com",
  "url": "https://<app-name>.intern.pearcommerce.com",
  "author": "<owner/author, blank when unknown>",
  "version": "<app version or deploy version>",
  "lastUpdated": "<ISO-8601 timestamp>",
  "iconUrl": "<favicon or icon URL>",
  "githubProjectUrl": "<GitHub repo/project URL, blank when unknown>",
  "summary": "<one or two sentence description>",
  "excludeFromDirectory": false,
  "excludeReason": "",
  "source": "intern-app-hosting-skill"
}
```

Icon and favicon rules:

1. Prefer the app's real favicon when it already has one, such as `https://<app-name>.intern.pearcommerce.com/favicon.svg` or `/favicon.ico`. Use that same URL for `manifest.iconUrl`.
2. If the app does not have a real favicon, create or reuse a generated SVG icon at `s3://public-pearcommerce/intern-app-manifests/icons/<app-hostname>.svg`, publish it `public-read`, and use its public S3 URL for `manifest.iconUrl`.
3. Update the app HTML/template/source so the browser receives a favicon link:

```html
<link rel="icon" href="<manifest.iconUrl>" type="image/svg+xml">
```

Use the correct MIME type if the icon is not SVG.

4. If the app can serve routes, also make `/favicon.svg` and/or `/favicon.ico` serve or redirect to the same icon. For static apps, placing the favicon file in `public/` is enough.
5. Keep the directory manifest and browser favicon in sync. When a material app update changes the icon, update both the app source and the manifest in the same pass.
6. Do not create directory-facing icons for support-only records unless they have an actual browser surface. Mark support records with `excludeFromDirectory`.

If the `intern-app-directory` repo is available, prefer its helper:

```bash
cd /Users/alexwyler/intern-app-directory
npm run manifest:upsert -- \
  --subdomain <app-name>.intern.pearcommerce.com \
  --name "<human app name>" \
  --author "<owner or blank>" \
  --version "<version>" \
  --icon "<manifest.iconUrl>" \
  --github-project "<GitHub repo/project URL>" \
  --summary "<plain-language summary>" \
  --upload
```

Use `--exclude-from-directory true` and `--exclude-reason "<why hidden>"` for support records, origin hosts, certificate-validation records, or aliases that should remain registered but hidden from the directory UI. Certificate-validation and other hosting-artifact DNS records often start with an underscore, for example `_422573a1a06b6a7cdbe9684deabfc5d5.wayvia-dash.intern.pearcommerce.com`; these are never apps and should be hidden automatically by the directory. Do not create icons, summaries, or app cards for underscore hostnames.

If that repo is unavailable, update the two S3 JSON objects directly with AWS CLI and `jq`, preserving `public-read` object ACLs. Never include secrets or private user data in a manifest. Use blank `author` when unsure.

Directory visibility handoff:

- User-facing intern apps are visible in `apps.intern.pearcommerce.com` by default unless the user asks for the app to be hidden.
- When an app is visible, explain in the final handoff that the user can ask Codex or Claude to hide it from the intern apps directory later. Hiding should set `excludeFromDirectory: true` and a clear `excludeReason`, while keeping the app reachable by direct URL.
- When an app is hidden, explicitly say it is hidden from the directory and remains reachable by direct URL.

Verify the favicon and manifest before finalizing:

```bash
curl -s https://<app-name>.intern.pearcommerce.com | rg 'rel="icon"|rel=icon|favicon'
curl -sI <manifest.iconUrl>
curl -fsSL https://public-pearcommerce.s3.amazonaws.com/intern-app-manifests/index.json | jq '.manifests[] | select(.subdomain=="<app-name>.intern.pearcommerce.com")'
```

When source is published on GitHub, keep `githubProjectUrl` in the manifest. The directory renders it as a card-bottom GitHub link, and the manifest helper accepts `--github-project`, `--github`, or `--github-repo`.

---

## Step 6: Final Operator Summary

Always produce this summary at the end:

```
## Hosting Summary: <app-name>

**Hostname:** https://<app-name>.intern.pearcommerce.com
**Aliases:** <other verified hostnames bound to the same app, or "none">
**Hosting target:** Cloudflare Workers | AWS Lightsail
**Reason for choice:** <one sentence>
**GitHub source:** <repo URL and pushed commit SHA, or "not changed">
**Directory manifest:** s3://public-pearcommerce/intern-app-manifests/manifests/<app-hostname>.json (updated | not updated because <reason>)
**Directory visibility:** visible in apps.intern.pearcommerce.com | hidden from directory but reachable by direct URL
**Browser favicon:** <manifest.iconUrl> (wired in app HTML | not updated because <reason>)

If the app is visible, add: "You can ask Codex or Claude to hide this from the intern apps directory later; the app will still be reachable by direct URL."

**Auth mode:** Shared Google OAuth via auth.intern.pearcommerce.com
**Auth callback registered in Google Cloud:** https://auth.intern.pearcommerce.com/auth/google/callback (no app-specific URI needed)

**Secrets / env vars set:**
- AUTH_BASE_URL
- AUTH_CALLBACK_URL
- AUTH_SHARED_SECRET
- GOOGLE_HOSTED_DOMAIN
- SESSION_SECRET (if Lightsail)

**Verification:**
- Anonymous: [observed result]
- Allowed user: [observed result]
- Denied user: [observed result]
- Logout: [observed result]

**Remaining manual steps:**
- [List anything that requires human console access, credentials you couldn't reach, or Google Cloud changes]
```

---

## When Tools Aren't Available

If you lack a tool to complete a step (e.g., no Cloudflare API access, no AWS CLI), do the following:
- Complete everything else you can
- In the Final Summary, list the blocked step under "Remaining manual steps" with exact instructions for a human to complete it
- Don't skip the summary — partial progress is still valuable

---

## Reference Files

- `references/shared-auth-contract.md` — Full shared auth contract: flows, env vars, session handling
- `references/cloudflare-ops.md` — Cloudflare Worker deploy, custom domain binding, DNS management
- `references/lightsail-ops.md` — Lightsail provisioning, Express setup, Cloudflare-fronted origin config
- `references/operator-checklist.md` — Quick checklist form for tracking progress per app
