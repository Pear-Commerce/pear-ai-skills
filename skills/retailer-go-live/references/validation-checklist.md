# Validation Checklist

Validate each retailer after its store/zone import. Do not mark a retailer done until all steps pass.

## 1. JSP availability probe

Run a JSP on the sandbox that finds a known UPC for the retailer and calls the availability updater. The goal is to save at least one `UPCRetailerZipAvailability` row with status `AVAILABLE`.

Example JSP shape:

```jsp
<%@ page import="com.pear.entities.inventory.*" %>
<%@ page import="com.pear.itemurlupdater.UPCRetailerZipAvailabilityRecomputer" %>
<%@ page import="com.pear.itemurlupdater.fr.CarrefourAvailabilityUpdater" %>
<%@ page contentType="text/html;charset=UTF-8" language="java" %>
<%
    RetailPartner rp = RetailPartner.forEnumName("carrefourfr");
    UPC item = UPC.loadByUpc("<known-upc>");
    UPCRetailerZipAvailabilityRecomputer.getInstance(CarrefourAvailabilityUpdater.class)
        .recomputeAvailability(item, rp, "75001");
%>
```

If no UPC has a retailer item id yet, create a minimal `UPCRetailerData` row first or use the resolver via `$upc-resolution-code-changes` / `$retailer-production-integration`.

## 2. Retailer-list API

Call the public API endpoint for a UPC-only offer in the target country:

```bash
PEARS_TRUSTED_EDGE_VALUE="${PEAR_TRUSTED_EDGE_HEADER:-a1360351-32b2-4410-9c87-ec294e780c25}"
curl -fsS -H "x-pear-trusted-edge: ${PEARS_TRUSTED_EDGE_VALUE}" \
  "https://sandbox-peter-2026.us-east-1.elasticbeanstalk.com/v1/retailer-list/<offerId>?zip=75001&countryCode=FR"
```

Confirm the retailer appears in the list and the `pdpUrl` is non-null.

## 3. Browser click-through

Using `$browser` or `$chrome`, open the UPC-only offer landing page and click the retailer button. Verify the final redirect lands on the expected PDP. This is `$retailer-verify` territory; delegate to it if the user asks for deep PDP validation.

## 4. Logs check

Search VictoriaLogs for the retailer enum and the JSP run. Look for errors, proxy failures, or unexpected `INVALID`/`UNKNOWN` statuses.

## 5. Sanity checks

- [ ] At least one `UPCRetailerZipAvailability` row saved with `AVAILABLE`.
- [ ] Retailer appears in `/v1/retailer-list` for the test zip.
- [ ] PDP URL is reachable and matches the retailer's site.
- [ ] No errors in logs for the JSP run or availability job.
- [ ] Flags match the inventory template.

## Fail-fast conditions

If the availability probe fails, stop and diagnose before moving to the next retailer. Common causes:
- Missing `RetailPartner` row or wrong flags.
- Missing `Store` / `ZipRetailerZone` rows.
- Item id not yet resolved for the UPC.
- Proxy type blocked; use `$pear-proxy` to test alternatives.
