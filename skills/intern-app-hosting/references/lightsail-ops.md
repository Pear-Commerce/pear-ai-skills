# Lightsail Operations

Reference for provisioning and configuring AWS Lightsail instances for Node apps on Pear intern hostnames.

---

## Provisioning a Lightsail Instance

### Via AWS CLI

```bash
# Create a Node-compatible instance
aws lightsail create-instances \
  --instance-names "<app-name>-intern" \
  --availability-zone us-east-1a \
  --blueprint-id node_20 \
  --bundle-id micro_3_0 \
  --region us-east-1
```

Common blueprints:
- `node_20` — Node.js 20
- `node_18` — Node.js 18
- `amazon_linux_2023` — bare Linux (if you need more control)

Common bundles (pick the smallest that fits):
- `micro_3_0` — 1GB RAM, 1 vCPU (default for conventional Node intern apps)
- `nano_3_0` — 512MB RAM, 1 vCPU (only for very small, low-traffic utilities with one lightweight process)

Default to one conventional Node app per Lightsail instance. Do not place multiple long-running Node apps on the same `nano_3_0` or `micro_3_0` host unless the user explicitly accepts the reliability tradeoff. Shared tiny hosts have caused memory pressure, hung requests, and CloudFront 504s.

### Add Swap on Small Ubuntu Hosts

For `nano_3_0` and `micro_3_0` Ubuntu/Node instances, add a 1 GB swapfile before final verification:

```bash
sudo fallocate -l 1G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h
```

If `fallocate` is unavailable, use:

```bash
sudo dd if=/dev/zero of=/swapfile bs=1M count=1024
```

### Get the Public IP

```bash
aws lightsail get-instance \
  --instance-name "<app-name>-intern" \
  --query 'instance.publicIpAddress' \
  --output text
```

### Public Ports

Expose only ports 80/443 publicly. Keep the Node app bound to `127.0.0.1:<port>` behind nginx. CloudFront reaches nginx over HTTP on port 80; browsers use HTTPS to CloudFront.

---

## Setting Up the Node App

### SSH Into the Instance

```bash
# Download the default key pair first if needed
aws lightsail download-default-key-pair

# SSH in
ssh -i <key-file> bitnami@<public-ip>
# or for Amazon Linux:
ssh -i <key-file> ec2-user@<public-ip>
```

### Install Dependencies and Start the App

```bash
cd /home/bitnami/<app-name>
npm install
```

### Setting Environment Variables

Create a `.env` file or export them in the startup script:

```bash
cat > .env << 'EOF'
APP_NAME=sample
APP_DOMAIN=sample.intern.pearcommerce.com
AUTH_BASE_URL=https://auth.intern.pearcommerce.com
AUTH_CALLBACK_URL=https://sample.intern.pearcommerce.com/auth/google/callback
AUTH_SHARED_SECRET=<retrieve from Pear secrets store>
GOOGLE_HOSTED_DOMAIN=pearcommerce.com
SESSION_SECRET=<generate a strong random secret>
PORT=3000
EOF
```

Load with `dotenv` in `package.json` start script, or use `source .env` for quick testing.

---

## Running as a Persistent Process

Prefer systemd so the app survives SSH disconnects and reboots and follows the existing intern hosting pattern:

```ini
[Unit]
Description=Pear <app-name> intern app
After=network.target

[Service]
Type=simple
User=<app-user>
Group=<app-user>
WorkingDirectory=/opt/<app-name>/app
EnvironmentFile=/etc/<app-name>/app.env
ExecStart=/usr/bin/node src/server.js
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ReadWritePaths=/var/lib/<app-name> /opt/<app-name>/app/public /opt/<app-name>/app/dist

[Install]
WantedBy=multi-user.target
```

Check status:

```bash
systemctl is-active <app-name>
journalctl -u <app-name> -n 100 --no-pager
```

---

## Express Session Pattern (Shared Auth)

For Lightsail apps using the shared auth contract:

```javascript
const express = require('express');
const session = require('express-session');
const crypto = require('crypto');

const app = express();

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: true, sameSite: 'lax' }
}));

// Initiate login
app.get('/login', (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  const nonce = crypto.randomBytes(16).toString('hex');
  req.session.authState = state;
  req.session.authNonce = nonce;

  const params = new URLSearchParams({
    return_to: process.env.AUTH_CALLBACK_URL,
    state,
    nonce,
    hosted_domain: process.env.GOOGLE_HOSTED_DOMAIN,
    app_name: process.env.APP_NAME
  });

  res.redirect(`${process.env.AUTH_BASE_URL}/auth/google/start?${params}`);
});

// Receive callback from shared auth service
app.get('/auth/google/callback', (req, res) => {
  const { state, session_token } = req.query;

  if (state !== req.session.authState) return res.status(403).send('Bad state');

  // Validate session_token using AUTH_SHARED_SECRET
  // (implement validateSharedToken based on the shared auth service's signing method)
  const claims = validateSharedToken(session_token, process.env.AUTH_SHARED_SECRET);
  if (!claims) return res.status(403).send('Invalid token');
  if (claims.nonce !== req.session.authNonce) return res.status(403).send('Bad nonce');
  if (claims.hd !== process.env.GOOGLE_HOSTED_DOMAIN) return res.status(403).send('Wrong domain');

  // Create local session
  req.session.user = { email: claims.email, name: claims.name };
  delete req.session.authState;
  delete req.session.authNonce;

  res.redirect('/');
});

// Auth guard middleware
function requireAuth(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}
```

---

## Nginx Origin Configuration

CloudFront must be able to reach the app over HTTP on port 80. Do not redirect origin HTTP to the public HTTPS hostname; let CloudFront handle viewer HTTPS.

```nginx
server {
    listen 80;
    server_name <app-name>.intern.pearcommerce.com <app-name>-origin.intern.pearcommerce.com;

    client_max_body_size 4m;

    location / {
        proxy_pass http://127.0.0.1:<app-port>;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 180s;
    }
}
```

Run:

```bash
nginx -t
systemctl reload nginx
```

## CloudFront + ACM SSL Pattern

Use this for second-level intern hostnames such as `<app-name>.intern.pearcommerce.com`. This is the proven pattern from `aws-cost-tracker.intern.pearcommerce.com` and `proxy-spend.intern.pearcommerce.com`.

1. Create or reuse a DNS-only Cloudflare origin record:
   - `<app-name>-origin.intern.pearcommerce.com -> <lightsail-ip>`
   - Existing origin hostnames that already point at the same Lightsail instance can be reused if nginx has a `server_name` for the new public app hostname.
2. Request an ACM certificate in `us-east-1` for `<app-name>.intern.pearcommerce.com`.
3. Add the ACM DNS validation CNAME in Cloudflare as DNS-only.
4. Wait until ACM status is `ISSUED`.
5. Create a CloudFront distribution:
   - Alias: `<app-name>.intern.pearcommerce.com`
   - Viewer certificate: the ACM cert
   - Origin: `<app-name>-origin.intern.pearcommerce.com` or the reused DNS-only origin hostname
   - Origin protocol policy: `http-only`
   - Viewer protocol policy: `redirect-to-https`
   - Cache policy: disabled
   - Origin request policy: forward viewer request details, including Host
   - Allowed methods: include all methods needed by the app
6. Create/replace the public Cloudflare DNS record:
   - `CNAME <app-name>.intern.pearcommerce.com -> <cloudfront-domain>`
   - Proxy status: DNS only, never orange-clouded for this CloudFront pattern
7. Verify `curl -sI https://<app-name>.intern.pearcommerce.com` shows CloudFront headers and a browser-valid Amazon-issued certificate for the exact hostname.

Do not switch the public hostname back to a Cloudflare-proxied `A` record unless Cloudflare custom-hostname certificate coverage is explicitly configured for that exact intern hostname.

If Cloudflare DNS writes are unavailable but the Lightsail instance has a static IP, you can use the instance's stable EC2 public DNS name as the CloudFront origin, for example `ec2-203-0-113-10.compute-1.amazonaws.com`. This is less readable than a `*-origin.intern.pearcommerce.com` DNS-only record, but it avoids a hard dependency on Cloudflare DNS access and still keeps browsers on the CloudFront-backed public hostname.
