---
name: handle-in-slack
description: Analyze and handle a Slack message or thread. "Handle" can mean a read-only investigation followed by an explanation or recommendation, which does not require a YES/NO prompt. Use YES/NO approval only when the handling would proceed to a fix, rerun, data change, JSP, PR, external side effect, or other operational action. After posting a substantive answer, clarification, approval prompt, or completion summary, create a short-lived follow-up monitor for that Slack thread for 48 hours. Use when the user says "handle this Slack link", "handle this Slack thread", "ask them if Codex should fix it and then do it", or when Slack watcher automations need the standard analyze, optionally gate, monitor follow-ups, and execute workflow for Pear technical questions, tech errors, JSP/data operations, code fixes, PRs, reruns, resolver work, imports, or availability scans.
---

# Handle In Slack

## Overview

Use this skill as the top-level Slack handling workflow. It combines Slack context reading, evidence-backed analysis, answer-only explanations, optional YES/NO approval gating, 48-hour follow-up monitoring, JSP safety when live Pear operations are involved, and normal local Codex code/PR execution when a code fix is appropriate.

Not every "handle this" request is an action request. Sometimes the right handling is to analyze the Slack thread and reply with a clear explanation, diagnosis, or recommendation. That answer-only path is complete after the explanation is posted and should not ask for YES/NO approval unless a follow-up action is being proposed.

## Companion Skills

- Use `$slack` to read the source message, thread, channel, and user context.
- Use `$slack-outgoing-message` before posting or drafting any Slack reply.
- Use `$slack-task-gate` for the general YES/NO wording and missing-scope discipline.
- Use `$slack-prod-jsp-approval` when a JSP, live ORM/data change, vendor or retailer reimport, resolver run, availability scan, or similar operational action may be needed.
- Use `$pear-prod-jsp` for JSP preview/run safety after approval.
- Use `$pear-engineering-workflow` for any Pear `api.pearcommerce.com`, `test.api.pearcommerce.com`, Admin, Offers, or repo debugging, including read-only answer-only investigations. Use `$pear-pr-review-flow` for PRs, reviewer/Copilot flow, CI fixes, and auto-merge/watch behavior.

## Handle A Slack Link

1. Read the exact Slack message and full thread first.
   - Resolve channel, parent timestamp, permalink, requester, relevant mentioned people, prior Codex replies, linked PRs, alerts, Datadog links, IDs, vendors, retailers, accounts, UPCs, SKUs, environments, and any requested action.
   - Skip duplicate work if Codex already answered, a human already gave a sufficient answer, or an active PR/fix flow is linked.

2. Read surrounding Slack context before deciding what the message means.
   - For sparse, ambiguous, or follow-up messages, read nearby channel or DM history around the linked timestamp, normally 10-30 relevant messages before and a few after when available.
   - Use surrounding context to identify the real problem, prior decisions, named systems, and whether the message is part of an ongoing request.
   - Keep this bounded and relevant. Do not summarize or expose unrelated private context in the outgoing reply.

3. Do a comprehensive read-only source sweep.
   - For every handle request, check every available source-of-truth category that could bear on the thread before deciding the outcome. Treat each check as lightweight when the signal is low, but do not stop after Slack or one alert when other sources are available.
   - Available sources normally include Slack thread/surrounding context, Datadog monitors/events/metrics/logs, local repo/code/git history, GitHub PRs/issues/actions, environment health, app/server logs, DB/reporting/analytics data, browser/API probes, linked docs/pages, and relevant external vendor/status/docs sources.
   - If a source is unavailable, rate-limited, forbidden, unsafe, or would require a side effect or approval, record that limitation and continue with the remaining sources.
   - Keep DB/reporting checks narrow, indexed, and read-only. Avoid broad URZA/table scans; if a query starts running long or risks undo-log growth, kill that query and report the limitation instead of letting it continue.
   - Keep commands and queries read-only until there is explicit approval.
   - For Pear API requests through Cloudflare, follow `$pear-engineering-workflow`: include the trusted-edge header from the Admin/Offers deploy scripts before interpreting a plain local `curl` 403/block page as API behavior. This applies to `api.pearcommerce.com` and `test.api.pearcommerce.com` API/XHR probes; it does not apply to third-party sites, Cloudflare APIs, raw Offers page loads, or unrelated domains.
   - Stop after the source sweep produces enough evidence for either a useful answer, a concrete proposed action, or a clear request for missing scope.

4. Decide the outcome.
   - **Answer-only:** If the thread needs an explanation, diagnosis, status readout, or next-step recommendation, post an evidence-based reply. This is still "handling" the thread. Do not include a YES/NO prompt when no fix, write, rerun, PR, JSP, or external side effect is being requested.
   - **Clarification:** If the problem is real but scope is missing, ask for the exact IDs/names/env needed. Include YES/NO only if an action is likely after the scope is supplied.
   - **Action needed:** If a fix, rerun, data change, JSP, PR, or external side effect is appropriate, post a YES/NO approval prompt before acting.

5. Create or refresh a 48-hour follow-up monitor for the same Slack thread after any substantive Slack reply.
   - Do this after answer-only replies, clarification requests, YES/NO approval prompts, starting acknowledgements, PR/JSP/result summaries, and final completion summaries.
   - Skip only when the current task itself is already a short-lived follow-up monitor pass for the same thread, or when an equivalent active monitor already exists.

## Answer-Only Handling

Use this path when the user says "handle" and the Slack thread can be resolved by analysis and explanation alone.

- Do the same comprehensive read-only source sweep: read the thread, gather relevant surrounding context, and check all available source-of-truth systems that could bear on the thread, noting any unavailable or unsafe source.
- Explain what is happening, why it is happening, and what the practical next step or decision is.
- Include enough evidence to make the answer trustworthy, but avoid dumping logs, private context, or unrelated details.
- Do not ask `Reply: YES or NO` unless you are asking for permission to do follow-up work.
- If useful, end with a lightweight optional next step such as "I can turn this into a fix proposal if needed," but do not frame that as approval already being requested.
- After posting the answer, create or refresh the 48-hour follow-up monitor, then stop. A later human request to fix, rerun, change data, or open a PR starts a new gated action path.

## YES/NO Approval Prompt

Only use this section for action-needed Slack replies. Every action-needed Slack reply must make the requested human action unmistakable:

- Put `Reply: YES or NO` alone near the top of the message.
- Repeat `Reply: YES or NO` near the bottom, just above `- Codex`.
- Keep the message concise: at most three short read-only findings, one proposed action line, and one sentence explaining what happens after yes.
- Do not bury the ask under analysis. The reader should know immediately that Codex is waiting for a YES/NO decision before doing anything.

Use this shape for action-needed threads:

```text
Reply: YES or NO

Quick read-only scan:
- <evidence-backed finding>
- <evidence-backed finding>
- Proposed action: <specific bounded action and scope>

Should Codex <specific action> for <specific target/scope>?

If yes, I will <execution path>, keep it scoped to <scope>, and post results back here. If no, I will stop.

Reply: YES or NO

- Codex
```

For JSP or production-like operational work, use the stricter `$slack-prod-jsp-approval` shape. It must follow the same top-and-bottom YES/NO rule:

```text
Reply: YES or NO

Should Codex <prep/run action> for <live target/scope>?

If yes, send <names/IDs/env needed> or confirm the proposed scope.

I will prep a preview-only JSP, wait for Run-button approval, then post results here.

Reply: YES or NO

- Codex
```

## After The Reply

- For answer-only handling, there is no approval state to wait for. The work is complete after the explanation/recommendation is posted and the 48-hour follow-up monitor is active.
- After any substantive Slack reply from this skill, ensure a 48-hour follow-up monitor exists for the same Slack thread. See **48-Hour Follow-Up Monitor**.
- Treat only clear human approval as approval: `yes`, `y`, `fix it`, `go`, `please fix`, `do it`, or an equivalent unambiguous reply.
- Treat `no`, `stop`, or equivalent as a decline; acknowledge only if helpful, then stop.
- If approval is clear but scope is incomplete, ask for the missing exact IDs/names/env before acting.
- Re-read the thread immediately before acting and record the exact Slack reply that approved the work.
- Post a terse starting acknowledgement only after approval, for example `Approved; starting the scoped fix. - Codex`.

## 48-Hour Follow-Up Monitor

Create or refresh a short-lived Codex heartbeat automation for the specific Slack thread after this skill posts a substantive reply.

Purpose:

- Catch follow-up questions, objections, clarifications, or approval replies while the Slack conversation is still warm.
- Avoid making the user manually ask Codex to check the thread again.
- Stay quiet when nothing new needs a response.

Creation rules:

- Use a heartbeat automation attached to the current Codex thread.
- Use a concise name such as `Watch Slack follow-ups: <short topic>`.
- Prefer a 10-minute cadence for 48 hours. Use `FREQ=MINUTELY;INTERVAL=10;COUNT=288` when the automation runtime supports RRULE counts. If an end count is unavailable, include the 48-hour expiration timestamp in the prompt and instruct the monitor to pause/delete itself after that point.
- Start at the latest Slack reply timestamp visible immediately after the bot's own reply. Do not backfill older messages.
- Before creating, inspect existing automations for the same channel id and thread timestamp. Update/refresh the existing active monitor instead of creating a duplicate.
- The monitor should read only that Slack thread unless a new reply explicitly links elsewhere or needs bounded surrounding context.

Monitor prompt requirements:

- Include the channel id, parent thread timestamp, Slack permalink, start boundary timestamp, and expiration timestamp.
- Read the Slack thread each pass and process only new human replies after the start boundary.
- Ignore Codex/ChatGPT/bot replies and skip questions already answered by a later human or Codex reply.
- For answer-only follow-ups, post a concise evidence-based thread reply and end with `- Codex`.
- For requested side effects such as code/data changes, PRs, JSPs, reruns, Notion edits, or external writes, use this skill's YES/NO approval gate before acting unless exact scoped approval is already present.
- Prefer read-only sources. Do not mutate code, data, PRs, Notion, or external systems unless an approved action path requires it.
- When no new unhandled follow-up is present, return a quiet heartbeat status only.
- After the 48-hour window expires, pause/delete the monitor or report that the monitor window is complete, depending on what the automation runtime supports.

## Execution Paths

### JSP Or Operational Action

Use this path for production/test JSPs, live ORM/data changes, vendor or retailer reimports, resolver runs, availability scans, backfills, or other operational side effects.

1. Follow `$slack-prod-jsp-approval` and `$pear-prod-jsp`.
2. Resolve supplied names to exact IDs when safe; ask again if ambiguous.
3. Build the no-parameter JSP as a zero-side-effect preview showing exact targets and intended changes.
4. Deploy/open the preview in the right environment and wait for explicit Run-button approval.
5. After the approved run, post a concise Slack summary: target, attempted, updated, skipped, errors, and report link when available.

### Code Fix Or PR

Use this path when the action is a local code/config/test fix in a Pear repo.

1. Follow `$pear-engineering-workflow` and `$pear-pr-review-flow`.
2. Use a sibling worktree from the latest base branch unless the current checkout is already task-owned for this exact Slack thread.
3. Create a unique `codex/` branch and make the smallest fix tied to the approved scope.
4. Run focused verification or explain what blocked it.
5. Commit, push, open or update a PR, request required reviewers/Copilot, and create/update the PR-specific watcher according to Pear flow.
6. Post the PR link and concise status back in the original Slack thread. Keep subsequent Slack updates sparse unless human action is required.

### Non-PR Local Fix

Use this path only for actions that do not need a PR or JSP and are safe after explicit approval, such as a bounded local script, report, or read/write task in a non-production workspace.

1. Confirm the approved scope and destination.
2. Execute the narrow task in the local Codex thread.
3. Post a short result summary with verification and any residual risk.

## Guardrails

- Do not mutate code, data, production systems, branches, PRs, external services, or Slack state beyond the approval prompt before YES.
- Do not force a YES/NO prompt onto answer-only analysis. A read-only explanation after investigation is a valid completed handling outcome.
- Do not leave Slack follow-up monitoring open-ended. The default monitor window is 48 hours unless the user explicitly asks for a different duration.
- Do not treat ambiguous reactions, jokes, questions, or partial scope as approval.
- Do not use broad mentions like `@channel`, `@here`, or `@everyone`.
- Do not expose secrets, credentials, private query dumps, or noisy logs in Slack.
- Prefer no Slack reply over speculative noise when evidence is weak.
- Keep the approved scope narrow. A YES to one retailer, vendor, alert, account, PR, or JSP is not approval for adjacent work.
