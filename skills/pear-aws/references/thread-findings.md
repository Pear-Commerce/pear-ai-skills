# Thread Findings Behind Pear AWS Skill

This reference records distilled guidance from Codex sessions scanned from 2026-04-27 through 2026-05-27. Keep `SKILL.md` authoritative; use this file only when updating the skill or checking why guidance exists.

## Repeated Patterns

- AWS CLI and Session Manager plugin are installed in Homebrew paths on Alex's Mac. Several successful runs used `PATH=/opt/homebrew/bin:/usr/local/bin:$PATH`.
- Before live AWS work, successful threads checked `command -v aws jq session-manager-plugin copilot` and `aws sts get-caller-identity`.
- Copilot CLI was sometimes absent. Useful fallback was direct EB/EC2/SSM/CloudWatch AWS CLI reads.
- SSM is the live EC2 shell/upload path: `devops/logs.sh`, `devops/ec2-exec.sh`, `devops/jsp.sh`, `devops/jspx`, and deploy helpers use it instead of SSH/PEM files. Database traffic (`db.sh`, `dump-db.sh`, `db-tunnel.sh`) and JSP browser previews use split-tunnel AWS Client VPN to private addresses; `jsp.sh` still uses SSM for upload/compile execution.
- Interactive SSM sessions often need a PTY. Non-interactive diagnosis was more reliable with `aws ssm send-command`, `wait command-executed`, and `get-command-invocation`/`list-command-invocations`.
- Outage threads improved after moving from "first instance log stream" to bounded SSM snapshots across all running EB instances.
- DB and Snowflake credentials came from AWS Secrets Manager. Threads used `prod-db-10-2025` for MySQL and `snowflake-2025-12-01` for Snowflake, then parsed JSON with `jq` without printing values.
- Java integration tests sometimes needed `MYSQL_CREDENTIALS_SECRET`, `MYSQL_HOST`, `MYSQL_HOST_READ`, `MYSQL_HOST_WRITE`, and `SNOWFLAKE_CREDENTIALS_SECRET`.
- AppConfig work centered on `AWSAppConfigUtil`, defaults in code, and CloudTrail `CreateHostedConfigurationVersion` events. `WebContent/appconfig-deltas.jsp` is the concrete audit example.
- `devops/environments.json` and `devops/env.mjs` are the environment metadata source for EB names, CNAMEs, Copilot envs, Datadog services, and domains.
- JSP work should load `$pear-prod-jsp`; that skill has the current preview/Run button and S3 archive safety rules.
- Offers production/staging static assets must not be repaired by manual local S3/R2/CloudFront/Cloudflare uploads.
- The AWS Cost Tracker repo demonstrated the local AWS SDK pattern: default credential chain or `AWS_PROFILE`, Cost Explorer in `us-east-1`, CloudTrail across several regions, S3 report cache, and shared Pear Google OAuth.
- New internal dashboards should use `auth-v2.intern.pearcommerce.com` with `AUTH_REQUIRED`, `AUTH_SHARED_SECRET`, `SESSION_SECRET`, `GOOGLE_HOSTED_DOMAIN=pearcommerce.com`, and a callback under the app domain. Existing dashboards already on `auth.intern.pearcommerce.com` stay on that legacy lane until deliberately migrated.

## Useful Local Artifacts

- `/Users/alexwyler/api.pearcommerce.com/devops/logs.sh`
- `/Users/alexwyler/api.pearcommerce.com/devops/ec2-exec.sh`
- `/Users/alexwyler/api.pearcommerce.com/devops/db.sh`
- `/Users/alexwyler/api.pearcommerce.com/devops/jsp.sh`
- `/Users/alexwyler/api.pearcommerce.com/devops/environments.json`
- `/Users/alexwyler/api.pearcommerce.com/WebContent/appconfig-deltas.jsp`
- `/Users/alexwyler/api.pearcommerce.com/src/com/pear/aws/AWSAppConfigUtil.java`
- `/Users/alexwyler/aws-cost-tracker/README.md`
- `/Users/alexwyler/aws-cost-tracker/src/awsClients.js`
- `/Users/alexwyler/aws-cost-tracker/src/auth.js`
- `/Users/alexwyler/aws-cost-tracker/src/config.js`
