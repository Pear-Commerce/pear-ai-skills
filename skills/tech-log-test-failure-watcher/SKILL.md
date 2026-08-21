---
name: tech-log-test-failure-watcher
description: Start, restart, or repair the Codex automation that watches Slack #tech-log for Pear api.pearcommerce.com unit or integration test failures, spawns deep GitHub Actions triage workers, uses $handle-in-slack for YES/NO approval and follow-through, and after approval uses Pear engineering and PR workflows to fix, open, watch, and merge PRs.
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
- Off-hours quiet window: in America/Chicago, skip Slack/GitHub/escalation work after 7:00 PM or before 8:00 AM unless the user explicitly asks for around-the-clock monitoring.
- Use the automation tool to create or update automations; do not hand-edit automation TOML unless the tool is unavailable.
- Use `$slack:slack`, `$handle-in-slack`, `$pear-engineering-workflow`, and `$pear-pr-review-flow` while carrying out the watcher task.
- When a failure touches a named vendor/brand flow, `$front-api` is a useful extra source — check Front for related customer email before proposing a fix so the reply can account for commitments CS already made.
- Architecture: keep the recurring watcher as a lightweight sentinel. Escalate real failures to a run-specific deep worker/automation before doing GitHub log analysis, culprit attribution, code edits, PR creation, PR watching, or merging.

## Start Or Repair

1. Inspect existing automations for matching names or prompts before creating duplicates.
2. Create or update the watcher as an active lightweight sentinel heartbeat attached to the current thread. Use a short interval, normally 10 minutes. If model/reasoning controls are available for the sentinel, use the cheapest reliable model and low reasoning; otherwise keep the prompt narrow so the heartbeat only searches Slack and escalates.
3. Create or update the daily repair automation as a standalone local cron so it can coexist with the one thread-attached heartbeat watcher. Schedule it for 8:00 AM in the user's locale, America/Chicago. Use a low reasoning setting when available. If the automation tool requires weekly cron schedules, represent daily as every weekday plus weekend day.
4. After creation, view or inspect the automation files to confirm both are active and summarize the watcher ID/name.

## Watcher Prompt

Use this as the watcher automation prompt:

```text
You are the lightweight sentinel for #tech-log (channel ID C062H588MJM) Pear api.pearcommerce.com test failures. Keep this pass cheap: search/read Slack only, including bot messages. Do not inspect GitHub Actions logs, run `gh`, scan git history, edit code, create branches, open PRs, or post Slack triage yourself from this sentinel unless explicitly instructed below.

Off-hours quiet window: in America/Chicago, if the current local time is after 7:00 PM or before 8:00 AM, do not search Slack, inspect GitHub, escalate, spawn/delegate, create automations, or post Slack replies. Return a quiet status only, unless the user explicitly asked for around-the-clock monitoring.

Target messages look like `Integration test failure: integration test failed for refs/heads/master` and include GitHub Actions URLs like https://github.com/Pear-Commerce/api.pearcommerce.com/actions/runs/<run_id>. Also treat equivalent master unit-test failure messages for Pear-Commerce/api.pearcommerce.com as in scope.

For each recent in-scope failure message:
- read the Slack thread first
- skip it if Codex has already posted a triage reply for that run, if a PR/fix flow is already linked in the thread, or if a run-specific deep triage/fix automation already exists
- extract the GitHub Actions run URL, run id, Slack channel id, parent message timestamp, thread permalink, and any obvious existing approval/decline replies
- do not perform deep analysis in this sentinel pass

When a new unhandled in-scope failure is found, immediately escalate it to a run-specific deep worker before any expensive reasoning:
- Prefer spawning/delegating a worker/subtask with model `gpt-5.4` and `reasoning_effort=medium` if that capability is available in the current environment and can run immediately. The spawned worker prompt must explicitly use `/Users/alexwyler/.codex/skills/handle-in-slack/SKILL.md` for the approval gate and follow-through.
- Otherwise create or update a run-specific Codex automation named `Tech-log failure <run_id> deep triage` with model `gpt-5.4`, reasoning effort `medium`, cwd `/Users/alexwyler/api.pearcommerce.com`, and the Escalated Failure Prompt from `$tech-log-test-failure-watcher` or `/Users/alexwyler/.codex/skills/tech-log-test-failure-watcher/SKILL.md`, filled with the run URL, run id, Slack channel id, parent message timestamp, and thread permalink. The spawned worker prompt must explicitly use `/Users/alexwyler/.codex/skills/handle-in-slack/SKILL.md` for the approval gate and follow-through. Use the shortest safe cadence available for that automation type, and instruct the deep automation to delete itself when complete or when it hands off to a PR-specific watcher.

After escalation, stay quiet in Slack. Report in this Codex thread only if escalation failed or a duplicate/permission ambiguity needs human attention. If no new unhandled failures are found, do nothing except return a quiet heartbeat status.
```

## Escalated Failure Prompt

Use this as the run-specific medium-reasoning worker/automation prompt. Fill the placeholders from the sentinel before starting it:

```text
Use Slack and GitHub to deeply triage this Pear api.pearcommerce.com master test failure:
- Slack channel: C062H588MJM
- Slack parent message timestamp: <SLACK_PARENT_TS>
- Slack thread permalink: <SLACK_THREAD_URL>
- GitHub Actions run: <RUN_URL>
- GitHub Actions run id: <RUN_ID>

Read the Slack thread first, including bot messages. Skip and delete/stop this run-specific automation if Codex has already posted a triage reply for this run or if a PR/fix flow is already linked in the thread. Extract/confirm the GitHub Actions run URL, then inspect the run, failed jobs, annotations, and logs with GitHub tools or `gh`. Determine the concrete failing test/build step, the most likely code cause, and the smallest surgical fix. Do not edit code during this initial analysis.

Use `/Users/alexwyler/.codex/skills/handle-in-slack/SKILL.md` as the canonical workflow for the Slack reply, YES/NO approval gate, and post-approval execution. Do read-only analysis first, then choose the `$handle-in-slack` outcome: answer-only, clarification, or action-needed YES/NO gate.

Scan recent merged PRs for likely culprits before posting. Use the failing run head SHA, failure file/test names, compiler symbols, `git log`, `git blame`, and recent merged PR metadata to identify the PR most likely to have introduced the break. Prefer PRs merged after the last known green master run or shortly before the failing run. If one culprit is reasonably clear, include the PR link and author in the Slack reply. Resolve the GitHub author to a Slack user with `slack_search_users` by name/email/login when possible and tag them with `<@USERID>`. If mapping is uncertain, name the GitHub author without tagging. Do not tag multiple people unless the evidence is genuinely shared.

Slack message budget: per failure thread, send only these Slack touchpoints unless a new human approval or an urgent blocker requires otherwise:
- the original automatic triage reply, including the likely culprit author tag when found
- one terse approval-start marker, using a reaction when possible or a short `:hourglass_flowing_sand:` fallback reply
- one terse PR-created reply linking to the PR and noting auto-merge status
- one terse merge/final reply linking to the merged PR and final master build result

Do not post separate culprit-scan, local-check, watcher-created, auto-merge, or intermediate CI-status Slack replies. Fold culprit details into the original triage reply, and keep all later Slack replies short.

Post one concise original Slack thread reply on the failure message. Start the reply with `Automatic reply triggered by $tech-log-test-failure-watcher.` Then include:
- the failing job/test/build step
- the important error text or stack frame, paraphrased when long
- the likely root cause
- the simplest surgical fix
- the likely culprit PR and author tag when found
- a YES/NO approval ask from `$handle-in-slack` with exact scope and execution path

Approval UX: follow `$handle-in-slack`. If the available Slack tool supports interactive yes/no buttons, use them. If it only supports markdown messages, ask people to reply `yes` or `no` in the thread. Treat a clear yes from any human in the thread (`yes`, `y`, `fix it`, `go`, `please fix`, `do it`, or equivalent) as approval to fix only the scoped failure, open a PR, watch it, and merge it when ready. Treat a clear no/stop as a decline for that run. End agent-authored Slack posts with your agent signoff: `- Claude` when you are Claude, `- Codex` when you are Codex, `- OpenCode` when you are OpenCode (Sisyphus / OhMyOpenCode).

When reading an approval reply, mark the exact Slack message treated as affirmation. Prefer adding a Slack reaction such as `:hourglass_flowing_sand:` or `:eyes:` to that approval message if the available Slack tool supports reactions. If reactions are not available, post one terse thread reply, such as `:hourglass_flowing_sand: Approved; starting fix. - <agent signoff>`. When the fix PR is created, update that same approval marker to `:white_check_mark:` if reactions/editing allow it. If reactions are unavailable, do not post another approval marker; the PR-created reply is the green-check transition. Do not mark ambiguous replies as approvals.

On later passes, revisit this analyzed thread and look for human yes/no replies. If no approval has arrived, do nothing except report notable blockers in the Codex thread. If the thread is declined, reply once acknowledging the decline and delete/stop this run-specific automation.

When approved, use `$pear-engineering-workflow` and `$pear-pr-review-flow`. Create a sibling worktree from the latest `origin/master`, never the user's primary checkout, on a unique `codex/` branch named for the run or failing test. Make the smallest code or test-data fix that addresses the specific failure. Prefer repo helpers and patterns. Run the most focused practical verification; if local Gradle/toolchain setup would become noisy, use cheap local checks and GitHub CI as the source of truth per Pear PR flow.

Commit, push, and create a PR with a concise body that links the original Slack failure thread and GitHub Actions run. Request appropriate reviewers and GitHub Copilot according to `$pear-pr-review-flow`. Enable GitHub auto-merge immediately for these watcher-created fix PRs using the repo's normal merge method, for example `gh pr merge PR_NUMBER --auto --squash` when squash merge is the normal path, and verify the PR shows an `autoMergeRequest`. Post one terse PR-created Slack reply, such as `:white_check_mark: PR opened: <PR_URL>. Auto-merge enabled. - <agent signoff>`.

Create or update a PR-specific review/watch automation for the new PR with model `gpt-5.3-codex` and reasoning effort `xhigh` while the PR is active. That PR watcher has approval to auto-fix actionable review comments and related CI/unit-test failures, re-request Copilot after fix passes, monitor until quiescent, confirm auto-merge remains enabled after any fix push, and ensure the PR lands/merges once the branch is up to date, required checks are green, no actionable feedback remains, and normal branch protection/merge rules allow it. Quiescent means at least one full watcher pass on the latest pushed head finds no new actionable GitHub feedback and the relevant build is fixed/green. If merge is blocked by permissions, branch protection, merge queue, conflicts, stale checks, missing required review, or auto-merge cannot be enabled, keep watching and report the blocker in the Codex thread only unless human Slack action is needed. When the PR merges and the final master build result is known, post one terse merge/final Slack reply, such as `:white_check_mark: Merged: <PR_URL>. Master build green: <RUN_URL>. - <agent signoff>` or `:warning: Merged: <PR_URL>. Master build still failing: <RUN_URL>. - <agent signoff>`.

Avoid duplicate work: before opening a branch or PR, search the Slack thread and open GitHub PRs for the run URL, failed test name, or branch slug. Do not touch unrelated files, unrelated PRs, or user-authored branches unless explicitly approved. Delete/stop this run-specific automation after it has posted the final decline, handed off to a PR-specific watcher, or completed a no-op duplicate skip.
```

## Daily Repair Prompt

Use this as the repair automation prompt:

```text
Ensure the `Tech-log test failure watcher` automation exists and is ACTIVE. If it is missing, paused, canceled, disabled, no longer points at #tech-log channel ID C062H588MJM for Pear-Commerce/api.pearcommerce.com test failures, or its spawned worker prompt does not explicitly use `/Users/alexwyler/.codex/skills/handle-in-slack/SKILL.md`, use the automation tool to recreate or update it from the `$tech-log-test-failure-watcher` skill's Watcher Prompt. Keep the watcher attached to the original watcher thread when known; otherwise attach it to the current thread. Use the standard short heartbeat cadence. Do not process Slack failures yourself from this repair automation; only repair or confirm the watcher. Report what you changed, or say that the watcher was already active.
```

## Manual Operations

- To pause just the narrow watcher, update `Tech-log test failure watcher` to `PAUSED` or delete it if the user explicitly asks to cancel it.
- To revive the watcher manually, run this skill and perform Start Or Repair.
- Leave `Re-enable tech-log test failure watcher` active unless the user wants the self-healing behavior removed too.
- If the user asks for full shutdown, pause or delete both the watcher and the daily repair automation.
