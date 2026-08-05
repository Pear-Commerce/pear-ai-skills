# Pear AI Skills

Canonical public home for Pear-authored AI assistant skills, currently used with Codex-compatible clients and Claude Desktop.

## Skills

- `canonical-skills`: bootstrap and sync Pear's canonical skill library.
- `check-partner-upc`: check Pinterest partner UPC status, retailers, and availability.
- `event-attendee-export`: discover attendee endpoints from curls or event sites, enrich contact fields, and export results to S3.
- `gsd-add-phase`: add a phase to the end of the current milestone roadmap.
- `gsd-add-tests`: generate tests for a completed phase from UAT criteria and implementation.
- `gsd-add-todo`: capture an idea or task as a todo from conversation context.
- `gsd-audit-milestone`: audit milestone completion against the original intent before archiving.
- `gsd-autonomous`: run remaining phases through discuss, plan, and execute loops.
- `gsd-check-todos`: list pending todos and select one to work on.
- `gsd-cleanup`: archive accumulated phase directories from completed milestones.
- `gsd-complete-milestone`: archive a completed milestone and prepare for the next version.
- `gsd-debug`: run systematic debugging with persistent state across context resets.
- `gsd-discuss-phase`: gather phase context through adaptive questions before planning.
- `gsd-do`: route freeform text to the right GSD command.
- `gsd-execute-phase`: execute phase plans with wave-based parallelization.
- `gsd-health`: diagnose planning directory health and optionally repair issues.
- `gsd-help`: show available GSD commands and usage.
- `gsd-insert-phase`: insert urgent work as a decimal phase between existing phases.
- `gsd-join-discord`: join the GSD Discord community.
- `gsd-list-phase-assumptions`: surface assumptions about a phase approach before planning.
- `gsd-map-codebase`: analyze a codebase with mapper agents and write `.planning/codebase` docs.
- `gsd-new-milestone`: start a new milestone cycle and route to requirements.
- `gsd-new-project`: initialize a new project with deep context gathering and `PROJECT.md`.
- `gsd-next`: advance to the next logical GSD workflow step.
- `gsd-note`: capture, list, and promote zero-friction notes.
- `gsd-pause-work`: create context handoff notes when pausing work mid-phase.
- `gsd-plan-milestone-gaps`: create phases to close all gaps identified by a milestone audit.
- `gsd-plan-phase`: create detailed executable phase plans.
- `gsd-profile-user`: generate a developer behavioral profile and discoverable artifacts.
- `gsd-progress`: check project progress and route to the next action.
- `gsd-quick`: execute a quick task with GSD guarantees.
- `gsd-reapply-patches`: reapply local modifications after a GSD update.
- `gsd-remove-phase`: remove a future phase and renumber subsequent phases.
- `gsd-research-phase`: research how to implement a phase.
- `gsd-resume-work`: resume work from a prior session with context restoration.
- `gsd-session-report`: generate a session report with token estimates, work summary, and outcomes.
- `gsd-set-profile`: switch the GSD model profile.
- `gsd-settings`: configure GSD workflow toggles and model profile.
- `gsd-ship`: create a PR, run review, and prepare for merge.
- `gsd-stats`: display project statistics, phases, requirements, git metrics, and timeline.
- `gsd-ui-phase`: generate a UI design contract for frontend phases.
- `gsd-ui-review`: run a retrospective six-pillar visual audit of implemented frontend code.
- `gsd-update`: update GSD to the latest version with changelog display.
- `gsd-validate-phase`: audit and fill validation gaps for a completed phase.
- `gsd-verify-work`: validate completed work through conversational UAT.
- `intern-app-hosting`: host and update internal standalone apps on `*.intern.pearcommerce.com`.
- `locator-parity`: compare AngularJS and React locator behavior with Chrome automation.
- `pdf`: read, create, render, and visually verify PDF files.
- `pear-concurrency`: `Parallel` utility, thread pool patterns, KeyedLock eviction, AtomicVelocityCounter, and timeout anti-patterns.
- `pear-dashboard-module-author`: create, edit, publish, and review standalone Pear dashboard S3 modules.
- `pear-engineering-workflow`: Pear engineering workflow for code edits, real data checks, worktrees, and end-to-end verification.
- `pear-jobs`: Quartz job structure, AtomicBoolean guards, `Parallel.getAll()` timeouts, and AppConfig toggles.
- `pear-orm`: PearSimpleORM load/save/query/async-batch patterns and anti-patterns.
- `pear-pr-review-flow`: Pear pull-request workflow for review requests, Copilot, review loops, and landing.
- `pear-prod-jsp`: run one-off JSPs on live Pear servers for production reads and tool probes.
- `pear-proxy`: `JurlProxyFallback` Type ordering, ZenRows, Vavr Try handling, circuit breakers, and request dedupe.
- `retailer-availability-scanning-feasibility`: discover, implement, and verify retailer availability scanning routes.
- `retailer-integration-feasibility`: coordinate retailer onboarding feasibility across importers, resolvers, and scanners.
- `retailer-production-integration`: productionize retailer integration classes after feasibility is proven.
- `retailer-store-import-feasibility`: discover, implement, verify, and preserve retailer store-import routes and `Store.SStore` artifacts.
- `retailer-upc-resolution-feasibility`: discover, implement, and verify UPC-to-retailer-item-ID resolution.
- `screenshot`: capture desktop, app, window, or region screenshots when OS-level capture is needed.
- `snowflake-jdbc`: Snowflake JDBC gotchas for Pear Java code — uppercase column labels, connection pool, and streaming patterns.
- `step9-golden-test-and-fix`: run and stabilize Step9 golden residential retailer tests.
- `step9-phase4-stabilization`: supervise Step9 Phase 4 runs, parity checks, tracker updates, and final waves.
- `upc-resolution-code-changes`: guide UPC resolution graph, resolver, and verification code changes.

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
