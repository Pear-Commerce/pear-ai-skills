#!/usr/bin/env bash
set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
APPLICATION_ID="${PEAR_APPCONFIG_APPLICATION_ID:-k54elgs}"
PROFILE_ID="${PEAR_APPCONFIG_PROFILE_ID:-dohcrfo}"
ENVIRONMENT_ID="${PEAR_APPCONFIG_ENVIRONMENT_ID:-zxye02b}"
STRATEGY_ID="${PEAR_APPCONFIG_DEPLOYMENT_STRATEGY_ID:-id0iigs}"

namespace=""
key=""
json_value=""
value_type=""
label=""
description=""
publish=false

usage() {
  cat <<'EOF'
Usage:
  appconfig-set-value.sh --namespace NAME --key KEY --json-value JSON [options]

Options:
  --type boolean|number|string  Required only when adding a new key.
  --label LABEL                Hosted-version label; a UTC suffix is added.
  --description TEXT           Change description.
  --publish                    Create and deploy the version. Omit for dry-run.

Examples:
  appconfig-set-value.sh --namespace availabilities --key process-recently-requested-urza --json-value 'true'
  appconfig-set-value.sh --namespace instacart-prewarm-pool --key max-workers --json-value '300' --publish
  appconfig-set-value.sh --namespace example --key greeting --json-value '"hello"' --type string --publish
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --namespace) namespace="${2:-}"; shift 2 ;;
    --key) key="${2:-}"; shift 2 ;;
    --json-value) json_value="${2:-}"; shift 2 ;;
    --type) value_type="${2:-}"; shift 2 ;;
    --label) label="${2:-}"; shift 2 ;;
    --description) description="${2:-}"; shift 2 ;;
    --publish) publish=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

if [[ -z "$namespace" || -z "$key" || -z "$json_value" ]]; then
  usage >&2
  exit 2
fi

if [[ -n "$value_type" && "$value_type" != "boolean" && "$value_type" != "number" && "$value_type" != "string" ]]; then
  echo "--type must be boolean, number, or string" >&2
  exit 2
fi

command -v aws >/dev/null
command -v jq >/dev/null
jq -e -n --argjson value "$json_value" '$value != null' >/dev/null

actual_type="$(jq -r -n --argjson value "$json_value" '$value | type')"
if [[ -n "$value_type" && "$actual_type" != "$value_type" ]]; then
  echo "JSON value type is $actual_type but --type is $value_type" >&2
  exit 2
fi

task_tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/pear-appconfig-set.XXXXXX")"
base_file="$task_tmp_dir/base.json"
updated_file="$task_tmp_dir/updated.json"
verify_file="$task_tmp_dir/verify.json"
created_file="$task_tmp_dir/created.json"
trap 'rm -f -- "$base_file" "$updated_file" "$verify_file" "$created_file"; rmdir "$task_tmp_dir" 2>/dev/null || true' EXIT

latest_version="$(aws appconfig list-hosted-configuration-versions \
  --region "$REGION" \
  --application-id "$APPLICATION_ID" \
  --configuration-profile-id "$PROFILE_ID" \
  --max-results 50 \
  --query 'max_by(Items,&VersionNumber).VersionNumber' \
  --output text)"

if [[ -z "$latest_version" || "$latest_version" == "None" ]]; then
  echo "Unable to resolve latest hosted configuration version" >&2
  exit 1
fi

aws appconfig get-hosted-configuration-version \
  --region "$REGION" \
  --application-id "$APPLICATION_ID" \
  --configuration-profile-id "$PROFILE_ID" \
  --version-number "$latest_version" \
  "$base_file" >/dev/null

deployed_version="$(aws appconfig list-deployments \
  --region "$REGION" \
  --application-id "$APPLICATION_ID" \
  --environment-id "$ENVIRONMENT_ID" \
  --max-results 50 \
  --query 'max_by(Items[?State==`COMPLETE` && ConfigurationName==`Base (All)`],&DeploymentNumber).ConfigurationVersion' \
  --output text)"

if [[ -z "$deployed_version" || "$deployed_version" == "None" ]]; then
  echo "Unable to resolve the latest completed Base (All) deployment" >&2
  exit 1
fi

if [[ "$latest_version" != "$deployed_version" ]]; then
  echo "Latest hosted version $latest_version is not the deployed version $deployed_version." >&2
  echo "Inspect the unpublished hosted version before basing a new production change on it." >&2
  exit 1
fi

jq -e --arg namespace "$namespace" '.values[$namespace] != null and .flags[$namespace] != null' "$base_file" >/dev/null || {
  echo "Unknown AppConfig namespace: $namespace" >&2
  exit 1
}

key_exists="$(jq -r --arg namespace "$namespace" --arg key "$key" '.values[$namespace] | has($key)' "$base_file")"
old_value="$(jq -c --arg namespace "$namespace" --arg key "$key" '.values[$namespace][$key]' "$base_file")"
schema_type="$(jq -r --arg namespace "$namespace" --arg key "$key" '.flags[$namespace].attributes[$key].constraints.type // empty' "$base_file")"

if [[ "$key_exists" != "true" && -z "$value_type" ]]; then
  echo "Key $namespace/$key is new; pass --type boolean|number|string" >&2
  exit 1
fi

if [[ "$key_exists" == "true" && -n "$schema_type" && "$actual_type" != "$schema_type" ]]; then
  echo "JSON value type is $actual_type but existing schema type is $schema_type" >&2
  exit 1
fi

if [[ "$key_exists" != "true" ]]; then
  attribute_count="$(jq -r --arg namespace "$namespace" '.flags[$namespace].attributes // {} | length' "$base_file")"
  if (( attribute_count >= 25 )); then
    echo "Namespace $namespace already has $attribute_count attributes; AppConfig permits at most 25" >&2
    exit 1
  fi
fi

jq \
  --arg namespace "$namespace" \
  --arg key "$key" \
  --arg value_type "$value_type" \
  --argjson value "$json_value" '
    .values[$namespace][$key] = $value
    | if (.flags[$namespace].attributes[$key] == null and $value_type != "") then
        .flags[$namespace].attributes[$key] = {
          constraints: {required: false, type: $value_type}
        }
      else . end
  ' "$base_file" > "$updated_file"

jq -e . "$updated_file" >/dev/null
new_value="$(jq -c --arg namespace "$namespace" --arg key "$key" '.values[$namespace][$key]' "$updated_file")"

echo "AppConfig target: application=$APPLICATION_ID profile=$PROFILE_ID environment=$ENVIRONMENT_ID region=$REGION"
echo "Base hosted version: $latest_version"
echo "Current deployed version: $deployed_version"
echo "Value: $namespace/$key: $old_value -> $new_value"

if [[ "$old_value" == "$new_value" ]]; then
  echo "No change; nothing to publish."
  exit 0
fi

if [[ "$publish" != "true" ]]; then
  echo "Dry-run only. Re-run with --publish after explicit approval."
  exit 0
fi

timestamp="$(date -u +%Y%m%d%H%M%S)"
if [[ -z "$label" ]]; then
  label="codex-$namespace-$key"
fi
label="$(printf '%s' "$label" | tr -cs 'A-Za-z0-9_-' '-' | sed 's/^-*//; s/-*$//')"
if [[ -z "$label" ]]; then
  label="codex-change"
fi
if [[ "$label" == AWS* ]]; then
  label="pear-$label"
fi
label="${label:0:44}-$timestamp"
if [[ -z "$description" ]]; then
  description="Set $namespace/$key via pear-engineering-workflow"
fi

# AWS CLI v2 streams the new version's content back, so this call needs an outfile
# positional like the get-hosted-configuration-version calls above; without it the CLI
# exits with "the following arguments are required: outfile" and nothing is published.
new_version="$(aws appconfig create-hosted-configuration-version \
  --region "$REGION" \
  --application-id "$APPLICATION_ID" \
  --configuration-profile-id "$PROFILE_ID" \
  --content-type application/json \
  --content "fileb://$updated_file" \
  --latest-version-number "$latest_version" \
  --version-label "$label" \
  --description "$description" \
  --query VersionNumber \
  --output text \
  "$created_file")"

deployment_number="$(aws appconfig start-deployment \
  --region "$REGION" \
  --application-id "$APPLICATION_ID" \
  --environment-id "$ENVIRONMENT_ID" \
  --configuration-profile-id "$PROFILE_ID" \
  --configuration-version "$new_version" \
  --deployment-strategy-id "$STRATEGY_ID" \
  --description "$description" \
  --query DeploymentNumber \
  --output text)"

for _ in $(seq 1 30); do
  state="$(aws appconfig get-deployment \
    --region "$REGION" \
    --application-id "$APPLICATION_ID" \
    --environment-id "$ENVIRONMENT_ID" \
    --deployment-number "$deployment_number" \
    --query State \
    --output text)"
  if [[ "$state" == "COMPLETE" || "$state" == "ROLLED_BACK" || "$state" == "REVERTED" ]]; then
    break
  fi
  sleep 1
done

aws appconfig get-hosted-configuration-version \
  --region "$REGION" \
  --application-id "$APPLICATION_ID" \
  --configuration-profile-id "$PROFILE_ID" \
  --version-number "$new_version" \
  "$verify_file" >/dev/null

verified_value="$(jq -c --arg namespace "$namespace" --arg key "$key" '.values[$namespace][$key]' "$verify_file")"
deployment_summary="$(aws appconfig get-deployment \
  --region "$REGION" \
  --application-id "$APPLICATION_ID" \
  --environment-id "$ENVIRONMENT_ID" \
  --deployment-number "$deployment_number" \
  --query '{State:State,PercentageComplete:PercentageComplete,ConfigurationVersion:ConfigurationVersion}' \
  --output json)"

echo "Created hosted version: $new_version"
echo "Started deployment: $deployment_number"
echo "Verified hosted value: $verified_value"
echo "Deployment: $deployment_summary"

if [[ "$verified_value" != "$new_value" ]]; then
  echo "Hosted-value verification failed" >&2
  exit 1
fi
