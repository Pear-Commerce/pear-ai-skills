#!/usr/bin/env bash
set -euo pipefail

INSTANCE_ID="${PRESENTON_TEST_INSTANCE_ID:-i-030ec83d92fe974e5}"

SCRIPT_B64="$(
  cat <<'SCRIPT' | base64 | tr -d '\n'
set -euo pipefail
sudo docker exec -i presenton bash -lc 'cd /app/servers/fastapi && /opt/venv/bin/python - <<"PY"
from types import SimpleNamespace
from utils.generation_contract import (
    build_generation_contract_state,
    validate_pptx_contract,
    validate_slide_json_contract,
)
import utils.generation_contract as generation_contract_module

request = SimpleNamespace(
    slides_markdown=[
        "### 1. Executive Answer\n\n"
        "Locked claim: Target led non-Walmart retailer visit rate at 7.1% on 2026-05-16.\n\n"
        "| Retailer | Visit Rate | Date |\n"
        "| --- | --- | --- |\n"
        "| Target | 7.1% | 2026-05-16 |"
    ],
    contract_mode="strict",
    generation_contract=SimpleNamespace(
        locked_text=[
            "Locked claim: Target led non-Walmart retailer visit rate at 7.1% on 2026-05-16."
        ],
        required_sections=[],
        forbidden_additions=[],
        evidence_tables=[],
        exact_terms=[],
        tables_are_evidence=True,
        require_tables=True,
        violation_policy="fail",
    ),
)
state = build_generation_contract_state(request)
slide_issues = validate_slide_json_contract(
    state,
    [
        {
            "title": "Executive Answer",
            "body": (
                "Locked claim: Target led non-Walmart retailer visit rate at 7.1% on 2026-05-16. "
                "Retailer X trailed Source Placeholder."
            ),
            "tableData": {
                "headers": ["Retailer", "Visit Rate", "Date"],
                "rows": [["Target", "7.1%", "2026-05-16"]],
            },
        }
    ],
)
assert any(issue.reason == "generic_placeholder_content" for issue in slide_issues), [
    issue.to_dict() for issue in slide_issues
]

generation_contract_module._extract_pptx = lambda _path: (
    "Executive Answer\n"
    "Locked claim: Target led non-Walmart retailer visit rate at 7.1% on 2026-05-16.\n"
    "Retailer\nVisit Rate\nDate\nTarget\n7.1%\n2026-05-16\nRetailer Gamma\nSource Placeholder",
    [],
)
pptx_issues = validate_pptx_contract(state, "/tmp/nonexistent.pptx")
assert any(issue.reason == "generic_placeholder_content" for issue in pptx_issues), [
    issue.to_dict() for issue in pptx_issues
]
print({
    "smoke": "placeholder_contract",
    "slide_reasons": [issue.reason for issue in slide_issues],
    "pptx_reasons": [issue.reason for issue in pptx_issues],
})
PY'
SCRIPT
)"

COMMAND_ID="$(
  aws ssm send-command \
    --instance-ids "${INSTANCE_ID}" \
    --document-name AWS-RunShellScript \
    --timeout-seconds 120 \
    --parameters "commands=[\"echo ${SCRIPT_B64} | base64 -d > /tmp/presenton-placeholder-contract-smoke.sh && bash /tmp/presenton-placeholder-contract-smoke.sh\"]" \
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
