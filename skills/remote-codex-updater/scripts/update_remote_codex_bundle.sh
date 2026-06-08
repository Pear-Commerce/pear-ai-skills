#!/usr/bin/env bash
set -euo pipefail

EXPECTED_VERSION="${1:-}"
BRANCH="${REMOTE_CODEX_SKILLS_BRANCH:-main}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

SKILLS=(
  remote-codex-updater
  remote-codex-workers
  remote-codex-orchestrator
  remote-codex-worker-slot
  remote-codex-test-flow
)

if ! git clone --depth 1 --branch "$BRANCH" https://github.com/Pear-Commerce/pear-ai-skills.git "$TMP_DIR/pear-ai-skills" >/dev/null 2>&1; then
  gh repo clone Pear-Commerce/pear-ai-skills "$TMP_DIR/pear-ai-skills" >/dev/null
  git -C "$TMP_DIR/pear-ai-skills" checkout "$BRANCH" >/dev/null
fi

SOURCE="$TMP_DIR/pear-ai-skills/skills"
for skill in "${SKILLS[@]}"; do
  test -d "$SOURCE/$skill"
done

INSTALLED_VERSION="$(grep -m1 '^remote_codex_bundle_version:' "$SOURCE/remote-codex-updater/SKILL.md" | sed -E 's/.*"([^"]+)".*/\1/')"

for target in "${CODEX_HOME:-$HOME/.codex}/skills" "$HOME/.claude/skills"; do
  [ -d "$target" ] || continue
  for skill in "${SKILLS[@]}"; do
    rm -rf "$target/$skill"
    cp -R "$SOURCE/$skill" "$target/$skill"
  done
done

python3 - "$BRANCH" "$INSTALLED_VERSION" "$EXPECTED_VERSION" <<'PY'
import json
import sys

branch, installed, expected = sys.argv[1:]
print(json.dumps({
    "branch": branch,
    "installedBundleVersion": installed,
    "expectedBundleVersion": expected or None,
    "skillsUpdated": True,
    "automationRefreshRequired": bool(expected and expected != installed),
}, indent=2, sort_keys=True))
PY
