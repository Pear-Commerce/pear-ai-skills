#!/usr/bin/env bash
set -euo pipefail

INSTANCE_ID="${PRESENTON_TEST_INSTANCE_ID:-i-030ec83d92fe974e5}"

SCRIPT_B64="$(
  cat <<'SCRIPT' | base64 | tr -d '\n'
set -euo pipefail
echo "---service---"
sudo systemctl is-active presenton.service
echo "---inspect---"
sudo docker inspect presenton --format '{{.Config.Image}} {{json .Mounts}}'
echo "---data-files---"
sudo test -s /opt/presenton/app_data/fastapi.db
sudo test -s /opt/presenton/app_data/mem0/history.db
sudo test -s /opt/presenton/app_data/userConfig.json
sudo test -s /opt/presenton/app_data/userConfig.json.bak
echo ok-data-files
echo "---auth-reset-check---"
if sudo grep -E '^(RESET_AUTH|AUTH_OVERRIDE_FROM_ENV)=' /etc/presenton/presenton.env; then
  echo unsafe-auth-reset-vars-present >&2
  exit 1
fi
echo ok-no-reset-vars
echo "---row-counts---"
sudo docker exec -i presenton /opt/venv/bin/python - <<'PY'
import sqlite3
for db in ["/app_data/fastapi.db", "/app_data/mem0/history.db"]:
    con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    print(db)
    for (name,) in con.execute("select name from sqlite_master where type='table' order by name"):
        try:
            count = con.execute(f'select count(*) from "{name}"').fetchone()[0]
            print(f"{name}: {count}")
        except Exception as exc:
            print(f"{name}: skipped ({exc})")
    con.close()
PY
echo "---version---"
set -a
source /etc/presenton/presenton.env
set +a
curl -fsS -u "${AUTH_USERNAME}:${AUTH_PASSWORD}" http://127.0.0.1:5000/api/v1/version
SCRIPT
)"

COMMAND_ID="$(
  aws ssm send-command \
    --instance-ids "${INSTANCE_ID}" \
    --document-name AWS-RunShellScript \
    --timeout-seconds 180 \
    --parameters "commands=[\"echo ${SCRIPT_B64} | base64 -d > /tmp/presenton-status.sh && bash /tmp/presenton-status.sh\"]" \
    --query 'Command.CommandId' \
    --output text
)"

for _ in {1..30}; do
  RESULT="$(
    aws ssm get-command-invocation \
      --command-id "${COMMAND_ID}" \
      --instance-id "${INSTANCE_ID}" \
      --query '{Status:Status,Stdout:StandardOutputContent,Stderr:StandardErrorContent}' \
      --output json
  )"
  STATUS="$(printf '%s' "${RESULT}" | python3 -c 'import json,sys; print(json.load(sys.stdin)["Status"])')"
  if [[ "${STATUS}" != "InProgress" && "${STATUS}" != "Pending" && "${STATUS}" != "Delayed" ]]; then
    printf '%s\n' "${RESULT}"
    [[ "${STATUS}" == "Success" ]]
    exit
  fi
  sleep 2
done

printf 'Timed out waiting for SSM command %s\n' "${COMMAND_ID}" >&2
exit 124
