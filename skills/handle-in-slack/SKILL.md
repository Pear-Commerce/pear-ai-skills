---
name: handle-in-slack
description: Analyze and handle a Slack message or thread with a concise read-only investigation, a clear YES/NO approval prompt for any fix or operational action, and follow-through after approval. Use when the user says "handle this Slack link", "handle this Slack thread", "ask them if Codex should fix it and then do it", or when Slack watcher automations need the standard analyze, YES/NO gate, and execute workflow for Pear technical questions, tech errors, JSP/data operations, code fixes, PRs, reruns, resolver work, imports, or availability scans.
---

# Handle In Slack

## Overview

Use this skill as the top-level Slack handling workflow. It combines Slack context reading, concise evidence-backed analysis, YES/NO approval gating, JSP safety when live Pear operations are involved, and normal local Codex code/PR execution when a code fix is appropriate.

## Companion Skills

- Use `$slack` to read the source message, thread, channel, and user context.
- Use `$slack-outgoing-message` before posting or drafting any Slack reply.
- Use `$slack-task-gate` for the general YES/NO wording and missing-scope discipline.
- Use `$slack-prod-jsp-approval` when a JSP, live ORM/data change, vendor or retailer reimport, resolver run, availability scan, or similar operational action may be needed.
- Use `$pear-prod-jsp` for JSP preview/run safety after approval.
- Use `$pear-engineering-workflow` and `$pear-pr-review-flow` for Pear repo code fixes, PRs, reviewer/Copilot flow, CI fixes, and auto-merge/watch behavior.

## Handle A Slack Link

1. Read the exact Slack message and full thread first.
   - Resolve channel, parent timestamp, permalink, requester, relevant mentioned people, prior Codex replies, linked PRs, alerts, Datadog links, IDs, vendors, retailers, accounts, UPCs, SKUs, environments, and any requested action.
   - Skip duplicate work if Codex already answered, a human already gave a sufficient answer, or an active PR/fix flow is linked.

2. Do a bounded read-only investigation.
   - Search Slack history, the local repo, logs, GitHub, browser pages, DB/reporting sources, Datadog, or external docs only when they are relevant sources of truth.
   - Keep commands and queries read-only until there is explicit approval.
   - Stop when there is enough evidence for either a useful answer, a concrete proposed action, or a clear request for missing scope.

3. Decide the outcome.
   - **Answer-only:** If the thread only needs an explanation or next-step recommendation, post one concise evidence-based reply and stop.
   - **Clarification:** If the problem is real but scope is missing, ask for the exact IDs/names/env needed plus YES/NO if an action is likely.
   - **Action needed:** If a fix, rerun, data change, JSP, PR, or external side effect is appropriate, post a YES/NO approval prompt before acting.

## YES/NO Approval Prompt

Use this shape for action-needed threads, keeping it short:

```text
Quick read-only scan:
- <evidence-backed finding>
- <evidence-backed finding>
- Proposed action: <specific bounded action and scope>

Reply: YES or NO

Should Codex <specific action> for <specific target/scope>?

If yes, I will <execution path>, keep it scoped to <scope>, and post results back here.
If no, I will stop.

- Codex
```

For JSP or production-like operational work, use the stricter `$slack-prod-jsp-approval` shape:

```text
Reply: YES or NO

Should Codex <prep/run action> for <live target/scope>?

If yes, send <names/IDs/env needed> or confirm the proposed scope.

I will prep a preview-only JSP, wait for Run-button approval, then post results here.

Reply: YES or NO

- Codex
```

## After The Reply

- Treat only clear human approval as approval: `yes`, `y`, `fix it`, `go`, `please fix`, `do it`, or an equivalent unambiguous reply.
- Treat `no`, `stop`, or equivalent as a decline; acknowledge only if helpful, then stop.
- If approval is clear but scope is incomplete, ask for the missing exact IDs/names/env before acting.
- Re-read the thread immediately before acting and record the exact Slack reply that approved the work.
- Post a terse starting acknowledgement only after approval, for example `Approved; starting the scoped fix. - Codex`.

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
- Do not treat ambiguous reactions, jokes, questions, or partial scope as approval.
- Do not use broad mentions like `@channel`, `@here`, or `@everyone`.
- Do not expose secrets, credentials, private query dumps, or noisy logs in Slack.
- Prefer no Slack reply over speculative noise when evidence is weak.
- Keep the approved scope narrow. A YES to one retailer, vendor, alert, account, PR, or JSP is not approval for adjacent work.
