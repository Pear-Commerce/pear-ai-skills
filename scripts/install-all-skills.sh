#!/usr/bin/env bash
set -Eeuo pipefail

REPO_URL="${PEAR_AI_SKILLS_REPO_URL:-https://github.com/Pear-Commerce/pear-ai-skills.git}"
REPO_DIR="${PEAR_AI_SKILLS_REPO:-$HOME/pear-ai-skills}"
BRANCH="${PEAR_AI_SKILLS_BRANCH:-main}"
CODEX_SKILLS_DIR="${CODEX_SKILLS_DIR:-${CODEX_HOME:-$HOME/.codex}/skills}"
CLAUDE_SKILLS_DIR="${CLAUDE_SKILLS_DIR:-${CLAUDE_HOME:-$HOME/.claude}/skills}"
INSTALL_CODEX=1
INSTALL_CLAUDE=1
COLOR_MODE="${COLOR:-auto}"
BOOTSTRAP_TOOLS="${PEAR_AI_SKILLS_BOOTSTRAP_TOOLS:-0}"
RETIRED_SKILLS="sstore-store-extractor pear-upc-resolution-graph-code-changes pear-upc-resolution-verification"

usage() {
  cat <<EOF
Pear AI Skills installer

Usage:
  install-all-skills.sh [options]

Options:
  --repo PATH       Checkout/update the canonical repo at PATH
  --branch NAME     Checkout/update this branch (default: main)
  --codex-only      Import only to the Codex-compatible skill target
  --claude-only     Import only to the Claude Desktop skill target
  --bootstrap-tools Install missing local basics where possible
                   (macOS: Homebrew if needed, then Git and GitHub CLI)
  --no-color        Disable colored output
  -h, --help        Show this help

Environment:
  PEAR_AI_SKILLS_REPO       Repo checkout path (default: \$HOME/pear-ai-skills)
  PEAR_AI_SKILLS_REPO_URL   Repo URL (default: $REPO_URL)
  PEAR_AI_SKILLS_BRANCH     Branch to use (default: main)
  CODEX_HOME                Codex home directory (default: \$HOME/.codex)
  CODEX_SKILLS_DIR          Exact Codex-compatible skills directory
  CLAUDE_HOME               Claude home directory (default: \$HOME/.claude)
  CLAUDE_SKILLS_DIR         Exact Claude Desktop skills directory
  PEAR_AI_SKILLS_BOOTSTRAP_TOOLS=1
                            Install missing local basics before importing
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --repo)
      [ "${2:-}" ] || { echo "Missing value for --repo" >&2; exit 2; }
      REPO_DIR="$2"
      shift 2
      ;;
    --branch)
      [ "${2:-}" ] || { echo "Missing value for --branch" >&2; exit 2; }
      BRANCH="$2"
      shift 2
      ;;
    --codex-only)
      INSTALL_CODEX=1
      INSTALL_CLAUDE=0
      shift
      ;;
    --claude-only)
      INSTALL_CODEX=0
      INSTALL_CLAUDE=1
      shift
      ;;
    --bootstrap-tools)
      BOOTSTRAP_TOOLS=1
      shift
      ;;
    --no-color)
      COLOR_MODE="never"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

case "$BOOTSTRAP_TOOLS" in
  1|true|TRUE|yes|YES|on|ON) BOOTSTRAP_TOOLS=1 ;;
  *) BOOTSTRAP_TOOLS=0 ;;
esac

if [ "$INSTALL_CODEX" -eq 0 ] && [ "$INSTALL_CLAUDE" -eq 0 ]; then
  echo "Nothing to install. Pick at least one target." >&2
  exit 2
fi

if [ "$COLOR_MODE" = "never" ] || [ -n "${NO_COLOR:-}" ] || [ ! -t 1 ] || [ "${TERM:-}" = "dumb" ]; then
  BOLD=""
  DIM=""
  BLUE=""
  GREEN=""
  YELLOW=""
  RED=""
  RESET=""
else
  BOLD="$(printf '\033[1m')"
  DIM="$(printf '\033[2m')"
  BLUE="$(printf '\033[34m')"
  GREEN="$(printf '\033[32m')"
  YELLOW="$(printf '\033[33m')"
  RED="$(printf '\033[31m')"
  RESET="$(printf '\033[0m')"
fi

say() {
  printf '%b\n' "$*"
}

step() {
  printf '\n%b%s%b\n' "$BOLD" "$1" "$RESET"
}

info() {
  printf '  %b-%b %s\n' "$BLUE" "$RESET" "$*"
}

ok() {
  printf '  %b[ok]%b %s\n' "$GREEN" "$RESET" "$*"
}

warn() {
  printf '  %b[warn]%b %s\n' "$YELLOW" "$RESET" "$*" >&2
}

fail() {
  printf '  %b[error]%b %s\n' "$RED" "$RESET" "$*" >&2
  exit 1
}

have() {
  command -v "$1" >/dev/null 2>&1
}

tool_available() {
  case "$1" in
    git|gh)
      command -v "$1" >/dev/null 2>&1 && "$1" --version >/dev/null 2>&1
      ;;
    *)
      command -v "$1" >/dev/null 2>&1
      ;;
  esac
}

activate_homebrew() {
  if have brew; then
    return 0
  fi
  if [ -x /opt/homebrew/bin/brew ]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
  elif [ -x /usr/local/bin/brew ]; then
    eval "$(/usr/local/bin/brew shellenv)"
  fi
  have brew
}

install_homebrew() {
  activate_homebrew && return 0

  [ "$(uname -s)" = "Darwin" ] || return 1
  have curl || return 1

  info "Homebrew is missing. Installing Homebrew so Git and GitHub CLI can be installed."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  activate_homebrew
}

install_package() {
  command_name="$1"
  brew_formula="$2"
  apt_package="$3"
  label="$4"

  if tool_available "$command_name"; then
    ok "$label is available"
    return 0
  fi

  if [ "$BOOTSTRAP_TOOLS" -ne 1 ]; then
    return 1
  fi

  if install_homebrew; then
    info "Installing $label with Homebrew"
    brew install "$brew_formula"
    tool_available "$command_name"
    return $?
  fi

  if have apt-get; then
    info "Installing $label with apt"
    sudo apt-get update
    sudo apt-get install -y "$apt_package"
    tool_available "$command_name"
    return $?
  fi

  return 1
}

prepare_local_tools() {
  step "0. Prepare local tools"

  if install_package git git git "Git"; then
    :
  else
    warn "Git is not available. I will use a GitHub archive snapshot for this import."
    warn "Install Git later and rerun this script to get a normal updatable checkout."
  fi

  if install_package gh gh gh "GitHub CLI"; then
    :
  else
    warn "GitHub CLI is not available. Skill import can continue, but creating or pushing repos will need it later."
  fi

  if have curl; then
    ok "curl is available"
  else
    fail "curl is required to download Pear skills. Install curl and rerun this script."
  fi

  if have tar; then
    ok "tar is available"
  else
    fail "tar is required for the no-git fallback. Install tar and rerun this script."
  fi
}

repo_remote_looks_right() {
  case "$1" in
    *Pear-Commerce/pear-ai-skills*|*Pear-Commerce/pear-ai-skills.git*) return 0 ;;
    *) return 1 ;;
  esac
}

repo_is_clean() {
  git -C "$REPO_DIR" diff --quiet --ignore-submodules -- &&
    git -C "$REPO_DIR" diff --cached --quiet --ignore-submodules --
}

checkout_with_git() {
  if [ -d "$REPO_DIR/.git" ]; then
    info "Found existing checkout at $REPO_DIR"
    remote="$(git -C "$REPO_DIR" remote get-url origin 2>/dev/null || true)"
    if [ -n "$remote" ] && ! repo_remote_looks_right "$remote"; then
      fail "$REPO_DIR exists, but its origin is '$remote'. Move it or set PEAR_AI_SKILLS_REPO to a different path."
    fi

    if repo_is_clean; then
      info "Updating $BRANCH from origin"
      git -C "$REPO_DIR" fetch --prune origin "$BRANCH"
      if git -C "$REPO_DIR" show-ref --verify --quiet "refs/heads/$BRANCH"; then
        git -C "$REPO_DIR" checkout "$BRANCH" >/dev/null
      else
        git -C "$REPO_DIR" checkout -B "$BRANCH" "origin/$BRANCH" >/dev/null
      fi
      git -C "$REPO_DIR" pull --ff-only origin "$BRANCH"
    else
      warn "$REPO_DIR has local changes, so I will not pull or switch branches."
      warn "Importing skills from the current local checkout instead."
    fi
  elif [ -d "$REPO_DIR" ] && [ -f "$REPO_DIR/.pear-ai-skills-snapshot" ]; then
    backup_dir="$REPO_DIR.snapshot-backup-$(date +%Y%m%d%H%M%S)"
    warn "$REPO_DIR is an archive snapshot from an earlier no-git install."
    warn "Moving it to $backup_dir and replacing it with a normal Git checkout."
    mv "$REPO_DIR" "$backup_dir"
    mkdir -p "$(dirname "$REPO_DIR")"
    git clone --branch "$BRANCH" "$REPO_URL" "$REPO_DIR"
  elif [ -e "$REPO_DIR" ]; then
    fail "$REPO_DIR already exists but is not a Git checkout. Move it or set PEAR_AI_SKILLS_REPO to a different path."
  else
    info "Cloning $REPO_URL into $REPO_DIR"
    mkdir -p "$(dirname "$REPO_DIR")"
    git clone --branch "$BRANCH" "$REPO_URL" "$REPO_DIR"
  fi
}

checkout_with_archive() {
  archive_url="https://github.com/Pear-Commerce/pear-ai-skills/archive/refs/heads/$BRANCH.tar.gz"
  if [ -d "$REPO_DIR/skills" ]; then
    warn "git is not installed. Using existing files at $REPO_DIR without updating them."
    return
  fi
  if [ -e "$REPO_DIR" ]; then
    fail "$REPO_DIR already exists and git is not available to update it."
  fi
  have curl || fail "git is not installed, and curl is not available for the archive fallback."
  have tar || fail "git is not installed, and tar is not available for the archive fallback."

  tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/pear-ai-skills.XXXXXX")"
  trap 'rm -rf "$tmp_dir"' EXIT
  info "git is not installed. Downloading a snapshot from GitHub instead."
  curl -fsSL "$archive_url" -o "$tmp_dir/repo.tar.gz"
  mkdir -p "$tmp_dir/extract"
  tar -xzf "$tmp_dir/repo.tar.gz" -C "$tmp_dir/extract"
  extracted="$(find "$tmp_dir/extract" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
  [ -n "$extracted" ] || fail "Could not unpack the Pear AI Skills archive."
  mkdir -p "$(dirname "$REPO_DIR")"
  mv "$extracted" "$REPO_DIR"
  touch "$REPO_DIR/.pear-ai-skills-snapshot"
}

checkout_repo() {
  step "1. Checkout canonical skills"
  if tool_available git; then
    checkout_with_git
  else
    checkout_with_archive
  fi

  [ -d "$REPO_DIR/skills" ] || fail "No skills directory found at $REPO_DIR/skills."
  ok "Canonical repo is ready: $REPO_DIR"
}

copy_skill_dir() {
  skill_dir="$1"
  target_parent="$2"
  skill_name="$(basename "$skill_dir")"
  target_dir="$target_parent/$skill_name"
  tmp_target="$(mktemp -d "$target_parent/.${skill_name}.tmp.XXXXXX")"

  if have rsync; then
    rsync -a --delete --exclude='.DS_Store' "$skill_dir/" "$tmp_target/"
  else
    cp -R "$skill_dir/." "$tmp_target/"
  fi

  rm -rf "$target_dir"
  mv "$tmp_target" "$target_dir"
}

remove_retired_skills_from_target() {
  target_name="$1"
  target_parent="$2"

  for skill_name in $RETIRED_SKILLS; do
    target_dir="$target_parent/$skill_name"
    if [ -d "$target_dir" ]; then
      rm -rf "$target_dir"
      info "Removed retired skill from $target_name: $skill_name"
    fi
  done
}

import_to_target() {
  target_name="$1"
  target_parent="$2"
  mkdir -p "$target_parent"
  remove_retired_skills_from_target "$target_name" "$target_parent"

  count=0
  for skill_dir in "$REPO_DIR"/skills/*; do
    [ -d "$skill_dir" ] || continue
    [ -f "$skill_dir/SKILL.md" ] || {
      warn "Skipping $(basename "$skill_dir"): missing SKILL.md"
      continue
    }
    copy_skill_dir "$skill_dir" "$target_parent"
    count=$((count + 1))
  done

  ok "Imported $count skills to $target_name: $target_parent"
}

main() {
  say "${BOLD}Pear AI Skills Installer${RESET}"
  say "${DIM}Canonical repo: $REPO_URL${RESET}"

  prepare_local_tools
  checkout_repo

  step "2. Import skills"
  if [ "$INSTALL_CODEX" -eq 1 ]; then
    import_to_target "Codex-compatible target" "$CODEX_SKILLS_DIR"
  fi
  if [ "$INSTALL_CLAUDE" -eq 1 ]; then
    import_to_target "Claude Desktop target" "$CLAUDE_SKILLS_DIR"
  fi

  step "3. Next steps"
  info "Start a fresh chat in the assistant you use."
  info "Claude Desktop may need a restart before it sees newly synced skills."
  info "You can safely rerun this installer whenever Pear skills change."
  say ""
  ok "Done."
}

main
