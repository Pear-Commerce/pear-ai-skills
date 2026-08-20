---
name: pear-aws
description: Pear-specific AWS infrastructure, tooling, credentials, SSM, OAuth, AppConfig, Elastic Beanstalk, S3/CloudFront, Secrets Manager, and AWS CLI guidance. Use when Codex needs to inspect, debug, deploy, or explain anything in Pear AWS; run AWS CLI commands; check production/test logs or health; use SSM Session Manager; fetch AWS Secrets Manager credentials; work with AppConfig; investigate AWS cost/CloudTrail; or modify Pear AWS-backed tooling.
---

# Pear AWS

## Start Here

Prefer Pear's repo helpers over raw AWS commands when they exist. From the api.pearcommerce.com repo root, every agent-facing helper is self-describing via `-h`/`--help` (prints usage and exits 0 before any AWS calls; unknown flags are rejected with usage):

```bash
PATH=/opt/homebrew/bin:/usr/local/bin:$PATH command -v aws jq session-manager-plugin copilot || true
PATH=/opt/homebrew/bin:/usr/local/bin:$PATH aws sts get-caller-identity --output json
devops/logs.sh --help
devops/ec2-exec.sh --help
devops/db.sh --help
devops/jsp.sh --help
./devops/env.mjs CNAME PROD
```

Exception: in `db.sh` and `dump-db.sh`, `-h` is the database-host flag (kept for backwards compatibility) — use `--help` there. Read script source only when you need internals beyond the documented flags.

Use `PATH=/opt/homebrew/bin:/usr/local/bin:$PATH` when `aws` or `session-manager-plugin` is not found from Codex. Homebrew installs the AWS CLI and Session Manager plugin there on Alex's machine.

Do not print secret values. It is okay to print secret key names or identity metadata. Use `set +x` around secrets, parse with `jq`, pass DB passwords through `MYSQL_PWD` or base64 inside helper scripts, and remove temp files.

## Tooling Map

- `devops/logs.sh -e PROD|TEST|dashboard|jobs|upc-resolution|availabilities`: live logs. Uses AppRunner for the availabilities env, otherwise EB EC2 over SSM.
- `devops/ec2-exec.sh -e ENV script.sh`: upload and run a script on EB instances through SSM. Add `--single` when only one instance should run it. Automation must add `--non-interactive`, which uses Run Command, prints captured remote stdout/stderr, and propagates the remote failure; omit it only for intentional interactive shell sessions.
- `devops/ec2-shell.sh` / `devops/shell.sh`: interactive shell wrappers over SSM. Use a TTY.
- `devops/db.sh`: direct private DB helper. It opens split-tunnel AWS Client VPN, resolves the current private RDS/RDS Proxy target through VPC DNS, fetches `prod-db-10-2025` from Secrets Manager, connects with TLS, and closes the VPN when MySQL exits. Use `--dev`/`--analytics`, `--prod`, or `--read`; normal SQL quoting is preserved because there is no SSM/eval hop.
- `devops/dump-db.sh`: dumps selected remote tables through VPN-aware `db.sh` and imports them into local MySQL; it no longer uses an EC2 helper or temporary S3 object.
- `devops/db-tunnel.sh --dev|--prod`: compatibility localhost relay over Client VPN plus `socat`; it no longer uses an SSM bastion.
- `devops/vpn.sh`: keeps the split-tunnel VPN open until Ctrl-C for local applications that need continuous private VPC access.
- `devops/ip.sh`: prints private instance IPs by default. `--public` is an explicit inventory-only compatibility view.
- `devops/jsp.sh`: uploads/compiles through SSM, opens Client VPN, prints a private instance-IP URL on port 8080, and remains open until Ctrl-C. Also load `$pear-prod-jsp` for the detailed safety and browser pattern.
- `devops/jspx`: retained-JSP compatibility runner using SSM upload/execution, not public-IP SSH/rsync.
- `devops/env.mjs` and `devops/environments.json`: source of truth for env aliases, EB CNAMEs, Copilot env names, Datadog services, and domains.

If the Copilot CLI is not installed, do not stall. Use EB, EC2, SSM, CloudWatch Logs, or `aws elasticbeanstalk` APIs directly for read-only diagnosis, and mention that Copilot-specific actions need the CLI.

## SSM Patterns

Session Manager is the default EC2 shell/upload path. Private database and JSP-browser traffic use AWS Client VPN alongside IAM-authenticated AWS operations; the old SSH/PEM and home-IP allowlist paths are not developer access paths.

Use the plugin check before interactive helpers:

```bash
PATH=/opt/homebrew/bin:/usr/local/bin:$PATH command -v session-manager-plugin aws jq
```

Run interactive helpers with a TTY. Without a TTY, `devops/logs.sh`, interactive `devops/db.sh` MySQL sessions, persistent `devops/jsp.sh` VPN sessions, and intentional `aws ssm start-session` shells may close with `EOF` or hang without useful output. `jsp.sh` and `jspx` execute their remote helper through non-interactive Run Command and must print its captured stdout/stderr; do not route them back through `start-session`. The first `db.sh`, `jsp.sh`, or `vpn.sh` invocation may require the user to run `./devops/setup-client-vpn.sh` once in their own terminal; do not bypass its guarded sudo helper or fall back to public access.

For reliable non-interactive fleet diagnostics, prefer `send-command`, then wait/list invocations:

```bash
cmd_id=$(aws ssm send-command \
  --region us-east-1 \
  --document-name AWS-RunShellScript \
  --instance-ids i-... \
  --comment 'codex read-only diagnosis' \
  --parameters commands='["date -u","hostname","sudo docker ps --format \"{{.ID}} {{.Names}}\""]' \
  --query 'Command.CommandId' \
  --output text)
aws ssm wait command-executed --region us-east-1 --command-id "$cmd_id" --instance-id i-...
aws ssm get-command-invocation --region us-east-1 --command-id "$cmd_id" --instance-id i-... --output json
```

For multi-instance outages, do not rely on the first log stream. Resolve all running EB instances and run a bounded SSM snapshot across the fleet.

## Credentials

Verify identity first:

```bash
aws sts get-caller-identity --output json
```

Use AWS Secrets Manager for shared service credentials. For MySQL/Aurora from a workstation, the sanctioned path is `devops/db.sh` from the api repo: it opens split-tunnel AWS Client VPN, pulls `prod-db-10-2025`-style credentials from Secrets Manager, resolves the target through VPC DNS, and connects with RDS-CA-verified TLS. Targets: `--prod` (database.pearcommerce.com), `--dev`/`--analytics` (dev-database.pearcommerce.com), `--read` (Aurora prod reader), `--maria` (pear-mariadb-6). Note `analytics-database.pearcommerce.com:3306` is still TCP-reachable publicly, but `db.sh` deliberately refuses non-VPC resolutions for RDS hosts — use the helper rather than a direct mysql connection unless you are already inside the VPC. Snowflake CLI credentials come from the same pattern (`snowflake-2025-12-01` secret; see the `$snowflake-jdbc` skill). The raw secret-fetch shape, for in-VPC or scripted use:

```bash
set +x
DB_SECRET=$(aws secretsmanager get-secret-value --secret-id prod-db-10-2025 --query SecretString --output text)
DB_USER=$(printf '%s' "$DB_SECRET" | jq -r '.username')
DB_PASS=$(printf '%s' "$DB_SECRET" | jq -r '.password')
MYSQL_PWD="$DB_PASS" mysql -A --default-character-set=utf8 -h analytics-database.pearcommerce.com -u "$DB_USER" pear -e 'SELECT 1'
unset MYSQL_PWD DB_SECRET DB_USER DB_PASS
```

Common secret names seen in Pear threads are `prod-db-10-2025`, `snowflake-2025-12-01`, and `cloudflare-credentials`. Never paste `SecretString`, access keys, OAuth client secrets, or tokens into chat, files, JSP source, or logs.

For Java tests that need live-like credentials, existing threads used environment variables like:

```bash
MYSQL_CREDENTIALS_SECRET=prod-db-10-2025 \
MYSQL_HOST=analytics-database.pearcommerce.com \
MYSQL_HOST_READ=analytics-database.pearcommerce.com \
MYSQL_HOST_WRITE=analytics-database.pearcommerce.com \
SNOWFLAKE_CREDENTIALS_SECRET=snowflake-2025-12-01 \
./gradlew test --tests 'com.pear.SomeTest' -PnoLint --console=plain
```

Use this only when the test genuinely needs integration credentials. Prefer local/unit tests for ordinary code changes.

## AppConfig

Pear code uses `com.pear.aws.AWSAppConfigUtil` heavily. Before changing behavior that depends on flags, search the exact namespace/key and defaults:

```bash
rg -n 'AWSAppConfigUtil|getBooleanNow|getIntegerNow|getStringNow|getEnumNow' src test WebContent -S
sed -n '1,260p' src/com/pear/aws/AWSAppConfigUtil.java
```

For AppConfig audit/history work, inspect `WebContent/appconfig-deltas.jsp`. The known audit path uses CloudTrail `CreateHostedConfigurationVersion` events against the Pear AppConfig application/profile constants rather than guessing table names.

## Logs And Outages

For an outage or "site is down" request:

1. Verify AWS identity and helper availability.
2. Check endpoint behavior with curl/browser.
3. Check EB environment health/events:

```bash
aws elasticbeanstalk describe-environments --environment-names pear-commerce-production --region us-east-1
aws elasticbeanstalk describe-events --environment-name pear-commerce-production --region us-east-1 --max-records 20
```

4. Use `devops/logs.sh -e ENV` for streaming when a single stream is enough.
5. Use SSM `send-command` snapshots across all running instances for fleet counts, container state, recent errors, OOMs, health check failures, or repeated stack traces.

## RDS And Performance Insights

For DB wait, load, latency, or connection spikes, use Performance Insights plus a bounded live process snapshot instead of guessing from the graph alone. Pull top wait events and SQL fingerprints for the alert window, then compare the same fingerprints against a pre-spike window before calling something a spike.

When the database is reached through RDS Proxy, be careful with PI host dimensions: `db.host` may identify RDS Proxy ENI private IPs, not the app instance or service that caused the load. Prefer service/version tags embedded in Pear SQL comments when they are present, especially:

- `ddps='<service>'`: Datadog service such as `production`, `availability_aws`, `list-scraper`, `dashboard`, or `jobs`.
- `dde='<env>'`: Datadog environment.
- `ddpv='<version>'`: deployed app version or git SHA for correlating with deploy history.

Useful read-only snapshots:

```sql
SHOW FULL PROCESSLIST;

SELECT SUBSTRING_INDEX(SUBSTRING_INDEX(INFO, "ddps='", -1), "'", 1) service,
       SUBSTRING_INDEX(SUBSTRING_INDEX(INFO, "dde='", -1), "'", 1) env,
       SUBSTRING_INDEX(SUBSTRING_INDEX(INFO, "ddpv='", -1), "'", 1) version,
       COALESCE(STATE, '') state,
       COUNT(*) cnt,
       MAX(TIME) max_time
FROM information_schema.PROCESSLIST
WHERE COMMAND <> 'Sleep' AND INFO IS NOT NULL
GROUP BY service, env, version, state
ORDER BY cnt DESC, max_time DESC;
```

If live SQL comments are missing from `PROCESSLIST`, use PI SQL fingerprints, app logs, EB/Copilot deploy versions, and GitHub workflow timing together. Do not attribute a DB spike to a code path solely because it is top-ranked during the incident; check whether that fingerprint actually increased relative to the baseline.

## S3, CloudFront, And Deploy Safety

Pear uses S3 for dev/test data, archived JSPs, static assets, EB Dockerrun bundles, and some internal app/report caches. Common patterns:

- CI downloads `s3://github-data-files/dev-data.sql`.
- `devops/jsp.sh` archives source under `s3://assets.pearcommerce.com/jsp-log/`.
- EB build uploads Dockerrun bundles before `create-application-version`.

Do not repair or deploy `offers.pearcommerce.com` production or staging static assets by manually pushing local workstation files to S3/R2/CloudFront/Cloudflare. Do not use `aws s3 cp`, `aws s3 sync`, `s3api put-object`, R2 writes, or direct Cloudflare uploads for Offers production/staging emergency fixes. Fix source, PR, CI, or the intended deployment path instead. Narrow data/report uploads and JSP/tool artifacts are okay when scoped and approved.

## OAuth And Intern Apps

For internal AWS-backed dashboards, reuse Pear's shared Google OAuth service instead of inventing auth:

```bash
AUTH_REQUIRED=true
AUTH_BASE_URL=https://auth-v2.intern.pearcommerce.com
AUTH_CALLBACK_URL=https://<app>.intern.pearcommerce.com/auth/google/callback
GOOGLE_HOSTED_DOMAIN=pearcommerce.com
AUTH_SHARED_SECRET=<raw SecretString from intern-app-hosting-auth-v2-shared-secret in us-east-1>
SESSION_SECRET=<secret from env/secret manager>
```

Existing apps already on `auth.intern.pearcommerce.com` stay on that legacy auth lane until a deliberate app migration. The AWS Cost Tracker app at `/Users/alexwyler/aws-cost-tracker` is the reference for AWS SDK credential profiles, Cost Explorer, CloudTrail, S3 report cache, and shared OAuth. For hosting, DNS, TLS, CloudFront, Lightsail, and auth env changes, also load `$intern-app-hosting`.

## Cost And CloudTrail

Use `/Users/alexwyler/aws-cost-tracker` as the local reference implementation:

- AWS SDK v3 clients use default provider chain unless a profile is selected.
- `AWS_PROFILE` and `AWS_REGION` are the main local controls.
- Cost Explorer is always `us-east-1`.
- CloudTrail lookup should cover `us-east-1,us-east-2,us-west-2,us-west-1` unless the task narrows it.
- Include reproducible proof in PR notes for hosting, auth, cache, AWS, GitHub, or Datadog changes.

Read `references/thread-findings.md` only when updating this skill or when you need the thread-derived evidence behind the guidance.
