---
name: slack-approval-pr-automation
description: Create, restart, or repair Slack watcher automations that stay lightweight while scanning, escalate real findings to high-reasoning analysis/fix workers, use $handle-in-slack for Slack YES/NO approval and follow-through, create PRs, and run PR-specific watch/merge automations. Use for Slack-to-GitHub or Slack-to-PR workflows that need dedupe, approval gates, spawned worker prompts, and model/reasoning tiering.
metadata:
  short-description: Create staged Slack-to-PR automations
---

# Slack Approval PR Automation

Use this skill when asked to create or update a Slack watcher that:

- watches a channel/thread pattern for actionable messages
- keeps routine polling cheap
- escalates only real work to high or xhigh reasoning
- uses `$handle-in-slack` to ask humans for YES/NO approval in Slack before edits or side effects
- creates and watches PRs after approval
- optionally auto-fixes review/CI feedback and auto-lands when allowed

For Slack analyze/gate/execute behavior, use `$handle-in-slack` as the canonical source of truth in both the sentinel prompt and any spawned deep worker prompt. For Pear engineering repos, also use `$pear-engineering-workflow` before code edits and `$pear-pr-review-flow` for PR creation, review requests, PR watchers, and landing.

## Architecture

Default to four automations:

- **Sentinel watcher:** frequent heartbeat; Slack search/read/dedupe only. No GitHub logs, no code, no PRs, no Slack triage.
- **Deep triage worker:** run-specific xhigh worker or cron automation created only for a new unhandled finding.
- **PR watcher:** PR-specific high/xhigh automation created only after approval and PR creation.
- **Repair cron:** daily low-reasoning automation that re-enables or recreates the sentinel if it is missing or paused.

Model defaults when the automation tool supports them:

- Sentinel: cheapest reliable model with low reasoning. If heartbeat model controls are unavailable, keep the sentinel prompt narrow.
- Deep triage worker: `gpt-5.3-codex`, `xhigh`.
- PR watcher while active: `gpt-5.3-codex`, `xhigh`; relax cadence after quiet green passes.
- Repair cron: small model such as `gpt-5.4-mini`, `low`.

## Inputs

Before creating automations, collect or infer:

- Slack channel name and ID.
- Trigger text/link patterns and any required repository or environment scope.
- GitHub repo, base branch, local primary checkout, and safe sibling worktree parent.
- What counts as duplicate work: existing Codex triage, linked PR, run-specific automation, issue, branch slug, or thread marker.
- Approval phrases for yes and no/stop.
- Whether approval grants auto-fix, auto-land, auto-merge, reviewer replies, or only PR creation.
- Slack message budget and signoff. Use your agent signoff for new posts: `- Claude` when you are Claude, `- Codex` when you are Codex, `- OpenCode` when you are OpenCode (Sisyphus / OhMyOpenCode).
- Daily repair schedule and target thread for the sentinel.

If the request is under-specified, make conservative defaults and include them in the created prompt.

## Creation Workflow

1. Inspect existing automations by name, prompt, channel ID, repo, trigger phrase, and target thread. Update rather than duplicate.
2. Create or update the sentinel heartbeat. Keep it cheap and explicit that it must only search/read Slack, dedupe, extract identifiers, and escalate.
3. Add or update the daily repair cron. It should not process Slack findings itself.
4. Put the deep prompt template in the skill or sentinel prompt so the sentinel can create a run-specific worker without reconstructing policy.
5. In the deep prompt, explicitly instruct the worker to use `/Users/alexwyler/.codex/skills/handle-in-slack/SKILL.md` before posting any action-needed Slack reply, then include the Slack message budget, approval semantics, code-work rules, PR watcher creation, and shutdown rules.
6. Verify automation files or tool results: IDs, `ACTIVE` status, cadence, target thread/cwds, model, and reasoning effort where supported.
7. Sync any newly created or edited skill copies from the canonical source before finishing.

## Slack Rules

Keep Slack calm. Per finding thread, default to only:

- one original triage reply with the likely owner/author tag when evidence supports it
- one terse approval-start marker, preferably a reaction if the Slack tool supports reactions, otherwise an emoji-prefixed thread reply
- one terse PR-created reply with the PR link and auto-merge/auto-land status
- one terse merge/final reply with the PR and final build/result link

Do not post separate implementation logs, local check summaries, watcher-created notices, auto-merge notices, or intermediate CI updates unless a human needs to act.

If the available Slack tool cannot add reactions, use terse replies such as:

```text
:hourglass_flowing_sand: Approved; starting fix. - <Claude, Codex, or OpenCode, matching the agent posting>
```

End agent-authored Slack posts, GitHub replies, PR bodies, and commit messages with your agent signoff — `- Claude` when you are Claude, `- Codex` when you are Codex, `- OpenCode` when you are OpenCode (Sisyphus / OhMyOpenCode):

```text
- <Claude, Codex, or OpenCode, matching the agent posting>
```

When detecting agent-authored prior work, treat `- Claude`, `- Codex`, `- OpenCode`, and legacy `Thanks,\nCodex` as agent signatures.

## Sentinel Prompt Template

Use this for the lightweight watcher, filling placeholders:

```text
You are the lightweight sentinel for <CHANNEL_NAME> (channel ID <CHANNEL_ID>) <SYSTEM_OR_REPO> findings. Keep this pass cheap: search/read Slack only, including bot messages. Do not inspect GitHub logs, run expensive CLI commands, scan git history, edit code, create branches, open PRs, or post Slack triage yourself from this sentinel unless explicitly instructed below.

Target messages match:
- <TRIGGER_PATTERN_1>
- <TRIGGER_PATTERN_2>

For each recent in-scope message:
- read the Slack thread first
- skip it if Codex has already posted triage for that item, if a PR/fix flow is already linked in the thread, or if a run-specific deep triage/fix automation already exists
- extract <IDENTIFIERS_TO_EXTRACT>, Slack channel id, parent message timestamp, thread permalink, and any obvious existing approval/decline replies
- do not perform deep analysis in this sentinel pass

When a new unhandled in-scope finding is found, immediately escalate it before any expensive reasoning:
- Prefer spawning/delegating a worker/subtask with reasoning_effort=xhigh if available and immediate.
- Otherwise create or update a run-specific Codex automation named `<AUTOMATION_PREFIX> <ITEM_ID> deep triage` with model `gpt-5.3-codex`, reasoning effort `xhigh`, cwd `<LOCAL_CWD>`, and the Escalated Triage Prompt from this skill or from the task-specific watcher skill, filled with the extracted identifiers and Slack thread data. The spawned worker prompt must explicitly use `/Users/alexwyler/.codex/skills/handle-in-slack/SKILL.md` for any Slack approval gate and follow-through.

After escalation, stay quiet in Slack. Report in the Codex thread only if escalation failed or a duplicate/permission ambiguity needs human attention. If no new unhandled findings are found, do nothing except return a quiet status.
```

## Deep Triage Prompt Template

Use this for run-specific xhigh analysis/fix workers:

```text
Deeply triage this <SYSTEM_OR_REPO> finding:
- Slack channel: <CHANNEL_ID>
- Slack parent message timestamp: <SLACK_PARENT_TS>
- Slack thread permalink: <SLACK_THREAD_URL>
- Source URL/id: <SOURCE_URL_OR_ID>
- Repo: <OWNER/REPO>
- Local primary checkout: <LOCAL_CWD>

Read the Slack thread first. Skip and delete/stop this run-specific automation if Codex has already posted triage for this item or if a PR/fix flow is already linked in the thread.

Use `/Users/alexwyler/.codex/skills/handle-in-slack/SKILL.md` as the canonical workflow for Slack replies that may lead to a fix, PR, JSP, rerun, operational action, or other side effect. Do read-only analysis first, then choose the `$handle-in-slack` outcome: answer-only, clarification, or action-needed YES/NO gate.

Inspect the source of truth for the failure or request. For GitHub Actions, inspect run status, failed jobs, annotations, and logs. Determine:
- concrete failing job/test/build step or requested change
- important error text or stack frame, paraphrased when long
- likely root cause
- smallest surgical fix
- likely culprit PR/commit/author when applicable

Before posting, search for duplicate work by source URL/id, failed test name, branch slug, Slack thread links, and open PRs.

Post one concise original Slack thread reply that starts with `Automatic reply triggered by <SKILL_OR_AUTOMATION_NAME>.` Include the findings above, the likely owner/author tag when evidence supports it, and use `$handle-in-slack` for the YES/NO approval ask, exact scope, and execution path. End with your agent signoff.

Treat clear yes replies from any human (`yes`, `y`, `fix it`, `go`, `please fix`, `do it`, or equivalent) as approval to perform the approved scope. Treat clear no/stop as a decline. If no approval has arrived, stay quiet except for notable blockers in the Codex thread. If declined, acknowledge once in Slack and delete/stop this run-specific automation.

On approval, mark the approval message. Prefer a Slack reaction if available; otherwise post `:hourglass_flowing_sand: Approved; starting fix. - <agent signoff>`.

For Pear engineering PR work, use `$pear-engineering-workflow` and `$pear-pr-review-flow`. Create a sibling worktree from the latest base branch, never the user's primary checkout, on a unique `codex/` branch. Make the smallest code/test-data/config/docs fix that addresses the specific finding. Run focused practical verification; if local setup would be noisy, use cheap local checks and CI as the source of truth when appropriate.

Commit, push, and create a PR with a concise body linking the Slack thread and source item. Request reviewers/Copilot according to the repo workflow. Enable auto-merge/auto-land when the user approved it and normal branch protection allows it. Post one terse PR-created Slack reply, such as `:white_check_mark: PR opened: <PR_URL>. Auto-merge enabled. - <agent signoff>`.

Create or update a PR-specific watcher with model `gpt-5.3-codex` and reasoning effort `xhigh` while active. The PR watcher should inspect all feedback/CI surfaces, auto-fix only approved categories, re-request review after fixes, keep auto-merge enabled if approved, verify quiescence, merge/land when allowed, post one terse final Slack reply, and delete/stop itself when done.

Delete/stop this run-specific automation after it has posted a final decline, handed off to a PR watcher, or completed a no-op duplicate skip.
```

## PR Watcher Prompt Requirements

When creating the PR watcher, include:

- exact PR URL/number, repo, branch, worktree path, Slack thread, and original source item
- whether auto-fix is approved
- whether auto-land/auto-merge is approved
- all feedback surfaces to inspect: review threads, flat comments, top-level comments, requested-changes reviews, bots, Copilot, check annotations, mergeability, branch status, and required checks
- branch refresh rule: rebase against the latest base before material push unless unsafe
- focused verification plan and CI-first guardrail
- terse Slack budget: PR link already posted, only final merge/blocker Slack message unless human action is needed
- shutdown rule after merge, decline, duplicate skip, or impossible blocker

For Pear PRs, defer reviewer, Copilot, reply tone, branch refresh, and landing details to `$pear-pr-review-flow`.

## Repair Prompt Template

Use a low-reasoning daily cron:

```text
Ensure the `<SENTINEL_NAME>` automation exists and is ACTIVE. Use `<SKILL_PATH>` as the source of truth, especially the lightweight Sentinel Prompt. If the watcher is missing, paused, canceled, disabled, or no longer points at <CHANNEL_ID>/<TRIGGER_SCOPE>, recreate or update it as an active heartbeat attached to <TARGET_THREAD_ID> using the standard short cadence. Do not process Slack findings from this repair automation; only repair or confirm the watcher. Report what you changed, or say the watcher was already active.
```

## Final Check

Before finishing a new watcher setup, confirm:

- sentinel exists, is active, and is narrow enough to stay cheap
- repair cron exists, is active, and uses a low model/reasoning setting when supported
- deep worker prompt exists somewhere the sentinel can reference
- PR watcher instructions capture approval scope and shutdown behavior
- Slack output budget and the agent signoff (`- Claude`, `- Codex`, or `- OpenCode`) are present
- duplicate detection accepts legacy `Thanks,\nCodex` and current `- Claude`/`- Codex`/`- OpenCode`
- no unrelated files or user-authored branches were touched
