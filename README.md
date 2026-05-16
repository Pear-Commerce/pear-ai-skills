# Pear AI Skills

Canonical public home for Pear-authored AI assistant skills, currently used with Codex-compatible clients and Claude Desktop.

## Skills

- `canonical-skills`: one-time bootstrap skill that imports and updates Pear skills from this canonical repo.
- `check-partner-upc`: check Pinterest partner UPC status, retailers, and availability.
- `intern-app-hosting`: host and update internal standalone apps on `*.intern.pearcommerce.com`.
- `pdf`: read, create, render, and visually verify PDF files.
- `pear-dashboard-module-author`: create, edit, publish, and review standalone Pear dashboard S3 modules.
- `pear-engineering-workflow`: Pear engineering workflow for code edits, real data checks, worktrees, and end-to-end verification.
- `pear-pr-review-flow`: Pear pull-request workflow for review requests, Copilot, review loops, and landing.
- `sstore-store-extractor`: extract retailer store lists into `Store.SStore`-style JSON for `api.pearcommerce.com`.

## Skill References

- `skills/pear-engineering-workflow/references/codex-pr-improvement-goal.md`: Pear PR cleanup and review-quality checklist used by `pear-engineering-workflow` and `pear-pr-review-flow`.

## Get Set Up and Stay Synced

Most people should run the installer once. It checks out this canonical repo, syncs Pear's shared skills into both Codex-compatible and Claude Desktop skill folders, and can be safely rerun whenever skills change.

## Fast Path: Ask Your Assistant

In Codex or Claude, start with this short prompt:

```text
Find Pear-Commerce/pear-ai-skills and add all Pear skills to this assistant. If the repo is not checked out, clone or update it, run its installer, and then list the installed skills.
```

If that works, start a fresh chat and mention skills normally. Claude Desktop may need a restart before it sees newly synced skills.

If the assistant cannot find or run the installer, use the manual fallback below.

## Manual Fallback

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

Claude Desktop may need a restart before it sees newly synced skills.

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

Do not create or require skill icons. Skill metadata should focus on the information assistants actually use: name, description, instructions, and any target-specific prompts.

For app repositories other than `api.pearcommerce.com`, commit and push the app-repo copy directly after verification. For `api.pearcommerce.com`, make the change on a `codex/` branch and open a pull request.
