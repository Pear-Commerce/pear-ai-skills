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

## Get Set Up and Stay Synced

Most people should run the installer once. It checks out this canonical repo, syncs Pear's shared skills into both Codex-compatible and Claude Desktop skill folders, and can be safely rerun whenever skills change.

Paste this into Terminal:

```bash
curl -fsSL https://raw.githubusercontent.com/Pear-Commerce/pear-ai-skills/main/scripts/install-all-skills.sh | bash
```

What it does:

- Clones or updates the repo at `$HOME/pear-ai-skills`.
- Syncs Pear's shared skills into `${CODEX_HOME:-$HOME/.codex}/skills`.
- Syncs Pear's shared skills into `$HOME/.claude/skills`.
- Preserves local repo changes instead of overwriting them.

If you already have the repo checked out, run:

```bash
./scripts/install-all-skills.sh
```

Claude Desktop may need a restart before it sees newly installed skills.

## Install All Skills: Codex-Compatible Target

```bash
./scripts/install-all-skills.sh --codex-only
```

## Install All Skills: Claude Desktop Target

```bash
./scripts/install-all-skills.sh --claude-only
```

## Updating Skills

This repository is the source of truth. If a skill is also vendored inside an app repository, update this repository first, push it, then copy the changed skill back to the app repository that needs the local copy.

For app repositories other than `api.pearcommerce.com`, commit and push the app-repo copy directly after verification. For `api.pearcommerce.com`, make the change on a `codex/` branch and open a pull request.
