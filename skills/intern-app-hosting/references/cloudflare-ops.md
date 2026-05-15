# Cloudflare Operations

Reference for deploying Workers, binding custom domains, and managing DNS for intern app hosting.

---

## Deploying a Cloudflare Worker

### Via Wrangler CLI

```bash
# Deploy from the app directory (requires wrangler.toml)
npx wrangler deploy

# Deploy with a specific name
npx wrangler deploy --name <app-name>
```

Ensure `wrangler.toml` has:

```toml
name = "<app-name>"
main = "src/index.js"   # or worker.js, index.ts, etc.
compatibility_date = "2024-01-01"
```

### Setting Secrets on a Worker

```bash
# Set a secret interactively
npx wrangler secret put AUTH_SHARED_SECRET

# Or pipe the value
echo "<secret-value>" | npx wrangler secret put AUTH_SHARED_SECRET
```

Set all required auth secrets:
```bash
npx wrangler secret put AUTH_BASE_URL
npx wrangler secret put AUTH_CALLBACK_URL
npx wrangler secret put AUTH_SHARED_SECRET
npx wrangler secret put GOOGLE_HOSTED_DOMAIN
```

---

## Binding a Custom Domain to a Worker

Custom domains connect a hostname like `sample.intern.pearcommerce.com` to a deployed Worker.

### Via Wrangler (wrangler.toml)

Add to `wrangler.toml`:

```toml
[[routes]]
pattern = "sample.intern.pearcommerce.com/*"
zone_name = "intern.pearcommerce.com"
```

Then redeploy:

```bash
npx wrangler deploy
```

### Via Cloudflare Dashboard (fallback)

1. Go to Workers & Pages → your Worker → Settings → Domains & Routes
2. Click "Add Custom Domain"
3. Enter `sample.intern.pearcommerce.com`
4. Cloudflare will create the DNS record automatically

---

## DNS Management

### Lightsail Apps with CloudFront TLS

Do not use a plain Cloudflare-proxied `A` record for `<app>.intern.pearcommerce.com` unless the Cloudflare zone already has exact edge certificate coverage for that second-level intern hostname or the hostname is bound as a Worker/custom hostname. Cloudflare's normal wildcard certificate coverage does not cover hostnames shaped like `<app>.intern.pearcommerce.com`; browsers can fail at Cloudflare edge TLS before nginx or Lightsail is reached.

When Cloudflare custom-domain/certificate permissions are available, bind the intern hostname as a Cloudflare custom domain and keep Cloudflare in front.

When only DNS permissions are available, use AWS CloudFront as the TLS edge. This is the expected pattern for conventional Lightsail Node apps:

1. Create/confirm a DNS-only origin record like `<app>-origin.intern.pearcommerce.com -> <lightsail-ip>`. If another DNS-only origin hostname already points at the same Lightsail instance, it can be reused if nginx has a `server_name` for the new app hostname.
2. Request an ACM cert in `us-east-1` for `<app>.intern.pearcommerce.com`.
3. Add the ACM DNS validation CNAME in Cloudflare as DNS-only.
4. Create a CloudFront distribution with:
   - Alias: `<app>.intern.pearcommerce.com`
   - Viewer certificate: the ACM cert
   - Origin: the DNS-only origin hostname
   - Origin protocol: HTTP / `http-only`
   - Viewer protocol policy: redirect HTTP to HTTPS
   - Cache disabled
   - Viewer request details forwarded to the origin
5. Replace the public hostname record with a DNS-only CNAME to the CloudFront distribution, for example `<app>.intern.pearcommerce.com -> dxxxxxxxxxxxxx.cloudfront.net`.
6. Verify the public hostname returns CloudFront headers and an Amazon-issued certificate for the exact app hostname.

### DNS Record Expectations

For the CloudFront pattern, create these records in the `pearcommerce.com` zone:

```text
A or CNAME  <app>-origin.intern              <lightsail-ip or origin target>       DNS only
CNAME       <acm-validation>.<app>.intern    <aws-validation-target>               DNS only
CNAME       <app>.intern                     <distribution>.cloudfront.net         DNS only
```

Never orange-cloud the public `<app>.intern` record when it points to CloudFront. CloudFront is the TLS edge in this pattern.

Only use a direct proxied `A` pattern when certificate coverage has already been confirmed and documented:

```bash
# Using Cloudflare API
curl -X POST "https://api.cloudflare.com/client/v4/zones/<ZONE_ID>/dns_records" \
  -H "Authorization: Bearer <CF_API_TOKEN>" \
  -H "Content-Type: application/json" \
  --data '{
    "type": "A",
    "name": "sample.intern.pearcommerce.com",
    "content": "<lightsail-public-ip>",
    "proxied": true,
    "ttl": 1
  }'
```

For direct Cloudflare proxying, set `proxied: true`. For CloudFront-backed intern apps, set the public CNAME to DNS only.

### Verifying a DNS Record

```bash
# Check the public hostname target
dig +short sample.intern.pearcommerce.com CNAME

# CloudFront-backed apps should show x-cache / x-amz-cf-* headers
curl -I https://sample.intern.pearcommerce.com
```

---

## TLS Verification

After binding the domain:

```bash
# Check TLS certificate
curl -v https://sample.intern.pearcommerce.com 2>&1 | grep -A5 "SSL certificate"

# Or simply check the response
curl -sI https://sample.intern.pearcommerce.com | head -5
```

For Worker/custom-domain apps, expect a Cloudflare-issued cert. For Lightsail apps using the CloudFront pattern, expect an Amazon-issued cert with `DNS:<app>.intern.pearcommerce.com` in the SAN and CloudFront response headers.

For Lightsail origins, set Cloudflare SSL mode to **Full** (origin uses self-signed cert) or **Full (Strict)** (origin has a valid cert):

- Dashboard: SSL/TLS → Overview → Select Full or Full (Strict)
- Do not use "Flexible" — it leaves the Cloudflare-to-origin leg unencrypted

---

## Useful Cloudflare Environment Variables

When using the API directly, you'll need:

```bash
CF_API_TOKEN=<token with Zone:Edit and Workers:Edit permissions>
CF_ZONE_ID=<zone ID for pearcommerce.com or intern.pearcommerce.com>
CF_ACCOUNT_ID=<Cloudflare account ID>
```

These should be available in the Pear secrets store or set in your shell environment.
