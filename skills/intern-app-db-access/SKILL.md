---
name: intern-app-db-access
description: Give a Pear intern app its own database on the shared intern MySQL RDS instance. Provisions (once) a single shared MySQL 8 RDS instance with a public IP, then per-app creates an isolated database, a scoped DB user, and an AWS Secrets Manager secret in the same shape the Pear dashboard API uses (prod-db-10-2025), and drops a multi-runtime connection bootstrap helper (Node/Python/Java) into the app. Use whenever an intern app needs persistence, after or alongside $intern-app-hosting. Trigger on phrases like "give this intern app a database", "add a DB to this intern app", "intern app needs a database", "bootstrap a db connection for this app", or when an intern app being hosted needs server-side storage.
---

# Intern App DB Access

## Canonical Skill Source

The canonical Pear skills repository is `https://github.com/Pear-Commerce/pear-ai-skills`. Skill edits go here first, then are synced into installed targets. See `$canonical-skills` for the full edit/push workflow.

## AWS SSO Prerequisite

Before running any AWS CLI command in this skill (RDS, Secrets Manager, security groups), proactively run:

```bash
aws sso login --profile pear-sso
```

This opens the user's Chrome browser for authentication and blocks until approved. Never attempt AWS commands with stale credentials — if you see `UnrecognizedClientException` or `Token has expired`, run the login command first and retry. See `$pear-aws` for full credential troubleshooting.

## Relationship to $intern-app-hosting

This is a **companion** to `$intern-app-hosting`, not a replacement. `$intern-app-hosting` puts the app on a Pear subdomain with shared Google OAuth. This skill gives the same app a database. Run `$intern-app-hosting` for the hosting/auth lane and this skill for the DB lane. An app can have either, or both.

This skill is **not** for apps that need to read production data. It gives each app its own isolated database on a shared intern DB server. If an app needs prod data, that is a different, riskier path (VPC-private prod RDS Proxy, Lightsail-only) and is out of scope here by design.

## Architecture

**One shared MySQL 8 RDS instance, many per-app databases.**

- **Shared infra (provisioned once, idempotent):** a single MySQL 8.0 RDS instance `pear-intern-db` with a public IP in the account default VPC, TLS required, a dedicated security group `pear-intern-db` allowing TCP 3306 from Cloudflare's IPv4 ranges (so Cloudflare Worker apps can reach it) and from the Lightsail VPC CIDR (so Lightsail apps can reach it). An admin secret `pear-intern-db-admin` in Secrets Manager holds the root credentials.
- **Per-app (every invocation):** create a database `intern_<app>` on the shared instance, create a user `intern_<app>` scoped to that one database only, write a Secrets Manager secret `intern-app-<app>-db` in the **same shape as the dashboard API's `prod-db-10-2025`** (`{engine, host, port, dbname, username, password}`), then copy a connection-bootstrap helper into the app.

The connection bootstrap is a faithful, cleaned-up port of the Pear dashboard API's `src/db/mysqlCredentials.js` + `src/db/mysql.js`: fetch the secret with `GetSecretValue`, parse the JSON, build a `mysql2`/`pymysql`/HikariCP pool. The only intentional differences from the dashboard API: no hardcoded `dev-database.pearcommerce.com` host default (the secret's `host` is the real endpoint), no `pear` schema default (each app has its own `dbname`), and TLS is on by default because the endpoint is public.

## Guardrails

- **Never touch the production RDS proxy, the prod cluster, or prod secrets** (`prod-db-10-2025`, `pear-db-proxy-*`, `pear-aurora-prod-*`). This skill only creates and modifies `pear-intern-db` and `intern-app-*` resources. Before any `aws rds` or `aws secretsmanager` write, confirm the target name starts with `pear-intern-db` or `intern-app-`.
- **One DB user per app, scoped to one database.** Never reuse the admin user in an app secret. Never grant a per-app user access to another app's database.
- **Never print secret values.** Pass passwords through environment variables or temp files and `unset` them. It is fine to print secret names and ARNs.
- **The shared instance costs real money.** State the monthly cost before provisioning and confirm with the user the first time only.

---

## Step 0: Bootstrap Missing Local Tools

Same idea as `$intern-app-hosting` Step 0. Before any AWS action:

```bash
for tool in aws jq curl node mysql; do
  command -v "$tool" >/dev/null 2>&1 && echo "ok $tool" || echo "missing $tool"
done
```

If tools are missing on macOS:

```bash
brew install awscli jq node mysql-client
```

`mysql` (the client) is needed to run `CREATE DATABASE` / `CREATE USER` / `GRANT` against the shared instance. If you cannot install a mysql client, the per-app SQL can be run via `aws rds-data execute-statement` instead (see Step 2 note).

Authenticate AWS and confirm identity:

```bash
aws sts get-caller-identity
```

If this fails, configure the Pear AWS profile before continuing. Do not proceed with unpushed local-only changes.

---

## Step 1: Resolve the App and Check for the Shared Intern DB

1. Determine the app slug `<app>` (lowercase, `[a-z0-9-]`). Derive it from the app hostname (`<app>.intern.pearcommerce.com`) or the GitHub repo name. Confirm with the user if not obvious.
2. Derive the per-app resource names:
   - Database/user: `intern_<app>` with `-` replaced by `_` (MySQL identifiers use `_`).
   - Secret: `intern-app-<app>-db`.
3. Check whether the shared intern DB instance already exists:

```bash
aws rds describe-db-instances --region us-east-1 \
  --db-instance-identifier pear-intern-db \
  --query 'DBInstances[0].{Status:DBInstanceStatus,Endpoint:Endpoint.Address,Port:Endpoint.Port,Public:PubliclyAccessible,SGs:VpcSecurityGroups[*].VpcSecurityGroupId}' \
  --output json
```

4. If it exists and is `available`, skip to Step 2. If it does not exist, run Step 1.5 once to provision the shared infra. If it exists but is not `available`, wait for it to become available before continuing.

### Step 1.5: One-Time Shared Infra Provisioning

Only run this the first time any intern app needs a DB. Confirm the monthly cost with the user first (a `db.t4g.small` is roughly $15-25/mo plus storage).

**a. Security group** (default VPC, allows 3306 from Cloudflare + Lightsail):

```bash
DEFAULT_VPC=$(aws ec2 describe-vpcs --region us-east-1 \
  --filters Name=isDefault,Values=true \
  --query 'Vpcs[0].VpcId' --output text)

aws ec2 create-security-group --region us-east-1 \
  --group-name pear-intern-db \
  --description "Shared intern apps MySQL RDS" \
  --vpc-id "$DEFAULT_VPC" --query 'GroupId' --output text
```

**b. Allow 3306 from Cloudflare IPv4 ranges** (so Worker apps can reach the DB):

```bash
SG_ID=$(aws ec2 describe-security-groups --region us-east-1 \
  --group-names pear-intern-db --query 'SecurityGroups[0].GroupId' --output text)

for ip in $(curl -fsSL https://www.cloudflare.com/ips-v4); do
  aws ec2 authorize-security-group-ingress --region us-east-1 \
    --group-id "$SG_ID" --protocol tcp --port 3306 --cidr "$ip"
done
```

> Do not pass `--description` to `authorize-security-group-ingress` with the simple `--cidr` form; it is not accepted on current AWS CLI v2 and the call fails silently inside a loop. If you want rule descriptions for auditability, use the `--ip-permissions` form instead: `--ip-permissions "IpProtocol=tcp,FromPort=3306,ToPort=3306,IpRanges=[{CidrIp=$ip,Description=Cloudflare-egress}]"`.

**c. Allow 3306 from the Lightsail VPC CIDR** (so Lightsail apps can reach the DB). Lightsail peers to the default VPC; its VPC CIDR is stable per account/region:

```bash
# Enable Lightsail <-> default VPC peering if not already active (idempotent).
aws lightsail peer-vpc --region us-east-1 >/dev/null 2>&1 || true

# Lightsail's VPC CIDR for us-east-1 is 172.26.0.0/16. Confirm with:
#   aws ec2 describe-vpc-peering-connections --region us-east-1 \
#     --filters Name=status.code,Values=active \
#     --query 'VpcPeeringConnections[?AccepterVpcInfo.VpcId==`'"$DEFAULT_VPC"'`].RequesterVpcInfo.CidrBlock' --output text
aws ec2 authorize-security-group-ingress --region us-east-1 \
  --group-id "$SG_ID" --protocol tcp --port 3306 --cidr 172.26.0.0/16
```

> Refresh Cloudflare IPs periodically (they change rarely). Re-run step (b) on a schedule or when a Worker app cannot connect. Document this in the app's README.

**d. Admin secret** in Secrets Manager:

```bash
ADMIN_PASS=$(aws secretsmanager get-random-password --region us-east-1 \
  --exclude-characters "'\"\\@/; " --query 'RandomPassword' --output text)

aws secretsmanager create-secret --region us-east-1 \
  --name pear-intern-db-admin \
  --secret-string "$(jq -n --arg p "$ADMIN_PASS" '{engine:"mysql",host:"",port:3306,dbname:"",username:"admin",password:$p}')" \
  --query ARN --output text

unset ADMIN_PASS
```

**e. RDS instance** (MySQL 8, public, small, encrypted):

```bash
ADMIN_PASS=$(aws secretsmanager get-secret-value --region us-east-1 \
  --secret-id pear-intern-db-admin --query SecretString --output text | jq -r .password)

aws rds create-db-instance --region us-east-1 \
  --db-instance-identifier pear-intern-db \
  --engine mysql \
  --engine-version 8.0.36 \
  --db-instance-class db.t4g.small \
  --allocated-storage 20 \
  --storage-type gp3 \
  --storage-encrypted \
  --master-username admin \
  --master-user-password "$ADMIN_PASS" \
  --publicly-accessible \
  --vpc-security-group-ids "$SG_ID" \
  --backup-retention-period 7 \
  --no-multi-az \
  --query 'DBInstance.DBInstanceIdentifier' --output text

unset ADMIN_PASS
```

> Check `aws rds describe-db-engine-versions --engine mysql --query 'DBEngineVersions[*].EngineVersion' --output text | tr '\t' '\n' | grep '^8.0' | tail -1` for the latest 8.0.x if `8.0.36` is unavailable. Use `db.t4g.micro` only for ultra-low-traffic utilities; `db.t4g.small` is the shared-server default.

Wait for it to become available (10-20 min):

```bash
aws rds wait db-instance-available --region us-east-1 --db-instance-identifier pear-intern-db
```

Then write the real endpoint back into the admin secret's `host` field:

```bash
HOST=$(aws rds describe-db-instances --region us-east-1 \
  --db-instance-identifier pear-intern-db \
  --query 'DBInstances[0].Endpoint.Address' --output text)

aws secretsmanager update-secret --region us-east-1 \
  --secret-id pear-intern-db-admin \
  --secret-string "$(aws secretsmanager get-secret-value --region us-east-1 \
    --secret-id pear-intern-db-admin --query SecretString --output text \
    | jq --arg h "$HOST" '.host=$h')"
```

Record `pear-intern-db` endpoint and `pear-intern-db-admin` ARN for the summary.

---

## Step 2: Create the Per-App Database, User, and Grant

Connect to the shared instance as admin and create the app's isolated database and scoped user. Never use the admin credentials in the app.

```bash
set +x
ADMIN_PASS=$(aws secretsmanager get-secret-value --region us-east-1 \
  --secret-id pear-intern-db-admin --query SecretString --output text | jq -r .password)
HOST=$(aws secretsmanager get-secret-value --region us-east-1 \
  --secret-id pear-intern-db-admin --query SecretString --output text | jq -r .host)

APP_DB="intern_$(echo "$APP_SLUG" | tr - _)"
APP_USER="$APP_DB"
APP_PASS=$(aws secretsmanager get-random-password --region us-east-1 \
  --exclude-characters "'\"\\@/; " --query 'RandomPassword' --output text)

MYSQL_PWD="$ADMIN_PASS" mysql -h "$HOST" -u admin --ssl-mode=REQUIRED <<SQL
CREATE DATABASE IF NOT EXISTS \`$APP_DB\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS \`$APP_USER\`@'%' IDENTIFIED BY '$APP_PASS';
ALTER USER \`$APP_USER\`@'%' IDENTIFIED BY '$APP_PASS';
GRANT ALL PRIVILEGES ON \`$APP_DB\`.* TO \`$APP_USER\`@'%';
FLUSH PRIVILEGES;
SQL

unset ADMIN_PASS
```

> Keep `APP_PASS` in the shell only long enough to write the secret in Step 3, then `unset` it. If no `mysql` client is available, run the same SQL via `aws rds-data execute-statement` with the `--secret-arn` of `pear-intern-db-admin` and `--database mysql` (the `--database` flag selects the schema for the session; run `CREATE DATABASE` first, then subsequent statements with `--database "$APP_DB"`).

---

## Step 3: Write the Per-App Secrets Manager Secret

Write `intern-app-<app>-db` with the exact shape the dashboard API expects (`{engine, host, port, dbname, username, password}`). This is the secret the app's bootstrap helper will fetch.

```bash
SECRET_NAME="intern-app-${APP_SLUG}-db"

aws secretsmanager create-secret --region us-east-1 \
  --name "$SECRET_NAME" \
  --secret-string "$(jq -n \
    --arg engine "mysql" --arg host "$HOST" --arg port 3306 \
    --arg dbname "$APP_DB" --arg username "$APP_USER" --arg password "$APP_PASS" \
    '{engine:$engine,host:$host,port:$port,dbname:$dbname,username:$username,password:$password}')" \
  --query ARN --output text

unset APP_PASS
```

If the secret already exists (re-running for an existing app), use `update-secret` instead of `create-secret`, and rotate `APP_PASS` in Step 2 first.

---

## Step 4: Configure App Environment Variables

The app needs exactly one required env var to find the secret; everything else comes from the secret payload.

| Var | Required | Purpose |
|---|---|---|
| `DB_SECRET_ID` | yes | Secrets Manager secret id, e.g. `intern-app-<app>-db` |
| `AWS_REGION` / `AWS_DEFAULT_REGION` | no | Defaults to `us-east-1` |
| `MYSQL_HOST` | no | Overrides the secret's `host` (e.g. use the private endpoint for Lightsail apps) |
| `MYSQL_DATABASE` | no | Overrides the secret's `dbname` |
| `MYSQL_USER` / `MYSQL_PASSWORD` | no | Override the secret's credentials (rarely needed) |
| `DB_SSL` | no | `true` (default) or `false`. Leave on for the public endpoint. |
| `MYSQL_CONNECTION_LIMIT` | no | Pool size, default `10` |
| `MYSQL_CONNECT_TIMEOUT_MS` | no | Default `10000` |

**For Cloudflare Worker apps:** set `DB_SECRET_ID` as a Worker secret. The Worker also needs an IAM-style AWS credential pair with `secretsmanager:GetSecretValue` on the secret ARN — set those as Worker secrets too (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`). Create a scoped IAM user per app with a policy limited to its own secret ARN; do not reuse the operator's credentials.

**For Lightsail/Node apps:** set `DB_SECRET_ID` in the app's `.env` / systemd EnvironmentFile. The instance profile is not available on Lightsail, so either (a) create a scoped IAM user per app as above, or (b) fetch the secret at deploy time and write it to a root-readable env file. Option (a) is preferred.

**IAM policy for each app's scoped AWS credential** (least privilege):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"],
      "Resource": "arn:aws:secretsmanager:us-east-1:042357577846:intern-app-<app>-db-*"
    }
  ]
}
```

---

## Step 5: Bootstrap the Connection Helper in the App

Copy the runtime-appropriate helper into the app. The Node helper is the primary template and mirrors the dashboard API exactly.

**Node (primary):**

```bash
mkdir -p "$APP_DIR/scripts"
cp "$HOME/pear-ai-skills/skills/intern-app-db-access/templates/scripts/db-connect.mjs" "$APP_DIR/scripts/db-connect.mjs"
```

Add to `package.json`:

```json
{
  "dependencies": {
    "mysql2": "^3.14.0",
    "@aws-sdk/client-secrets-manager": "^3.1043.0"
  }
}
```

Use it:

```js
import { query, getPool } from "./scripts/db-connect.mjs";
const rows = await query("SELECT 1 AS ok");
```

**Python and Java:** see `references/connection-bootstrap.md` for `pymysql` + `boto3` and HikariCP + AWS SDK v2 equivalents that read the same secret shape.

Commit the helper and dependency changes to the app's GitHub repo and push. Do not leave the helper only on the local machine.

---

## Step 6: Verify the Connection

Run a real query through the helper from the app's runtime, using the app's own scoped credentials and secret:

```bash
# Node
cd "$APP_DIR" && DB_SECRET_ID="intern-app-$APP_SLUG-db" node -e '
  import("./scripts/db-connect.mjs").then(async ({ query }) => {
    const [rows] = await query("SELECT 1 AS ok");
    console.log(rows);
    process.exit(0);
  });
'
```

Expect `ok: 1`. If it fails:

| Symptom | Cause | Fix |
|---|---|---|
| `Could not read AWS secret` | IAM creds missing or no `GetSecretValue` on the ARN | Check the scoped IAM user/policy in Step 4 |
| `ETIMEDUP` / `ECONNREFUSED` | SG not allowing the source IP, or wrong host | Confirm the app's source IP is in `pear-intern-db` SG; confirm `host` in the secret |
| `Access denied for user` | Wrong user/password or user not granted on the DB | Re-run Step 2/3; confirm `GRANT` ran |
| `SSL connection required` | Client not using TLS | Leave `DB_SSL=true` (default) |

Also verify isolation: connect as the app user and confirm it **cannot** see another app's database:

```bash
MYSQL_PWD="$APP_PASS" mysql -h "$HOST" -u "$APP_USER" --ssl-mode=REQUIRED \
  -e "SHOW DATABASES;" | grep -v information_schema | grep -v performance_schema
```

Expect only `intern_<app>` (plus `information_schema`/`performance_schema`). If the app user can see other `intern_*` databases, the `GRANT` is wrong — fix it before finalizing.

---

## Step 7: Final Operator Summary

```
## DB Access Summary: <app>

**Shared intern DB:** pear-intern-db (<endpoint>) — provisioned | already existed
**App database:** intern_<app>
**App DB user:** intern_<app> (scoped to intern_<app> only)
**App secret:** arn:aws:secretsmanager:us-east-1:042357577846:intern-app-<app>-db-<suffix>
**Secret shape:** {engine, host, port, dbname, username, password} (matches dashboard API prod-db-10-2025)
**Connection helper:** scripts/db-connect.mjs (Node) | Python | Java — committed and pushed
**App env vars set:** DB_SECRET_ID, AWS_REGION, (AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY for Workers)
**TLS:** required (DB_SSL=true)
**Verification:** SELECT 1 returned ok=1; isolation check passed (app user sees only intern_<app>)

**Remaining manual steps:**
- [List anything that requires human console access or credentials you couldn't reach]
```

If the shared instance was newly provisioned, also note the approximate monthly cost and that Cloudflare IP ranges should be refreshed periodically.

---

## When Tools Aren't Available

If you lack a tool (no `mysql` client, no AWS CLI, no IAM console access for scoped users):
- Complete everything else you can.
- Use `aws rds-data execute-statement` instead of the `mysql` client for per-app SQL.
- In the Final Summary, list the blocked step under "Remaining manual steps" with exact instructions for a human to complete it.
- Do not skip the summary.

---

## Reference Files

- `templates/scripts/db-connect.mjs` — Node connection bootstrap (port of the dashboard API's mysqlCredentials.js + mysql.js)
- `references/connection-bootstrap.md` — Python (pymysql + boto3) and Java (HikariCP + AWS SDK v2) equivalents, plus the full env-var reference
