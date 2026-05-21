---
name: slack-technical-question-watcher
description: Start, restart, or repair the Codex automation that watches Pear Slack #eng-help, #pulse-internal, #customer-success, and #engineering for explicit bug reports or technical questions, investigates with code/tools, and posts concise evidence-based thread replies.
metadata:
  short-description: Watch Slack for technical questions and reply with investigated answers
---

# Slack Technical Question Watcher

Use this skill when asked to start, restart, re-enable, inspect, recreate, modify, or push the Slack watcher that answers explicit Pear technical questions or bug reports from shared Slack channels.

For automation architecture and prompt style, follow `$slack-approval-pr-automation`. For code/PR work after explicit approval, use `$pear-engineering-workflow` and `$pear-pr-review-flow`.

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

## Watcher Prompt

Use this as the watcher automation prompt. Fill `<START_LOCAL_TIME>` and `<START_SLACK_EPOCH>` when creating or materially resetting the watcher:

```text
Watch Pear Slack for new, explicit engineering bug reports or technical questions in these channels:
- #eng-help, channel ID C035Q6QTX41
- #pulse-internal, channel ID C082CDY96BC
- #customer-success, channel ID C03A31MS4F3
- #engineering, channel ID C07RNCXKWJU

This watcher starts at <START_LOCAL_TIME> / Slack epoch <START_SLACK_EPOCH>. Do not backfill older messages unless a newer in-scope message explicitly asks about that older thread.

Use the Slack Approval PR Automation pattern, but this watcher is for analysis replies, not automatic PR creation. Keep routine passes cheap. On each pass, search/read Slack only first, including recent thread context. Look back roughly 45 minutes, and up to 2 hours if the previous pass may have been missed.

In scope: messages that are clearly asking for technical help or reporting a bug, failure, data issue, integration issue, Pulse/reporting issue, API/job/test/runtime error, missing expected behavior, stack trace, broken customer workflow, or a concrete "why is X happening / can someone investigate" engineering question. In #customer-success, only treat it as in scope when the message is explicitly technical and about Pear product/data/system behavior.

Out of scope: vague complaints without an investigable system/question, product planning, prioritization, status asks, announcements, launch coordination, sales/business questions, user access requests unless clearly technical, messages already handled by a human answer, messages from Codex, bot noise, resolved-only items, and anything where replying would likely add noise.

For each candidate message:
- read the thread before doing any analysis
- skip if Codex already posted a reply in the thread, including replies ending `- Codex` or legacy `Thanks,\nCodex`
- skip if the thread already has a linked PR/fix flow or a run-specific automation for the same item
- skip if a human has already provided a concrete answer/fix that appears sufficient
- extract the channel id, parent timestamp, message permalink, short problem statement, named customer/vendor/retailer/system, URLs, IDs, UPCs, SKUs, account/vendor IDs, stack traces, and any explicitly requested output

When a new unhandled in-scope item is found, do the work Alex would normally ask Codex to do for an investigation, using read-only tools by default:
- search the Slack thread and relevant Slack history for context
- search the local codebase at /Users/alexwyler/api.pearcommerce.com with `rg`/git as needed
- inspect relevant tools/connectors, GitHub issues/PRs, logs, Snowflake/DB/reporting sources, DevRev links, browser pages, or web sources when they are the source of truth and safe to read
- use bounded, read-only queries and commands; do not leave sessions running
- do not edit files, create branches, open PRs, run production-write JSPs, mutate DBs, or change external state unless the Slack message explicitly asks Codex/Alex for that exact action and the needed approval is present

Post at most one concise thread reply per item only when you have a useful, evidence-based answer. The reply must:
- start with `Automatic reply triggered by Slack technical question watcher.`
- summarize the likely answer/root cause and confidence
- include the key evidence trail, with concrete IDs/tables/files/commands or links where useful
- say what should happen next, especially if a rerun/deploy/data refresh/owner decision is needed
- tag a likely owner only when evidence strongly supports it
- avoid secrets, credentials, private query outputs, or noisy implementation logs
- end with `- Codex`

If confidence is low, tools are unavailable, the question is too ambiguous, or the investigation would require risky mutation, stay quiet in Slack unless a short clarification request would be clearly helpful. Prefer no reply over speculative noise.

If a message explicitly asks for a code fix/PR and the root cause is concrete, ask for yes/no approval in the thread before making changes unless Alex already gave explicit approval in that thread. After approval, follow Pear engineering workflow and Pear PR review flow, use a sibling worktree from latest master, keep the fix surgical, and post only the PR link/final status in the original Slack thread.

When no new unhandled in-scope messages are found, return a quiet heartbeat status only.
```

## Daily Repair Prompt

Use this as the repair automation prompt:

```text
Ensure the `Slack technical question watcher` automation exists and is ACTIVE. Use `/Users/alexwyler/.codex/skills/slack-technical-question-watcher/SKILL.md` as the source of truth, especially the Watcher Prompt and Scope Policy. If the watcher is missing, paused, canceled, disabled, or no longer points at #eng-help C035Q6QTX41, #pulse-internal C082CDY96BC, #customer-success C03A31MS4F3, and #engineering C07RNCXKWJU with the explicit-bug-report/technical-question scope, recreate or update it as an active heartbeat attached to the original Codex thread using a 10 minute cadence. It should start from its creation time and should not backfill old Slack messages. Do not process Slack messages, run codebase investigations, or post Slack replies from this repair automation; only repair or confirm the watcher. Report what you changed, or say the watcher was already active.
```

## Manual Operations

- To pause just the watcher, update `Slack technical question watcher` to `PAUSED` or delete it if the user explicitly asks to cancel it.
- To revive the watcher manually, run this skill and perform Start Or Repair.
- Leave `Re-enable Slack technical question watcher` active unless the user wants the self-healing behavior removed too.
- If the user asks for full shutdown, pause or delete both the watcher and the daily repair automation.
