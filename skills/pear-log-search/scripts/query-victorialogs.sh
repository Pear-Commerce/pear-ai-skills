#!/usr/bin/env bash
set -euo pipefail

region="${AWS_REGION:-us-east-1}"
endpoint="query"
query=""
start=""
end="now"
limit="100"
field=""
facet_limit="30"

usage() {
  cat <<'EOF'
Query Pear's hot VictoriaLogs store through AWS SSM.

Usage:
  query-victorialogs.sh --query LOGSQL --start TIME [options]

Required:
  --query LOGSQL       LogsQL expression
  --start TIME         VictoriaLogs time, for example -30m or RFC3339

Options:
  --end TIME           End time (default: now)
  --endpoint NAME      query|hits|field_names|field_values|facets
  --limit N            Result/field limit (default: 100)
  --field NAME         Required by field_values
  --facet-limit N      Values per facet (default: 30)
  --region REGION      AWS region (default: us-east-1)
  -h, --help           Show help
EOF
}

while (($#)); do
  case "$1" in
    --query) query="${2-}"; shift 2 ;;
    --start) start="${2-}"; shift 2 ;;
    --end) end="${2-}"; shift 2 ;;
    --endpoint) endpoint="${2-}"; shift 2 ;;
    --limit) limit="${2-}"; shift 2 ;;
    --field) field="${2-}"; shift 2 ;;
    --facet-limit) facet_limit="${2-}"; shift 2 ;;
    --region) region="${2-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

[[ -n "$query" ]] || { echo "--query is required" >&2; exit 2; }
[[ -n "$start" ]] || { echo "--start is required; unbounded searches are refused" >&2; exit 2; }
[[ "$limit" =~ ^[1-9][0-9]*$ ]] || { echo "--limit must be a positive integer" >&2; exit 2; }
[[ "$facet_limit" =~ ^[1-9][0-9]*$ ]] || { echo "--facet-limit must be a positive integer" >&2; exit 2; }

case "$endpoint" in
  query|hits|field_names|field_values|facets) ;;
  *) echo "Unsupported endpoint: $endpoint" >&2; exit 2 ;;
esac
if [[ "$endpoint" == "field_values" && -z "$field" ]]; then
  echo "--field is required for field_values" >&2
  exit 2
fi

command -v aws >/dev/null || { echo "aws CLI is required" >&2; exit 1; }
command -v jq >/dev/null || { echo "jq is required" >&2; exit 1; }

instance_id="$({
  aws ec2 describe-instances \
    --region "$region" \
    --filters \
      Name=tag:app,Values=victorialogs-intern \
      Name=instance-state-name,Values=running \
    --query 'Reservations[].Instances[].InstanceId' \
    --output text
} | awk '{print $1}')"
[[ -n "$instance_id" && "$instance_id" != "None" ]] || {
  echo "No running victorialogs-intern instance found in $region" >&2
  exit 1
}

encode() { printf '%s' "$1" | base64 | tr -d '\n'; }
query_b64="$(encode "$query")"
start_b64="$(encode "$start")"
end_b64="$(encode "$end")"
field_b64="$(encode "$field")"

remote_command="set -eu; query=\$(printf %s '$query_b64' | base64 -d); start=\$(printf %s '$start_b64' | base64 -d); end=\$(printf %s '$end_b64' | base64 -d); field=\$(printf %s '$field_b64' | base64 -d); set -- -fsS -X POST http://127.0.0.1:9428/select/logsql/$endpoint --data-urlencode query=\"\$query\" --data-urlencode start=\"\$start\" --data-urlencode end=\"\$end\";"

case "$endpoint" in
  query)
    remote_command+=" set -- \"\$@\" --data-urlencode limit='$limit';"
    ;;
  hits)
    ;;
  field_names)
    remote_command+=" set -- \"\$@\" --data-urlencode limit='$limit' --data-urlencode ignore_pipes=1;"
    ;;
  field_values)
    remote_command+=" set -- \"\$@\" --data-urlencode field=\"\$field\" --data-urlencode limit='$limit' --data-urlencode ignore_pipes=1;"
    ;;
  facets)
    remote_command+=" set -- \"\$@\" --data-urlencode limit='$facet_limit' --data-urlencode ignore_pipes=1 --data-urlencode max_values_per_field=10000 --data-urlencode max_value_len=256 --data-urlencode keep_const_fields=1;"
    ;;
esac
remote_command+=" curl \"\$@\""

parameters_file="$(mktemp "${TMPDIR:-/tmp}/pear-log-search.XXXXXX.json")"
trap 'rm -f "$parameters_file"' EXIT
jq -nc --arg command "$remote_command" '{commands:[$command]}' > "$parameters_file"

command_id="$(aws ssm send-command \
  --region "$region" \
  --document-name AWS-RunShellScript \
  --instance-ids "$instance_id" \
  --comment 'Pear log search (read only)' \
  --parameters "file://$parameters_file" \
  --timeout-seconds 300 \
  --query 'Command.CommandId' \
  --output text)"

aws ssm wait command-executed \
  --region "$region" \
  --command-id "$command_id" \
  --instance-id "$instance_id" || true

invocation="$(aws ssm get-command-invocation \
  --region "$region" \
  --command-id "$command_id" \
  --instance-id "$instance_id" \
  --output json)"

status="$(jq -r '.Status' <<<"$invocation")"
jq -r '.StandardOutputContent' <<<"$invocation"
if [[ "$status" != "Success" ]]; then
  jq -r '.StandardErrorContent' <<<"$invocation" >&2
  echo "SSM query failed with status $status (command $command_id)" >&2
  exit 1
fi
