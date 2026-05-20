---
name: tech-log-test-failure-watcher
description: Start, restart, or repair the Codex automation that watches Slack #tech-log for Pear api.pearcommerce.com unit or integration test failures, analyzes GitHub Actions logs, posts Slack triage replies, and after yes approval uses Pear engineering and PR workflows to fix, open, watch, and merge PRs.
metadata:
  short-description: Watch #tech-log CI failures and drive surgical fixes
---

# Tech Log Test Failure Watcher

Use this skill when asked to start, restart, re-enable, inspect, or recreate the Slack watcher for Pear test failures in `#tech-log`.

## Defaults

- Slack channel: `#tech-log`, channel ID `C062H588MJM`.
- Repo: `Pear-Commerce/api.pearcommerce.com`, local primary checkout `/Users/alexwyler/api.pearcommerce.com`.
- Watcher automation name: `Tech-log test failure watcher`.
- Daily repair automation name: `Re-enable tech-log test failure watcher`.
- Use the automation tool to create or update automations; do not hand-edit automation TOML unless the tool is unavailable.
- Use `$slack:slack`, `$pear-engineering-workflow`, and `$pear-pr-review-flow` while carrying out the watcher task.

## Start Or Repair

1. Inspect existing automations for matching names or prompts before creating duplicates.
2. Create or update the watcher as an active heartbeat attached to the current thread. Use a short interval, normally 10 minutes.
3. Create or update the daily repair automation as a standalone local cron so it can coexist with the one thread-attached heartbeat watcher. Schedule it for 8:00 AM in the user's locale, America/Chicago. If the automation tool requires weekly cron schedules, represent daily as every weekday plus weekend day.
4. After creation, view or inspect the automation files to confirm both are active and summarize the watcher ID/name.

## Watcher Prompt

Use this as the watcher automation prompt:

```text
Use Slack and GitHub to watch #tech-log (channel ID C062H588MJM) for Pear api.pearcommerce.com test failure messages. Target messages look like `Integration test failure: integration test failed for refs/heads/master` and include GitHub Actions URLs like https://github.com/Pear-Commerce/api.pearcommerce.com/actions/runs/<run_id>. Also treat equivalent master unit-test failure messages for Pear-Commerce/api.pearcommerce.com as in scope.

Read recent #tech-log messages, including bot messages. For each in-scope failure, read the Slack thread first and skip it if Codex has already posted a triage reply for that run or if a PR/fix flow is already linked in the thread. Extract the GitHub Actions run URL and inspect the run, failed jobs, annotations, and logs with GitHub tools or `gh`. Determine the concrete failing test/build step, the most likely code cause, and the smallest surgical fix. Do not edit code during this initial analysis.

Scan recent merged PRs for likely culprits before posting. Use the failing run head SHA, failure file/test names, compiler symbols, `git log`, `git blame`, and recent merged PR metadata to identify the PR most likely to have introduced the break. Prefer PRs merged after the last known green master run or shortly before the failing run. If one culprit is reasonably clear, include the PR link and author in the Slack reply. Resolve the GitHub author to a Slack user with `slack_search_users` by name/email/login when possible and tag them with `<@USERID>`. If mapping is uncertain, name the GitHub author without tagging. Do not tag multiple people unless the evidence is genuinely shared.

Post one concise Slack thread reply on the failure message with:
- the failing job/test/build step
- the important error text or stack frame, paraphrased when long
- the likely root cause
- the simplest surgical fix
- the likely culprit PR and author tag when found
- a yes/no approval ask

Approval UX: if the available Slack tool supports interactive yes/no buttons, use them. If it only supports markdown messages, ask people to reply `yes` or `no` in the thread. Treat a clear yes from any human in the thread (`yes`, `y`, `fix it`, `go`, `please fix`, `do it`, or equivalent) as approval to fix, open a PR, watch it, and merge it when ready. Treat a clear no/stop as a decline for that run. End Codex-authored Slack posts with:

Thanks,
Codex

On later passes, revisit analyzed in-scope threads and look for human yes/no replies. If no approval has arrived, do nothing except report notable blockers in this Codex thread. If a thread is declined, reply once acknowledging the decline and do not open a PR.

When approved, use `$pear-engineering-workflow` and `$pear-pr-review-flow`. Create a sibling worktree from the latest `origin/master`, never the user's primary checkout, on a unique `codex/` branch named for the run or failing test. Make the smallest code or test-data fix that addresses the specific failure. Prefer repo helpers and patterns. Run the most focused practical verification; if local Gradle/toolchain setup would become noisy, use cheap local checks and GitHub CI as the source of truth per Pear PR flow.

Commit, push, and create a PR with a concise body that links the original Slack failure thread and GitHub Actions run. Request appropriate reviewers and GitHub Copilot according to `$pear-pr-review-flow`. Post the PR link back in the original Slack thread.

Create or update a PR-specific review/watch automation for the new PR. That PR watcher has approval to auto-fix actionable review comments and related CI/unit-test failures, re-request Copilot after fix passes, monitor until quiescent, and auto-land/merge once the branch is up to date, required checks are green, no actionable feedback remains, and normal branch protection/merge rules allow it. Quiescent means at least one full watcher pass on the latest pushed head finds no new actionable GitHub feedback and the relevant build is fixed/green. If merge is blocked by permissions, branch protection, merge queue, conflicts, stale checks, or missing required review, keep watching and report the blocker in the Slack thread and Codex thread.

Avoid duplicate work: before opening a branch or PR, search the Slack thread and open GitHub PRs for the run URL, failed test name, or branch slug. Do not touch unrelated files, unrelated PRs, or user-authored branches unless explicitly approved.
```

## Daily Repair Prompt

Use this as the repair automation prompt:

```text
Ensure the `Tech-log test failure watcher` automation exists and is ACTIVE. If it is missing, paused, canceled, disabled, or no longer points at #tech-log channel ID C062H588MJM for Pear-Commerce/api.pearcommerce.com test failures, use the automation tool to recreate or update it from the `$tech-log-test-failure-watcher` skill's Watcher Prompt. Keep the watcher attached to the original watcher thread when known; otherwise attach it to the current thread. Use the standard short heartbeat cadence. Do not process Slack failures yourself from this repair automation; only repair or confirm the watcher. Report what you changed, or say that the watcher was already active.
```

## Manual Operations

- To pause just the narrow watcher, update `Tech-log test failure watcher` to `PAUSED` or delete it if the user explicitly asks to cancel it.
- To revive the watcher manually, run this skill and perform Start Or Repair.
- Leave `Re-enable tech-log test failure watcher` active unless the user wants the self-healing behavior removed too.
- If the user asks for full shutdown, pause or delete both the watcher and the daily repair automation.
