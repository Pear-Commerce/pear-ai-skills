---
name: step9-infra-ops
description: Step9 browser-agent infrastructure operations — capture sessions, restart MCP, check health, connect to dev DB, run gold tests. Use when working on Step9 deterministic codegen pipeline, capturing retailer sessions, debugging "fetch failed" errors, or running gold standard tests.
---

# Step9 Infrastructure Operations

Operational knowledge for the Step9 browser-agent capture + deterministic codegen pipeline.
This skill exists so you don't rediscover infrastructure setup from scratch every session.

## Architecture (3 boxes)

```
Local Mac (you) → fp.pearcommerce.com:8080 (EC2 mitmproxy) → dev-database.pearcommerce.com (MySQL)
                       ↑
              Mac mini (Chrome + MCP + SOCKS5)
```

1. **Chrome on Mac mini** browses retailer sites through fp proxy
2. **fp proxy** (EC2) captures HTTPS traffic → writes to `HttpRequest` table in dev DB
3. **Java pipeline** (Step9SolverHarness) reads `HttpRequest` rows from dev DB, runs deterministic codegen

## Connection Details (MEMORIZE THESE)

### Dev Database
- Host: `dev-database.pearcommerce.com`
- User: `opora`
- Password: `lI5_Qd53IKmIX9Hr-Axk`
- Database: `pear`
- Table: `HttpRequest` (PearSimpleORM creates lazily)
- **Resets every night at 2am CT** — all captures wiped. Must recapture or restore dump after reset.

### Mac mini (Chrome + MCP)
- SSH: `sshpass -p 'n69Dwjmgg' ssh -o PreferredAuthentications=password -o PubkeyAuthentication=no eric@192.168.7.237`
- Control host: `https://macmini1.pearcommerce.com`
- MCP port: 8787
- MCP ngrok URL: `https://gibson-clearstoried-brattily.ngrok-free.dev/mcp` (dynamic, changes on restart)
- MCP auth: `Basic bWNwOmMyOTY4OWI2MWFmODQ1Mzg5ZTIxNWJmNzNmMDhkYTQ5`
- SOCKS5: port 1080 on Mac mini, exposed via ngrok TCP tunnel

### fp Proxy (EC2)
- Host: `fp.pearcommerce.com`
- Port: 8080
- Password: `pear_commerce`
- EC2 instance: `i-07d9de8dc9a11dfdc`
- **Use PLAIN proxy identity** (just the capture ID as username, NO BrightData `~base64` suffix)
- Proxy URL format: `http://CAPTURE_ID:pear_commerce@fp.pearcommerce.com:8080`

### Agent Service
- URL: `https://step9-browser-agent.pearcommerce.com`
- API key: `76EAC145-11B2-48BB-94A8-4684154D1008`
- Health: `curl -s https://step9-browser-agent.pearcommerce.com/health`

### Spring Boot (local)
- Start: `MYSQL_HOST=dev-database.pearcommerce.com MYSQL_HOST_WRITE=dev-database.pearcommerce.com MYSQL_USER=opora MYSQL_PASS='lI5_Qd53IKmIX9Hr-Axk' ./devops/springboot-tomcat-local.sh start`
- Port: 8080
- Work directory: `/Users/eric/api.pearcommerce.com-step9-rearch/` (branch `codex/step9-browser-agent-rearch`)

## Health Checkers (3 watchdogs, all running)

### Combined health check
```bash
bash /Users/eric/pear-step9-browser-agent/scripts/read-health.sh summary
```

### 1. EC2 fp proxy checker (cron 1min)
- Script: `/opt/pear-health/fp-proxy-checker.sh` on EC2
- Checks: MySQL connectivity, proxy port 8080, TLS client
- Auto-heal: restarts docker container if proxy down
- Status: `s3://assets.pearcommerce.com/step9-health/ec2-fp-proxy.json`

### 2. Mac mini checker (launchd 60s KeepAlive)
- Script: `~/pear-health/macmini-checker.sh` on Mac mini
- Checks: MCP port 8787, SOCKS5 port 1080
- Auto-heal: restarts MCP via `run-chrome-devtools-mcp.sh`, restarts SOCKS5
- Status: `~/pear-health/status.json` on Mac mini

### 3. Agent service checker (cron 1min)
- Script: `/opt/pear-health/agent-service-checker.sh` on EC2
- Checks: agent /health endpoint, ECS task running
- Auto-heal: forces ECS redeploy if health endpoint down
- Status: `s3://assets.pearcommerce.com/step9-health/agent-service.json`

## Known Failure Modes and Fixes

### "fetch failed" (AGENT_SERVICE_UNAVAILABLE)
**Cause:** MCP process on Mac mini crashed or Chrome stopped.
**Fix:** Restart MCP on Mac mini:
```bash
sshpass -p 'n69Dwjmgg' ssh -o PreferredAuthentications=password -o PubkeyAuthentication=no eric@192.168.7.237 "
kill -9 \$(lsof -ti :8787) 2>/dev/null
pkill -9 -f 'npm exec.*chrome-devtools' 2>/dev/null
pkill -9 -f 'npm exec.*mcp-proxy' 2>/dev/null
sleep 3
cd /Users/eric/macchromerunner/host-suite/scripts
nohup bash run-chrome-devtools-mcp.sh > /tmp/mcp-restart.log 2>&1 &
sleep 10
lsof -i :8787 | head -3
"
```
The ngrok tunnel usually survives — it's the MCP process behind it that crashes.

### "sessionA is empty"
**Cause:** Session IDs in `context.json` don't exist in dev DB.
**Fix:** Either the sessions were wiped by 2am reset, or context.json has stale IDs.
Check `retailer-contexts/session_db_check.tsv` for correct session IDs.
Verify sessions exist: `mysql -h dev-database.pearcommerce.com -u opora -plI5_Qd53IKmIX9Hr-Axk pear -N -e "SELECT COUNT(*) FROM HttpRequest WHERE user='SESSION_ID';"`

### Both sessions have same store ID
**Cause:** MCP browser didn't actually switch stores. Store locator responses show stores but the active store cookie never changed.
**Fix:** Recapture sessions. The agent must complete a full store switch (autocomplete ZIP, select store, click activation CTA). Use the two-phase navigation fix (v60-amd64 agent service) which handles Akamai challenges.

### Akamai challenge blocks navigation
**Cause:** Walgreens shows Akamai turnstile for 20-55 seconds. Agent snapshots challenge page, can't find store selector, returns failure.
**Fix:** Two-phase navigation (already deployed in v60-amd64): NAVIGATE phase waits up to 75s for challenge to resolve, then STORE_SWITCH phase does the actual store selection.

### "single-response-batch contract failure: no matching response"
**Cause:** Store resolver can't find target addresses in session response bodies. Either the addresses in context.json don't match the actual captured stores, or the sessions are invalid (no store switch happened).
**Fix:** Verify the target addresses in context.json match the actual store addresses in the session's store locator responses. Query the dev DB to check what addresses are in the `locator/v1/stores/search` responses.

## Session Capture Flow

### Prerequisites
1. Check health: `bash /Users/eric/pear-step9-browser-agent/scripts/read-health.sh summary`
2. If MCP down: restart (see "fetch failed" fix above)
3. If Chrome stopped: start Chrome with proxy

### Capture one session
```bash
CONTROL_HOST="https://macmini1.pearcommerce.com"
AGENT_URL="https://step9-browser-agent.pearcommerce.com"
API_KEY="76EAC145-11B2-48BB-94A8-4684154D1008"
CAPTURE_ID="mcprun2-RETAILER-session-X-$(date +%s)"
PROXY_URL="http://${CAPTURE_ID}:pear_commerce@fp.pearcommerce.com:8080"

# Start Chrome with proxy (NO BrightData encoding)
curl -s -X POST -H "Content-Type: application/json" -d '{"forceKill":true,"deleteProfile":true}' "$CONTROL_HOST/mcp_chrome/stop" > /dev/null 2>&1
sleep 3
curl -s -X POST -H "Content-Type: application/json" \
  -d "{\"debugPort\":9222,\"oneTimeProfile\":true,\"forceRestart\":true,\"restartMcp\":true,\"proxyUrl\":\"$PROXY_URL\",\"extraArgs\":[\"--ignore-certificate-errors\",\"--allow-insecure-localhost\"]}" \
  "$CONTROL_HOST/mcp_chrome/start"

# Wait for Chrome + MCP
for i in $(seq 1 30); do
  sleep 5
  STATUS=$(curl -s "$CONTROL_HOST/mcp_chrome/status" | python3 -c "import json,sys; print(json.load(sys.stdin).get('status','unknown'))" 2>/dev/null)
  if [ "$STATUS" = "running" ]; then sleep 15; break; fi
done

# Create + activate job
JOB_ID=$(curl -s -X POST "$AGENT_URL/v1/browser-capture-jobs" \
  -H "Content-Type: application/json" -H "X-API-Key: $API_KEY" \
  -d "{\"retailerUrl\":\"https://www.RETAILER.com\",\"targetZipCode\":\"ZIP\",\"searchQuery\":\"QUERY\",\"storeCount\":3,\"productCount\":2,\"timeoutSeconds\":1200,\"captureId\":\"$CAPTURE_ID\",\"storeChoice\":\"first\",\"runLabel\":\"LABEL\"}" \
  | python3 -c "import json,sys; print(json.load(sys.stdin).get('id','FAILED'))" 2>/dev/null)
curl -s -X POST "$AGENT_URL/v1/browser-capture-jobs/$JOB_ID/activate" -H "X-API-Key: $API_KEY" -d '{}' > /dev/null 2>&1

# Poll until complete
for i in $(seq 1 180); do
  sleep 10
  STATUS=$(curl -s "$AGENT_URL/v1/browser-capture-jobs/$JOB_ID" -H "X-API-Key: $API_KEY" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('status','unknown'))" 2>/dev/null)
  if [ "$STATUS" != "running" ] && [ "$STATUS" != "in_progress" ]; then echo "Done: $STATUS"; break; fi
done
```

### Capture TWO sessions (for gold test)
The gold test needs two sessions (aUser, bUser) with DIFFERENT selected stores.
Run the capture flow TWICE with different capture IDs. Each capture selects the first store.
The key requirement: the two sessions must have different active store IDs in their cookies.

### Verify sessions are valid
```bash
# Check row counts
mysql -h dev-database.pearcommerce.com -u opora -plI5_Qd53IKmIX9Hr-Axk pear -N -e "
SELECT user, COUNT(*) as cnt FROM HttpRequest WHERE user='CAPTURE_ID' GROUP BY user;"

# Check store locator responses have target addresses
mysql -h dev-database.pearcommerce.com -u opora -plI5_Qd53IKmIX9Hr-Axk pear -N -e "
SELECT url, CASE WHEN responseBody LIKE '%TARGET_ADDRESS%' THEN 'YES' ELSE 'NO' END
FROM HttpRequest WHERE user='CAPTURE_ID' AND url LIKE '%locator%store%search%' LIMIT 5;"

# Check active store ID in product search requests
mysql -h dev-database.pearcommerce.com -u opora -plI5_Qd53IKmIX9Hr-Axk pear -N -e "
SELECT url, SUBSTRING(requestBody, 1, 200) FROM HttpRequest 
WHERE user='CAPTURE_ID' AND url LIKE '%retailsearch%' LIMIT 5;"
```

### Dump sessions (before 2am reset)
```bash
# Run from EC2 (can connect to dev DB)
mysqldump --no-tablespaces --max-allowed-packet=1G -h dev-database.pearcommerce.com -u opora --password='lI5_Qd53IKmIX9Hr-Axk' pear HttpRequest --where="user LIKE 'mcprun%RETAILER%'" > /tmp/httprequest-RETAILER-$(date +%Y%m%d_%H%M%S).sql
```

## Running the Gold Test

### Direct harness invocation (single retailer)
```bash
cd /Users/eric/api.pearcommerce.com-step9-rearch
TS=$(date +%Y%m%d-%H%M%S)
LOG="/tmp/step9-harness-RETAILER-${TS}.log"

MYSQL_HOST=dev-database.pearcommerce.com \
MYSQL_HOST_WRITE=dev-database.pearcommerce.com \
MYSQL_USER=opora \
MYSQL_PASS='lI5_Qd53IKmIX9Hr-Axk' \
PEAR_BOOTSTRAPPED_XMX=12288m \
JAVA_TOOL_OPTIONS='-Dpear.step9.liveMode=full -Dpear.step9.phase9.mode=fast_only -Dpear.step9.stopAfterPhase9=true -Dpear.step9.skipPhase95=true -Dpear.step9.chromeProbe.preChainRequiredRequestAttempts=40' \
./devops/springboot-tomcat-local.sh bootstrapped com.pear.codegen.Step9SolverHarness \
  --session-a-user="SESSION_A_ID" \
  --session-b-user="SESSION_B_ID" \
  --context-dimension=store \
  --context-spec-path=retailer-contexts/RETAILER/context.json \
  --stop-after-phase9 \
  --phase9-response-model=off \
  --input-param="KEY=VALUE" \
  > "$LOG" 2>&1 < /dev/null &
```

### Gold standard script (all retailers)
```bash
cd /Users/eric/api.pearcommerce.com-step9-rearch
MYSQL_HOST=dev-database.pearcommerce.com MYSQL_HOST_WRITE=dev-database.pearcommerce.com MYSQL_USER=opora MYSQL_PASS='lI5_Qd53IKmIX9Hr-Axk' ./devops/step9_gold_standard.sh run
```
Note: `STEP9_GOLD_STANDARD_EXCLUDE_RETAILERS` is a simple CSV filter, NOT "all except" syntax. To run one retailer, list all others to exclude, or use direct harness invocation above.

## context.json Format
```json
{
  "version": 1,
  "dimension": "store",
  "sessions": {
    "aUser": "SESSION_A_CAPTURE_ID",
    "bUser": "SESSION_B_CAPTURE_ID"
  },
  "inputs": {
    "storeAAddress": "ADDRESS_FROM_SESSION_A_STORE_LOCATOR",
    "storeBAddress": "ADDRESS_FROM_SESSION_B_STORE_LOCATOR",
    "storeCAddress": "THIRD_STORE_ADDRESS"
  },
  "inputParams": {
    "userAddress": "...", "city": "...", "state": "...", "zip": "...",
    "latitude": "...", "longitude": "...", "brand": "...", "query": "...",
    "itemId1": "...", "itemId2": "..."
  },
  "validation": { "type": "llm", "expression": "...", "group": 1 }
}
```
**CRITICAL:** The store addresses in `inputs` must match the actual store addresses found in the session's store locator API responses. Query the dev DB to find them. Do NOT guess or use addresses from a different capture.

## Retailer Config (batch-capture.sh)
```
target|https://www.target.com|60619|shampoo
walmart|https://www.walmart.com|10001|pepsi
walgreens|https://www.walgreens.com|60601|vitamins
cvs|https://www.cvs.com|10001|pepsi
kroger|https://www.kroger.com|45202|pepsi
safeway|https://www.safeway.com|94103|pepsi
bestbuy|https://www.bestbuy.com|10017|laptop
dollargeneral|https://www.dollargeneral.com|60606|pepsi
dollartree|https://www.dollartree.com|30303|pepsi
petsmart|https://www.petsmart.com|10001|dog food
hollywoodfeed|https://www.hollywoodfeed.com|38117|dog food
meijer|https://www.meijer.com|60601|pepsi
publix|https://www.publix.com|32801|pepsi
wegmans|https://www.wegmans.com|10001|pepsi
riteaid|https://www.riteaid.com|10001|pepsi
sprouts|https://www.sprouts.com|94103|pepsi
petco|https://www.petco.com|10001|dog food
homedepot|https://www.homedepot.com|10001|drill
lowes|https://www.lowes.com|10001|drill
kohls|https://www.kohls.com|10001|shoes
```

## DO NOT (common mistakes)

1. **DO NOT use BrightData `~base64` encoding in proxy username** — use plain capture ID only. BrightData causes 407/ip_forbidden errors.
2. **DO NOT wipe local MySQL and expect sessions to be there** — sessions are in the DEV DATABASE, not local MySQL.
3. **DO NOT use `STEP9_GOLD_STANDARD_EXCLUDE_RETAILERS="all,except,walgreens"`** — this is NOT "all except" syntax. It's a literal CSV filter.
4. **DO NOT guess store addresses in context.json** — query the dev DB to find the actual addresses in the session's store locator responses.
5. **DO NOT forget to restart MCP before capturing** — "fetch failed" almost always means MCP crashed. Restart it first.
6. **DO NOT assume sessions are valid just because they're in the DB** — verify the store switch actually happened by checking that the two sessions have different active store IDs.
7. **DO NOT forget the 2am CT dev DB reset** — sessions are wiped nightly. Dump before reset, restore after.
