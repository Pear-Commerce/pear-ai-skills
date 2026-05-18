# Pear AI Skills

Canonical public home for Pear-authored AI assistant skills, currently used with Codex-compatible clients and Claude Desktop.

## Skills

- `canonical-skills`: one-time bootstrap skill that imports and updates Pear skills from this canonical repo.
- `check-partner-upc`: check Pinterest partner UPC status, retailers, and availability.
- `intern-app-hosting`: host and update internal standalone apps on `*.intern.pearcommerce.com`.
- `pdf`: read, create, render, and visually verify PDF files.
- `pear-concurrency`: `Parallel` utility, thread pool patterns, KeyedLock eviction, AtomicVelocityCounter, and timeout anti-patterns for `api.pearcommerce.com`.
- `pear-dashboard-module-author`: create, edit, publish, and review standalone Pear dashboard S3 modules.
- `pear-engineering-workflow`: Pear engineering workflow for code edits, real data checks, worktrees, and end-to-end verification.
- `pear-jobs`: Quartz job structure (`PearScheduledJob`/`PearSimpleIntervalJob`), AtomicBoolean guards, `Parallel.getAll()` timeouts, and AppConfig toggles for `api.pearcommerce.com`.
- `pear-orm`: PearSimpleORM load/save/query/async-batch patterns and anti-patterns for `api.pearcommerce.com` (not Hibernate/JPA).
- `pear-pr-review-flow`: Pear pull-request workflow for review requests, Copilot, review loops, and landing.
- `pear-proxy`: `JurlProxyFallback` Type ordering, ZenRows RENDER/SCRAPE, Vavr Try error handling, circuit breakers, and virtual-thread pinning avoidance for `api.pearcommerce.com`.
- `retailer-store-import-feasibility`: discover, implement, verify, and preserve retailer store-import routes and `Store.SStore` JSON artifacts.

## Skill References

- `skills/pear-engineering-workflow/references/codex-pr-improvement-goal.md`: Pear PR cleanup and review-quality checklist used by `pear-engineering-workflow` and `pear-pr-review-flow`.

## Get Set Up and Stay Synced

Most people should run the installer once. It checks out this canonical repo, installs missing basics such as Homebrew, Git, and GitHub CLI when possible, syncs Pear's shared skills into both Codex-compatible and Claude Desktop skill folders, and can be safely rerun whenever skills change.

## Fast Path: Ask Your Assistant

In Codex or Claude, start with this short prompt:

```text
Find Pear-Commerce/pear-ai-skills and add all Pear skills to this assistant. If anything basic is missing, bootstrap Homebrew/Git/GitHub CLI as needed, clone or update the repo, run its installer with --bootstrap-tools, and then list the installed skills.
```

If that works, start a fresh chat and mention skills normally. Claude Desktop may need a restart before it sees newly synced skills.

If the assistant cannot find or run the installer, use the manual fallback below.

## Manual Fallback

Paste this into Terminal:

```bash
curl -fsSL https://raw.githubusercontent.com/Pear-Commerce/pear-ai-skills/main/scripts/install-all-skills.sh | bash -s -- --bootstrap-tools
```

What it does:

- Installs Homebrew on macOS if needed for missing local tools.
- Installs Git and GitHub CLI when possible.
- Clones or updates the repo at `$HOME/pear-ai-skills`.
- Syncs Pear's shared skills into `${CODEX_HOME:-$HOME/.codex}/skills`.
- Syncs Pear's shared skills into `$HOME/.claude/skills`.
- Preserves local repo changes instead of overwriting them.
- Falls back to a GitHub archive snapshot if Git cannot be installed yet.

If you already have the repo checked out, run:

```bash
./scripts/install-all-skills.sh --bootstrap-tools
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
