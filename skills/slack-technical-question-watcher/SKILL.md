---
name: slack-technical-question-watcher
description: Use for starting, repairing, or debugging the Codex watcher for Pear Slack technical questions and bug reports in #eng-help, #pulse-internal, #customer-success, and #engineering; it investigates, replies with evidence, and delegates gated fixes or ops to $handle-in-slack.
metadata:
  short-description: Watch Slack for technical questions and reply with investigated answers
---

# Slack Technical Question Watcher

Use this skill when asked to start, restart, re-enable, inspect, recreate, modify, or push the Slack watcher that answers explicit Pear technical questions or bug reports from shared Slack channels.

For Slack analyze/gate/execute behavior, use `$handle-in-slack` as the canonical source of truth. For automation architecture and prompt style, follow `$slack-approval-pr-automation`. For code/PR work after explicit approval, always use `$pear-engineering-workflow` and `$pear-pr-review-flow`.

## Defaults

- Slack channels:
  - `#eng-help`, channel ID `C035Q6QTX41`
  - `#pulse-internal`, channel ID `C082CDY96BC`
  - `#customer-success`, channel ID `C03A31MS4F3`
  - `#engineering`, channel ID `C07RNCXKWJU`
- Primary repo/local checkout: `Pear-Commerce/api.pearcommerce.com`, `/Users/alexwyler/api.pearcommerce.com`.
- Watcher automation name: `Slack technical question watcher`.
- Daily repair automation name: `Re-enable Slack technical question watcher`.
- Architecture: one lightweight heartbeat watcher plus one low-reasoning daily repair cron. The watcher may perform bounded read-only investigation before replying, but it must stay selective and quiet.

## Start Or Repair

1. Inspect existing automations by name, prompt, channel IDs, and target thread before creating duplicates.
2. Create or update the watcher as an active heartbeat attached to the current thread. Use a 10 minute cadence unless the user requests another interval.
3. Set the watcher start boundary to the current local time and Slack epoch. Do not backfill older messages unless a newer in-scope message explicitly asks about an older thread.
4. Create or update the daily repair automation as a standalone local cron. Schedule it for 8:15 AM America/Chicago and use a small model/low reasoning when supported.
5. Confirm both automations are active and summarize their IDs/names.

## Scope Policy

The watcher should be helpful without becoming Slack noise.

- **In scope:** clear technical help requests, bug reports, failures, data issues, integration issues, Pulse/reporting issues, API/job/test/runtime errors, missing expected behavior, stack traces, broken customer workflows, and concrete "why is X happening / can someone investigate" engineering questions.
- **Extra care in `#customer-success`:** only respond when the message is explicitly technical and about Pear product, data, or system behavior.
- **Out of scope:** vague complaints without an investigable system/question, product planning, prioritization, status asks, announcements, launch coordination, sales/business questions, user access requests unless clearly technical, already-answered threads, messages from Codex, bot noise, resolved-only items, and anything where replying would likely add noise.
- Prefer no Slack reply over a speculative reply. If confidence is low, tools are unavailable, or the investigation would require risky mutation, stay quiet unless a short clarification request would clearly help.

## Pear PR Gate

When a Slack investigation turns into any Pear PR operation, this gate is mandatory. It applies to creating a PR, making a draft PR real/ready, updating a PR branch, adding reviewers, requesting Copilot, watching a PR, or landing a PR. Short user phrases such as "make the PR real", "open the PR", "make it ready", "post the PR", "watch it", or "land it" count as PR operations.

Before creating, readying, or updating a PR in a Pear repo:

- load and follow `$pear-engineering-workflow`
- load and follow `$pear-pr-review-flow`
- use a sibling `codex/` worktree unless the current checkout is already task-owned for this exact PR/thread
- complete the Pear engineering Pre-PR Cleanup Gate, including the PR-improvement guide, final diff cleanup, and focused verification or a clear statement that verification was blocked
- create or update the PR with the agent authorship signature (`- Claude` for Claude, `- Codex` for Codex, `- OpenCode` for OpenCode (Sisyphus / OhMyOpenCode)) when the agent authored the body
- request individual engineering reviewers and GitHub Copilot through the PR review flow, verifying the Copilot request in the timeline when possible
- create or update the PR-specific watch automation with the user's approved auto-fix/auto-land scope, or set it report-only if approval is absent
- include the PR URL and reviewer/Copilot/watch status in the Slack thread reply or final user response

Do not use raw GitHub connector/CLI PR creation or draft-to-ready changes as a shortcut around this gate. If any PR-flow step is unavailable, continue only as far as is safe and explicitly report the missing step.

## Watcher Prompt

Use this as the watcher automation prompt. Fill `<START_LOCAL_TIME>` and `<START_SLACK_EPOCH>` when creating or materially resetting the watcher:

```text
Watch Pear Slack for new, explicit engineering bug reports or technical questions in these channels:
- #eng-help, channel ID C035Q6QTX41
- #pulse-internal, channel ID C082CDY96BC
- #customer-success, channel ID C03A31MS4F3
- #engineering, channel ID C07RNCXKWJU

This watcher starts at <START_LOCAL_TIME> / Slack epoch <START_SLACK_EPOCH>. Do not backfill older messages unless a newer in-scope message explicitly asks about that older thread.

Use the Slack Approval PR Automation pattern and `/Users/alexwyler/.codex/skills/handle-in-slack/SKILL.md` as the canonical analyze -> YES/NO gate -> execute flow. This watcher is for analysis replies and approval-gated follow-through, not automatic PR creation. Keep routine passes cheap. On each pass, search/read Slack only first, including recent thread context. Look back roughly 45 minutes, and up to 2 hours if the previous pass may have been missed.

In scope: messages that are clearly asking for technical help or reporting a bug, failure, data issue, integration issue, Pulse/reporting issue, API/job/test/runtime error, missing expected behavior, stack trace, broken customer workflow, or a concrete "why is X happening / can someone investigate" engineering question. In #customer-success, only treat it as in scope when the message is explicitly technical and about Pear product/data/system behavior.

Out of scope: vague complaints without an investigable system/question, product planning, prioritization, status asks, announcements, launch coordination, sales/business questions, user access requests unless clearly technical, messages already handled by a human answer, messages from Codex, bot noise, resolved-only items, and anything where replying would likely add noise.

For each candidate message:
- read the thread before doing any analysis
- skip if an agent already posted a reply in the thread, including replies ending `- Claude`, `- Codex`, `- OpenCode`, or legacy `Thanks,\nCodex`
- skip if the thread already has a linked PR/fix flow or a run-specific automation for the same item
- skip if a human has already provided a concrete answer/fix that appears sufficient
- extract the channel id, parent timestamp, message permalink, short problem statement, named customer/vendor/retailer/system, URLs, IDs, UPCs, SKUs, account/vendor IDs, stack traces, and any explicitly requested output

When a new unhandled in-scope item is found, follow `$handle-in-slack`:
- read the full Slack context
- do the bounded read-only investigation Alex would normally ask Codex to do
- choose answer-only, clarification, or action-needed YES/NO approval gate

Use read-only tools by default:
- search the Slack thread and relevant Slack history for context
- search the local codebase at /Users/alexwyler/api.pearcommerce.com with `rg`/git as needed
- inspect relevant tools/connectors, GitHub issues/PRs, logs, Snowflake/DB/reporting sources, DevRev links, browser pages, or web sources when they are the source of truth and safe to read
- use bounded, read-only queries and commands; do not leave sessions running
- do not edit files, create branches, open PRs, run production-write JSPs, mutate DBs, or change external state unless the Slack message explicitly asks Codex/Alex for that exact action and the needed approval is present

Post at most one short thread reply per item only when you have a useful, evidence-based answer. Keep it brief: usually 3-5 bullets or a short paragraph plus bullets. The reply must:
- start with `Automatic reply triggered by Slack technical question watcher.`
- give a one-line likely answer/root cause with confidence
- include only the key evidence needed to trust the answer; avoid long evidence dumps
- include one concrete next step when a rerun/deploy/data refresh/owner decision is needed
- tag a likely owner only when evidence strongly supports it
- avoid secrets, credentials, private query outputs, or noisy implementation logs
- end with your agent signoff: `- Claude` when you are Claude, `- Codex` when you are Codex, `- OpenCode` when you are OpenCode (Sisyphus / OhMyOpenCode)

If confidence is low, tools are unavailable, the question is too ambiguous, or the investigation would require risky mutation, stay quiet in Slack unless a short clarification request would be clearly helpful. Prefer no reply over speculative noise.

If a concrete fix, PR, JSP, rerun, resolver/import/availability scan, or other side effect is appropriate, use `$handle-in-slack` to post the concise YES/NO approval prompt before making changes unless the thread already contains explicit approval for that exact scoped action. After approval:
- for code/PR work, the Pear PR Gate from `$slack-technical-question-watcher` remains mandatory: load `$pear-engineering-workflow` and `$pear-pr-review-flow`, use a sibling worktree from latest master, complete the Pre-PR Cleanup Gate, keep the fix surgical, request individual engineering reviewers and GitHub Copilot, verify Copilot when possible, create or update a PR-specific watch automation with the approved auto-fix/auto-land scope, and post only the PR link/final status in the original Slack thread
- for JSP or operational work, follow `$handle-in-slack`, `$slack-prod-jsp-approval`, and `$pear-prod-jsp`: create a preview-only JSP first, wait for Run-button approval, then post concise results in the original Slack thread

If any required follow-through step is unavailable, say exactly which step is missing instead of silently skipping it.

When no new unhandled in-scope messages are found, return a quiet heartbeat status only.
```

## Daily Repair Prompt

Use this as the repair automation prompt:

```text
Ensure the `Slack technical question watcher` automation exists and is ACTIVE. Use `/Users/alexwyler/.codex/skills/slack-technical-question-watcher/SKILL.md` as the source of truth, especially the Watcher Prompt, Scope Policy, and `$handle-in-slack` handoff. If the watcher is missing, paused, canceled, disabled, or no longer points at #eng-help C035Q6QTX41, #pulse-internal C082CDY96BC, #customer-success C03A31MS4F3, and #engineering C07RNCXKWJU with the explicit-bug-report/technical-question scope, recreate or update it as an active heartbeat attached to the original Codex thread using a 10 minute cadence. It should start from its creation time and should not backfill old Slack messages. Do not process Slack messages, run codebase investigations, or post Slack replies from this repair automation; only repair or confirm the watcher. Report what you changed, or say the watcher was already active.
```

## Manual Operations

- To pause just the watcher, update `Slack technical question watcher` to `PAUSED` or delete it if the user explicitly asks to cancel it.
- To revive the watcher manually, run this skill and perform Start Or Repair.
- Leave `Re-enable Slack technical question watcher` active unless the user wants the self-healing behavior removed too.
- If the user asks for full shutdown, pause or delete both the watcher and the daily repair automation.
