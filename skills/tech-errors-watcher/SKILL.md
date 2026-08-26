---
name: tech-errors-watcher
description: Start, restart, or repair the Codex automation that watches Pear Slack #tech_errors and #tech_errors_high_priority Datadog alert channels, escalates real alerts to deep Datadog/logs.sh/GitHub analysis, posts a plausible explanation only when evidence supports it, and uses $handle-in-slack for consistent YES/NO approval and execution when a specific code/JSP/operational fix is warranted.
metadata:
  short-description: Watch tech error alerts and gate PR fixes
---

# Tech Errors Watcher

Use this skill when asked to start, restart, re-enable, inspect, or recreate the Slack watcher for Pear tech error alerts.

For Slack analyze/gate/execute behavior, use `$handle-in-slack` as the canonical source of truth. For automation architecture and prompt style, follow `$slack-approval-pr-automation`. For code/PR work, use `$pear-engineering-workflow` and `$pear-pr-review-flow`. If an alert ties to a specific vendor/brand experience, `$front-api` can confirm whether the customer has already emailed CS about the same symptom.

## AWS SSO Prerequisite

This skill uses `devops/logs.sh` (SSM) for log investigation and Datadog/GitHub for alert analysis. Before running any AWS CLI or SSM command, proactively run:

```bash
aws sso login --profile pear-sso
```

This opens the user's Chrome browser for authentication and blocks until approved. Never attempt AWS commands with stale credentials — if you see `UnrecognizedClientException` or `Token has expired`, run the login command first and retry. See `$pear-aws` for full credential troubleshooting.

## Defaults

- Slack channels:
  - `#tech_errors`, channel ID `CNMQLEWDV`
  - `#tech_errors_high_priority`, channel ID `C059KM2EDEY`
- User-facing aliases: `tech-errors`, `tech-errors-high-pri`, `tech_errors`, `tech_errors_high_priority`.
- Primary repo/local checkout: `Pear-Commerce/api.pearcommerce.com`, `/Users/alexwyler/api.pearcommerce.com`.
- Watcher automation name: `Tech errors alert watcher`.
- Daily repair automation name: `Re-enable tech errors alert watcher`.
- Architecture: lightweight sentinel heartbeat when available, otherwise lightweight local cron; run-specific xhigh deep workers; PR-specific xhigh watchers; and a low-reasoning repair cron.

## Start Or Repair

1. Inspect existing automations by name, prompt, channel IDs, and target thread before creating duplicates.
2. Create or update the watcher as an active lightweight sentinel. Prefer a heartbeat attached to the current thread; if the thread already has a heartbeat, use a detached local cron instead of replacing an unrelated watcher. A 5 minute cadence is appropriate because one channel is high priority.
3. Create or update the daily repair automation as a standalone local cron. Schedule it for 8:00 AM America/Chicago and use a small model/low reasoning when supported.
4. Confirm both automations are active and summarize their IDs/names.

## Confidence Policy

The deep worker must be useful without being noisy:

- **No Slack reply** when evidence is low confidence, Datadog/logs are unavailable, the alert is only recovered/resolved with no active incident, or the finding is too vague to give a plausible explanation.
- **Post an explanation only** when there is a plausible cause supported by evidence from Datadog/Slack alert text, `logs.sh`, GitHub deploy/commit/PR history, or application context. Include a confidence label and the evidence trail.
- **Ask YES/NO through `$handle-in-slack` only** when confidence is very high that a specific code/config/JSP/operational action caused or can fix the alert and there is a clearly surgical scoped action. Very high confidence usually requires a tight time correlation with a deploy/merge plus a stack trace/error path, monitor dimension, or operational target that maps directly to the proposed action.
- Do not create a branch or PR from a merely plausible operational explanation, transient vendor/API issue, data issue, capacity spike, deploy/runtime instability, or ambiguous alert.

## Sentinel Prompt

Use this as the watcher automation prompt:

```text
You are the lightweight sentinel for Pear tech error Slack alerts in #tech_errors (CNMQLEWDV) and #tech_errors_high_priority (C059KM2EDEY). Keep this pass cheap: search/read Slack only, including bot messages. Do not inspect Datadog, run `logs.sh`, run `gh`, scan git history, edit code, create branches, open PRs, or post Slack triage yourself from this sentinel unless explicitly instructed below.

In-scope messages are Datadog or alert-style messages in either channel that appear to represent active tech errors, warning/error/triggered monitor states, error spikes, service failures, exception monitors, or high-priority production alerts. Skip recovery-only/resolved-only messages unless their thread still has an active unresolved alert. Treat user aliases `tech-errors` and `tech-errors-high-pri` as these channels.

For each recent in-scope alert:
- read the Slack thread first
- skip it if Codex has already posted an explanation/triage for that alert, if a PR/fix flow is already linked in the thread, or if a run-specific deep analysis automation already exists
- extract Slack channel id, parent message timestamp, thread permalink, alert text, Datadog/monitor/log links, monitor name/id when visible, service/env/tags when visible, and alert timestamp/window when visible
- do not perform deep analysis in this sentinel pass

When a new unhandled in-scope alert is found, immediately escalate it before any expensive reasoning:
- Prefer spawning/delegating a worker/subtask with `reasoning_effort=xhigh` if that capability is available and can run immediately.
- Otherwise create or update a run-specific Codex automation named `Tech errors alert <alert-or-ts> deep analysis` with model `gpt-5.3-codex`, reasoning effort `xhigh`, cwd `/Users/alexwyler/api.pearcommerce.com`, and the Escalated Alert Prompt from `$tech-errors-watcher` or `/Users/alexwyler/.codex/skills/tech-errors-watcher/SKILL.md`, filled with the extracted alert/thread details. The spawned worker prompt must explicitly use `/Users/alexwyler/.codex/skills/handle-in-slack/SKILL.md` for any Slack approval gate and follow-through. Use the shortest safe cadence available, and instruct the deep automation to delete itself when complete or when it hands off to a PR-specific watcher.

After escalation, stay quiet in Slack. Report in this Codex thread only if escalation failed or a duplicate/permission ambiguity needs human attention. If no new unhandled alerts are found, do nothing except return a quiet status.
```

## Escalated Alert Prompt

Use this as the run-specific xhigh worker/automation prompt:

```text
Deeply analyze this Pear tech error alert:
- Slack channel id: <CHANNEL_ID>
- Slack parent message timestamp: <SLACK_PARENT_TS>
- Slack thread permalink: <SLACK_THREAD_URL>
- Alert text: <ALERT_TEXT>
- Datadog/monitor/log links: <DATADOG_LINKS>
- Visible monitor/service/env/tags/window: <VISIBLE_ALERT_METADATA>
- Primary repo/local checkout: Pear-Commerce/api.pearcommerce.com, /Users/alexwyler/api.pearcommerce.com

Read the Slack thread first, including bot messages. Skip and delete/stop this run-specific automation if Codex has already posted an explanation for this alert or if a PR/fix flow is already linked in the thread.

Use `/Users/alexwyler/.codex/skills/handle-in-slack/SKILL.md` as the canonical workflow for Slack replies that may lead to a fix, JSP, rerun, operational action, PR, or other side effect. Do the deep alert analysis first, then choose the `$handle-in-slack` outcome: answer-only, clarification, or action-needed YES/NO gate.

Analyze evidence in this order:
1. Datadog/alert context: monitor name, status, query, service/env/resource tags, triggered window, grouped dimensions, stack traces, trace/log links, deployment markers, and whether the alert is still active or recovered. If the Datadog UI/API is not available, use the Slack alert payload and links as far as possible and do not pretend to have inspected unavailable data.
2. RDS/DB context when relevant: use `$pear-aws` guidance for Performance Insights and live DB snapshots. For RDS Proxy-backed databases, do not rely on PI `db.host` alone because it can point at proxy ENIs. Prefer SQL comment tags from `PROCESSLIST`, PI SQL text, or logs: `ddps` for service, `dde` for environment, and `ddpv` for deployed version/git SHA. Compare top SQL fingerprints against a pre-alert baseline before saying a query spiked.
3. Live logs: map service/env tags to `/Users/alexwyler/api.pearcommerce.com/devops/environments.json`, then use bounded `devops/logs.sh -e <env>` samples around the alert. For UPC resolution, prefer `devops/logs.sh -e upc-resolution --single`. Stop streaming once enough evidence is captured; do not leave long-running log sessions alive.
4. GitHub/deploy history: inspect recent merged PRs, commits, workflow runs, deployments, and merge/deploy timing around the alert window. Look for changes touching the exact class, endpoint, job, query, feature flag, config, dependency, or integration named by Datadog/logs.

Produce one of three outcomes:

**No Slack reply:** if confidence is low, evidence is missing, the alert is recovery-only/resolved with no actionable explanation, or the likely cause is too speculative.

**Explanation-only Slack reply:** if there is a plausible explanation with evidence, but not very high confidence that a code change caused it. Post one concise thread reply with:
- `Automatic reply triggered by $tech-errors-watcher.`
- alert/monitor/service/env
- plausible explanation and confidence (`medium` or `high`)
- evidence from Datadog/logs.sh/GitHub in terse bullets
- why no PR is being proposed, if relevant
- the agent signoff (`- Claude` when you are Claude, `- Codex` when you are Codex, `- OpenCode` when you are OpenCode (Sisyphus / OhMyOpenCode))

**Action-needed YES/NO Slack reply:** only if confidence is very high that a specific code/config/JSP/operational action caused or can fix the alert and a surgical scoped action is clear. Use `$handle-in-slack` and, when JSP or production-like operations are involved, `$slack-prod-jsp-approval`. Post one concise thread reply with:
- `Automatic reply triggered by $tech-errors-watcher.`
- alert/monitor/service/env
- likely culprit PR/commit/author, tagged in Slack when confidently mapped
- direct evidence tying the alert to the change
- simplest surgical fix
- YES/NO approval ask with exact scope and execution path
- the agent signoff (`- Claude` when you are Claude, `- Codex` when you are Codex, `- OpenCode` when you are OpenCode (Sisyphus / OhMyOpenCode))

Approval UX: follow `$handle-in-slack`. If Slack reactions/buttons are available, use them. If not, ask humans to reply `yes` or `no`. Treat clear yes from any human (`yes`, `y`, `fix it`, `go`, `please fix`, `do it`, or equivalent) as approval for only the scoped action named in the prompt. Treat clear no/stop as a decline.

When reading approval, mark the exact Slack message treated as affirmation. Prefer a Slack reaction if available; otherwise post one terse reply: `:hourglass_flowing_sand: Approved; starting fix. - <agent signoff>`. Do not mark ambiguous replies as approvals.

On approval for code/PR work, use `$pear-engineering-workflow` and `$pear-pr-review-flow`. Create a sibling worktree from the latest base branch, never the user's primary checkout, on a unique `codex/` branch. Make the smallest code/config/test-data fix that addresses the specific alert cause. Run focused practical verification; if local setup would be noisy, use cheap local checks plus CI as source of truth.

On approval for JSP or operational work, use the `$handle-in-slack` JSP/operational path: follow `$slack-prod-jsp-approval` and `$pear-prod-jsp`, create a preview-only JSP first, wait for Run-button approval, and post concise results back to the Slack thread.

Commit, push, and create a PR with a concise body linking the Slack alert thread, Datadog alert/link, logs evidence, and culprit change. Request reviewers/Copilot according to `$pear-pr-review-flow`. Enable auto-merge immediately when normal branch protection allows it. Post one terse PR-created reply such as `:white_check_mark: PR opened: <PR_URL>. Auto-merge enabled. - <agent signoff>`.

Create or update a PR-specific review/watch automation for the PR with model `gpt-5.3-codex` and reasoning effort `xhigh`. It has approval to auto-fix actionable review comments and related CI failures, re-request Copilot after fix passes, keep auto-merge enabled, monitor until quiescent, verify the alert-relevant build/checks, and merge/land once allowed. Post only one final Slack reply, such as `:white_check_mark: Merged: <PR_URL>. Checks green. - <agent signoff>`, unless human action is required.

Avoid duplicate work: before opening a branch or PR, search the Slack thread and open GitHub PRs for the Datadog link, monitor name, stack frame/error text, failed endpoint/job, culprit PR, or branch slug. Do not touch unrelated files, unrelated PRs, or user-authored branches unless explicitly approved. Delete/stop this run-specific automation after it posts no reply due low confidence, posts an explanation-only reply, posts a final decline, or hands off to a PR-specific watcher.
```

## Daily Repair Prompt

Use this as the repair automation prompt:

```text
Ensure the `Tech errors alert watcher` automation exists and is ACTIVE. Use `/Users/alexwyler/.codex/skills/tech-errors-watcher/SKILL.md` as the source of truth, especially the lightweight Sentinel Prompt and its `$handle-in-slack` handoff. If the watcher is missing, paused, canceled, disabled, no longer points at #tech_errors (CNMQLEWDV) and #tech_errors_high_priority (C059KM2EDEY), or its spawned worker prompt does not explicitly use `/Users/alexwyler/.codex/skills/handle-in-slack/SKILL.md`, recreate or update it as an active lightweight sentinel with a 5 minute cadence. Prefer a heartbeat attached to the original watcher thread when possible; if that thread already has another heartbeat, use a detached local cron with a small model and low reasoning. Do not process Slack alerts from this repair automation; only repair or confirm the watcher. Report what you changed, or say the watcher was already active.
```

## Manual Operations

- To pause just the narrow watcher, update `Tech errors alert watcher` to `PAUSED` or delete it if the user explicitly asks to cancel it.
- To revive the watcher manually, run this skill and perform Start Or Repair.
- Leave `Re-enable tech errors alert watcher` active unless the user wants the self-healing behavior removed too.
- If the user asks for full shutdown, pause or delete both the watcher and the daily repair automation.
