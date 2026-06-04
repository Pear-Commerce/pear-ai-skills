#!/usr/bin/env bash
set -euo pipefail

INSTANCE_ID="${PRESENTON_TEST_INSTANCE_ID:-i-030ec83d92fe974e5}"

SCRIPT_B64="$(
  cat <<'SCRIPT' | base64 | tr -d '\n'
set -euo pipefail
sudo docker exec -i presenton bash -lc 'cd /app/servers/fastapi && /opt/venv/bin/python - <<"PY"
from types import SimpleNamespace
from utils.generation_contract import build_generation_contract_state

request = SimpleNamespace(
    slides_markdown=[
        "### 1. Executive Answer\n\n"
        "Question: What changed between 2026-02-15 and 2026-05-16?\n"
        "Selected period: February 15 - May 16, 2026\n"
        "Visit rate improved to 7.1%."
    ],
    contract_mode="strict",
    generation_contract=SimpleNamespace(
        locked_text=[],
        required_sections=[],
        forbidden_additions=[],
        evidence_tables=[],
        exact_terms=[],
        tables_are_evidence=False,
        require_tables=False,
        violation_policy="fail",
    ),
)
state = build_generation_contract_state(request)
assert "2026-02-15" not in state.exact_terms, state.exact_terms
assert "2026-05-16" not in state.exact_terms, state.exact_terms
assert "Selected period: February 15 - May 16, 2026" in state.exact_terms, state.exact_terms
print({"smoke": "date_contract", "exact_terms": state.exact_terms})
PY'
SCRIPT
)"

COMMAND_ID="$(
  aws ssm send-command \
    --instance-ids "${INSTANCE_ID}" \
    --document-name AWS-RunShellScript \
    --timeout-seconds 120 \
    --parameters "commands=[\"echo ${SCRIPT_B64} | base64 -d > /tmp/presenton-date-contract-smoke.sh && bash /tmp/presenton-date-contract-smoke.sh\"]" \
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
