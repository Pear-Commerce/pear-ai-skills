---
name: slack-task-gate
description: Gate Slack-sourced Codex work behind an explicit yes/no request. Use when the user provides a Slack message or thread and asks Codex to ask someone whether Codex should fix, run, investigate, create a JSP/PR/script, rerun data, or otherwise do a task; when the user says "ask them if they want Codex to fix it/do it"; or when Codex should request required scope such as vendorIds, retailer names, IDs, links, env, or an approved proposed list before acting.
---

# Slack Task Gate

## Overview

Use this skill to turn a Slack message into a safe, actionable permission gate. The reply should ask the relevant person for an explicit `yes` or `no`, require the missing scope needed to do the work, and describe what Codex will do only if they approve.

This skill is for Slack replies that authorize a later task. It does not replace the task-specific skill for the eventual work; use it first, then use the task-specific skill only after the Slack thread gives approval and scope.

## Companion Skills

Use `slack` to read the source message or thread before replying. Use `slack-outgoing-message` for the actual Slack text and send behavior.

If the gated work would need another Pear skill later, name the expected follow-up path in plain language, but do not load or execute that workflow until the Slack participant says yes. Examples: creating a JSP, making a PR, rerunning UPC resolution, checking production logs, fixing CI, or posting a final summary.

## Workflow

1. Read the Slack context.
   - Open the exact message or parent thread from the user-provided URL.
   - Identify who asked the question and who should answer the gate.
   - Preserve the destination channel and thread. Replies usually go to the same thread.

2. Decide what information is required before Codex can act.
   - Ask for exact IDs and names, not vague labels, when the eventual task touches data or code. For example: `vendorId` and vendor name, retailer enum/name, UPCs, offer IDs, PR number, environment, ZIP/store, or an explicit approved proposed list.
   - If the user asked for an analysis first, do the read-only analysis before replying, then include the proposed scope in the gate.
   - If the current Slack message already includes all scope, still ask for `yes`/`no` unless the user explicitly told Codex to proceed.

3. Write the Slack reply.
   - Start with the person mention when it is resolvable, for example `<@U123>`.
   - Ask for `yes` or `no` in a clear bullet.
   - Ask for the required scope in the same reply.
   - State exactly what Codex will do if the answer is yes.
   - Promise a summary back to the same thread when the follow-up work completes.
   - Keep the message concise and do not over-format.

4. Do not act early.
   - Do not create the JSP, PR, branch, script, DB write, rerun, or external side-effect while only asking for approval.
   - Do not imply approval was granted.
   - If the participant answers `no`, acknowledge if needed and stop.
   - If the participant answers `yes` without enough scope, ask for the missing IDs/names before acting.

## Reply Shape

Use a shape like this, adapted to the thread:

```text
<@USER> yes, Codex can do this once you confirm the scope.

Can you reply with:
- `yes` or `no` on whether you want Codex to run/fix/create this
- if yes: the exact <IDs/names/links/env> to include, or `yes, use your proposed list`

If yes, I’ll <specific bounded task>, keep it scoped to those targets, and post the summary/results back in this thread.

- <Claude or Codex, matching the agent posting>
```

For analysis-backed gates, include a short evidence block before the yes/no ask:

```text
Quick read-only scan:
- <count/finding 1>
- <count/finding 2>
- Proposed scope: <short list>

Can you reply with:
- `yes` or `no`
- if yes: exact <IDs/names>, or `yes, use your proposed list`
```

## Guardrails

- Resolve Slack user mentions before using `<@...>`. If the person cannot be resolved, write the reply without a fake mention and tell the user.
- Avoid broad mentions such as `@channel`, `@here`, and `@everyone`.
- Ask for both IDs and human-readable names when an eventual task would touch production-like data.
- Include environment language when relevant, especially TEST/PROD distinctions.
- Keep approval bounded. A `yes` to one vendor list, PR, JSP, or retailer scope is not approval for adjacent work.
- If the gate would authorize production data writes or live external side effects, say the follow-up will have its own preview/summary when the relevant task-specific workflow requires it.
- Do not use this skill to bypass existing approval rules in `pear-prod-jsp`, PR review/merge flows, browser actions, or Slack write safety.
