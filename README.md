# Pear AI Skills

Canonical public home for Pear-authored Codex and Claude skills.

## Skills

- `intern-app-hosting`: host and update internal standalone apps on `*.intern.pearcommerce.com`.
- `pdf`: read, create, render, and visually verify PDF files.
- `pear-dashboard-module-author`: create, edit, publish, and review standalone Pear dashboard S3 modules.
- `pear-engineering-workflow`: Pear engineering workflow for code edits, real data checks, worktrees, and end-to-end verification.
- `pear-pr-review-flow`: Pear pull-request workflow for review requests, Copilot, review loops, and landing.

## Shared Docs

- `docs/codex-pr-improvement-goal.md`: Pear PR cleanup and review-quality checklist used by `pear-engineering-workflow` and `pear-pr-review-flow`.

## Install for Codex

```bash
mkdir -p "${CODEX_HOME:-$HOME/.codex}/skills"
cp -R skills/* "${CODEX_HOME:-$HOME/.codex}/skills/"
```

## Install for Claude

```bash
mkdir -p "$HOME/.claude/skills"
cp -R skills/* "$HOME/.claude/skills/"
```

## Updating Skills

This repository is the source of truth. If a skill is also vendored inside an app repository, update this repository first, push it, then copy the changed skill back to the app repository that needs the local copy.

For app repositories other than `api.pearcommerce.com`, commit and push the app-repo copy directly after verification. For `api.pearcommerce.com`, make the change on a `codex/` branch and open a pull request.
