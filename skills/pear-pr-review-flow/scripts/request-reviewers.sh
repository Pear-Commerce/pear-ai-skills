#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  request-reviewers.sh --pr PR_NUMBER [--repo OWNER/REPO] [--reviewers login1,login2] [--copilot] [--remove-team TEAM_SLUG]

Adds named GitHub reviewers and/or Copilot to a pull request using the REST
review-request endpoint. Verifies the raw requested reviewers afterward.
USAGE
}

pr_number=""
repo=""
reviewers_csv=""
copilot=""
remove_team=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --pr)
      pr_number="$2"
      shift 2
      ;;
    --repo)
      repo="$2"
      shift 2
      ;;
    --reviewers)
      reviewers_csv="$2"
      shift 2
      ;;
    --copilot)
      copilot="1"
      shift
      ;;
    --remove-team)
      remove_team="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ -z "$repo" ]]; then
  repo="$(gh repo view --json nameWithOwner --jq .nameWithOwner)"
fi

if [[ -z "$pr_number" ]]; then
  pr_number="$(gh pr view --json number --jq .number)"
fi

if [[ -z "$pr_number" || -z "$repo" ]]; then
  echo "Could not resolve PR number or repo." >&2
  exit 2
fi

json_array() {
  python3 - "$1" <<'PY'
import json
import sys

items = [item.strip() for item in sys.argv[1].split(",") if item.strip()]
print(json.dumps(items))
PY
}

if [[ -n "$remove_team" ]]; then
  teams="$(json_array "$remove_team")"
  python3 - "$teams" <<'PY' | gh api -X DELETE "repos/$repo/pulls/$pr_number/requested_reviewers" --input - >/dev/null
import json
import sys

print(json.dumps({"reviewers": [], "team_reviewers": json.loads(sys.argv[1])}))
PY
fi

if [[ -n "$reviewers_csv" ]]; then
  reviewers="$(json_array "$reviewers_csv")"
  python3 - "$reviewers" <<'PY' | gh api -X POST "repos/$repo/pulls/$pr_number/requested_reviewers" --input - >/dev/null
import json
import sys

print(json.dumps({"reviewers": json.loads(sys.argv[1])}))
PY
fi

if [[ -n "$copilot" ]]; then
  printf '%s' '{"reviewers":["@copilot"]}' \
    | gh api -X POST "repos/$repo/pulls/$pr_number/requested_reviewers" --input - >/dev/null
fi

gh api "repos/$repo/pulls/$pr_number/requested_reviewers" \
  --jq '{users:[.users[]?.login], teams:[.teams[]?.slug]}'
