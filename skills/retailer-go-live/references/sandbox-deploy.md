# Sandbox Deploy for Retailer Go-Live

Target environment for this work: **sandbox-peter-2026** (`e-yd6x8dm33f` in AWS Elastic Beanstalk, CNAME `sandbox-peter-2026.us-east-1.elasticbeanstalk.com`). The existing deployment can be overwritten; this is the user's sandbox.

## Deploy the branch

From `api.pearcommerce.com` repo root, run the deploy workflow against the branch containing the retailer code:

```bash
./devops/trigger-deploy.sh -e sandbox-peter-2026 -b <branch-name>
```

If `trigger-deploy.sh` requires GitHub Actions credentials, make sure `gh` is authenticated (`gh auth status`). The workflow is defined in `.github/workflows/deployment.yml`.

Alternatively, use the in-place deploy helper on a running EB instance when the user wants a quick hot-deploy to an already-running sandbox (not a clean launch):

```bash
./devops/deploy-in-place.sh -e sandbox-peter-2026 -c <commit-ish>
```

## Wipe existing store/zone data (optional)

The user said "whatever is currently there does not need to be so we can deploy there and run the retailer store importing one by one." This means the sandbox can be wiped/redeployed freely, but it does not require a DB wipe by default. If old zones are causing confusion, run a JSP to clear `Store` rows for the retailer before re-importing:

```jsp
<%
    RetailPartner rp = RetailPartner.forEnumName("<enum>");
    for (Store s : new Store().loadWhere("retailerId = ?", rp.id)) {
        s.live = 0;
        s.save();
    }
%>
```

This should only be done in the sandbox with user confirmation.

## Health check after deploy

After EB reports the deployment as healthy, verify the app is up:

```bash
curl -fsS https://sandbox-peter-2026.us-east-1.elasticbeanstalk.com/healthcheck
```

(Replace with the actual healthcheck endpoint if different.)

## Job runner

Some availability updates are driven by the Quartz worker environment. Confirm the worker environment is healthy in the same EB application. If store imports are triggered by `RetailerStoreLocationsSyncJob`, ensure the worker environment is also running the new code.
