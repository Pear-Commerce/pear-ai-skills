# Production Cutover

After the retailer is validated in the sandbox, deploy the same branch to production and rerun the import/validation steps.

## Deploy to production

```bash
./devops/trigger-deploy.sh -e production -b <branch-name>
```

(Adjust the exact production environment alias per `devops/environments.json`.)

## Rerun store/zone import

Run the same JSP or data migration on production. If the retailer is large, prefer the job runner (`RetailerStoreLocationsSyncJob`) over a single-request JSP to avoid timeout. Coordinate with the user before running large imports on production.

## Flip flags

Ensure `RetailPartner` is live and flags match the inventory template. The `*DataImports.java` migration should already do this, but verify after production deploy:

```jsp
<%
    RetailPartner rp = RetailPartner.forEnumName("<enum>");
    rp.live = true;
    rp.itemAvailabilityDependsOnZip = <true|false>;
    rp.locationAgnosticShipToHome = <true|false>;
    rp.save();
%>
```

## Final validation

Repeat the validation checklist from [validation-checklist.md](validation-checklist.md) against production. Use the production API host and offers domain, not the sandbox.

## Rollback

If a production validation fails after the import, the fastest rollback is:
1. Set the retailer's `live` flag to `false` in production.
2. Mark the retailer status back to `zones-imported` in the checklist.
3. Fix the issue in the branch, redeploy to sandbox, and re-validate.

Do not leave a retailer live with broken availability or PDP links.
