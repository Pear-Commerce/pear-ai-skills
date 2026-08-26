#!/usr/bin/env bash
# aws-auth-probe.sh — one-shot AWS identity gate for agent sessions.
# Verifies a usable identity and, on failure, prints the fix based on the
# actual failure signature instead of guessing. Never prints secret values.
#
# Exit codes:
#   0   identity works (or was fixed non-interactively)
#   2   fixable non-interactively -> rerun the intended command
#   3   needs `aws sso login` (interactive/device flow)
#   4   unknown failure -> surface the error for the user
set -uo pipefail

PROFILE="${AWS_PROFILE:-pear-sso}"
PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

quiet() { "$@" >/dev/null 2>&1; }

# 1. Fast path: identity already works.
if aws sts get-caller-identity --profile "$PROFILE" --output json 2>/tmp/aws-auth.err; then
  echo "AWS identity OK ($PROFILE):"
  aws sts get-caller-identity --profile "$PROFILE" \
    --query '[UserId,Account,Arn]' --output text
  exit 0
fi

# 2. Diagnose where credentials are actually coming from.
echo "Identity check failed. Current credential sources (see 'Type' column):"
aws configure list --profile "$PROFILE" 2>/dev/null | sed -n '1,6p'

# 3. Stale static keys in the environment shadow the SSO profile.
#    `aws sso login` will NOT fix this; AWS checks env vars before the profile.
if env | grep -qE '^AWS_ACCESS_KEY_ID=|^AWS_SECRET_ACCESS_KEY='; then
  echo ">>> Stale AWS_* env vars detected. They override $PROFILE."
  echo "    Run: unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN"
  echo "    (also remove any hardcoded exports from ~/.bash_profile / ~/.zshrc)"
  unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN
  if quiet aws sts get-caller-identity --profile "$PROFILE"; then
    echo ">>> Identity works after clearing env vars; no logout/login needed."
    exit 2
  fi
fi

# 4. Actual SSO expiry (or no session at all).
if grep -qiE 'expired|expire|sso|unauthorized|not authorized|token' /tmp/aws-auth.err; then
  echo ">>> SSO session is expired or missing for $PROFILE."
  echo "    Run: aws sso login --profile $PROFILE   (or --no-browser for device flow)"
  exit 3
fi

# 5. Anything else: show the raw error rather than looping.
echo ">>> Unrecognized AWS failure:"
sed 's/^/    /' /tmp/aws-auth.err
exit 4
