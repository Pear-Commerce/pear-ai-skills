# Pear AI Skills

Canonical public home for Pear-authored AI assistant skills, currently used with Codex-compatible clients and Claude Desktop.

## Skills

- `canonical-skills`: one-time bootstrap skill that imports and updates Pear skills from this canonical repo.
- `intern-app-hosting`: host and update internal standalone apps on `*.intern.pearcommerce.com`.
- `pdf`: read, create, render, and visually verify PDF files.
- `pear-dashboard-module-author`: create, edit, publish, and review standalone Pear dashboard S3 modules.
- `pear-engineering-workflow`: Pear engineering workflow for code edits, real data checks, worktrees, and end-to-end verification.
- `pear-pr-review-flow`: Pear pull-request workflow for review requests, Copilot, review loops, and landing.

## Shared Docs

- `docs/codex-pr-improvement-goal.md`: Pear PR cleanup and review-quality checklist used by `pear-engineering-workflow` and `pear-pr-review-flow`.

## Install the Bootstrap Skill and Preload Everything

Most people should install `canonical-skills` once, then immediately import all canonical Pear skills so their assistant is up and running quickly. After that, when they mention skills, the assistant can pull this repo again, refresh every skill, and re-check whether any newly imported skill applies.

Codex-compatible target:

```bash
PEAR_AI_SKILLS_REPO="${PEAR_AI_SKILLS_REPO:-$HOME/pear-ai-skills}"
if [ -d "$PEAR_AI_SKILLS_REPO/.git" ]; then
  git -C "$PEAR_AI_SKILLS_REPO" pull --ff-only
else
  git clone https://github.com/Pear-Commerce/pear-ai-skills "$PEAR_AI_SKILLS_REPO"
fi
mkdir -p "${CODEX_HOME:-$HOME/.codex}/skills"
rm -rf "${CODEX_HOME:-$HOME/.codex}/skills/canonical-skills"
cp -R "$PEAR_AI_SKILLS_REPO/skills/canonical-skills" "${CODEX_HOME:-$HOME/.codex}/skills/"

# Preload every canonical Pear skill so the assistant is ready immediately.
for skill_dir in "$PEAR_AI_SKILLS_REPO"/skills/*; do
  [ -d "$skill_dir" ] || continue
  skill_name="$(basename "$skill_dir")"
  rm -rf "${CODEX_HOME:-$HOME/.codex}/skills/$skill_name"
  cp -R "$skill_dir" "${CODEX_HOME:-$HOME/.codex}/skills/"
done
```

Claude Desktop target:

```bash
PEAR_AI_SKILLS_REPO="${PEAR_AI_SKILLS_REPO:-$HOME/pear-ai-skills}"
if [ -d "$PEAR_AI_SKILLS_REPO/.git" ]; then
  git -C "$PEAR_AI_SKILLS_REPO" pull --ff-only
else
  git clone https://github.com/Pear-Commerce/pear-ai-skills "$PEAR_AI_SKILLS_REPO"
fi
mkdir -p "$HOME/.claude/skills"
rm -rf "$HOME/.claude/skills/canonical-skills"
cp -R "$PEAR_AI_SKILLS_REPO/skills/canonical-skills" "$HOME/.claude/skills/"

# Preload every canonical Pear skill so the assistant is ready after restart.
for skill_dir in "$PEAR_AI_SKILLS_REPO"/skills/*; do
  [ -d "$skill_dir" ] || continue
  skill_name="$(basename "$skill_dir")"
  rm -rf "$HOME/.claude/skills/$skill_name"
  cp -R "$skill_dir" "$HOME/.claude/skills/"
done
```

Claude may need a restart before it sees the newly installed skill.

## Install All Skills: Codex-Compatible Target

```bash
mkdir -p "${CODEX_HOME:-$HOME/.codex}/skills"
cp -R skills/* "${CODEX_HOME:-$HOME/.codex}/skills/"
```

## Install All Skills: Claude Desktop Target

```bash
mkdir -p "$HOME/.claude/skills"
cp -R skills/* "$HOME/.claude/skills/"
```

## Updating Skills

This repository is the source of truth. If a skill is also vendored inside an app repository, update this repository first, push it, then copy the changed skill back to the app repository that needs the local copy.

For app repositories other than `api.pearcommerce.com`, commit and push the app-repo copy directly after verification. For `api.pearcommerce.com`, make the change on a `codex/` branch and open a pull request.
