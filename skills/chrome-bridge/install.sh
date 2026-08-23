#!/usr/bin/env bash
# chrome-bridge installer — pairs the opencode chrome-bridge skill with a
# real Chrome profile. Safe to re-run. Everything stays on this machine.
#
#   curl -fsSL https://raw.githubusercontent.com/Pear-Commerce/pear-ai-skills/main/skills/chrome-bridge/install.sh | bash
set -Eeuo pipefail

REPO="${PEAR_AI_SKILLS_REPO:-$HOME/pear-ai-skills}"
REPO_RAW="https://raw.githubusercontent.com/Pear-Commerce/pear-ai-skills/main"

say()  { printf '%s\n' "$*"; }
step() { printf '\n==> %s\n' "$*"; }

step "Syncing canonical skills repo"
if [ -d "$REPO/.git" ]; then
  git -C "$REPO" pull --ff-only
  "$REPO/scripts/install-all-skills.sh" --no-color
else
  # install-all-skills bootstraps git/gh if needed and clones the repo
  curl -fsSL "$REPO_RAW/scripts/install-all-skills.sh" | bash -s -- --bootstrap-tools --no-color
fi

BRIDGE="$REPO/skills/chrome-bridge/bridge"
[ -f "$BRIDGE/bin/chrome-bridge.js" ] || { say "chrome-bridge: runtime missing at $BRIDGE — repo sync failed?"; exit 1; }

step "Installing opencode plugin"
mkdir -p "${XDG_CONFIG_HOME:-$HOME/.config}/opencode/plugins"
cp "$BRIDGE/plugin/chrome-bridge.plugin.js" "${XDG_CONFIG_HOME:-$HOME/.config}/opencode/plugins/chrome-bridge.plugin.js"
say "  -> ${XDG_CONFIG_HOME:-$HOME/.config}/opencode/plugins/chrome-bridge.plugin.js"

command -v node >/dev/null 2>&1 || {
  say "chrome-bridge: 'node' not found — install Node 20+ first (needed for pairing + daemon mode)."
  exit 1
}

step "Pairing the Chrome extension"
if node "$BRIDGE/bin/chrome-bridge.js" pair; then
  :
else
  cat <<EOF

Extension not loaded yet. One-time Chrome step:
  1. Open chrome://extensions  (Developer mode ON)
  2. Load unpacked  ->  select: $BRIDGE/extension/
  3. Re-run:  node "$BRIDGE/bin/chrome-bridge.js" pair

EOF
  if [ "$(uname -s)" = "Darwin" ] && [ -t 0 ]; then
    printf 'Open chrome://extensions now? [Y/n] '
    read -r ans
    case "${ans:-Y}" in [Nn]*) ;; *) open "chrome://extensions" ;; esac
  fi
  exit 0
fi

step "Done"
cat <<EOF
The bridge is paired. Restart opencode so the plugin loads, then ask it to
"list my Chrome tabs" to verify. Health check any time:
  node "$BRIDGE/bin/chrome-bridge.js" health
EOF
