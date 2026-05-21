---
name: slack-prod-jsp-approval
description: Use when a Slack request could lead Codex to run a Pear production or test JSP, live ORM/data change, vendor or retailer reimport, resolver run, availability scan, or similar operational action. Guides concise yes/no Slack approval asks, unambiguous target scoping, JSP preview gating, and concise follow-up summaries.
---

# Slack Prod JSP Approval

## Purpose

Keep Slack approval asks scannable before live Pear work. Do not build or run a JSP until the thread has an explicit yes plus an unambiguous target scope.

## Slack Ask

- Put `**Reply: YES or NO**` alone near the top and repeat it at the bottom.
- Keep the body to three short lines or fewer: action, scope needed, next step.
- Prefer names when clear. Ask for IDs only when names are ambiguous or risky.
- State the live target explicitly, such as retailer, platform, environment, or resolver.
- Mention people with resolved Slack IDs when a real notification matters.

```text
<@USER>

**Reply: YES or NO**

Should Codex run [action] for [target]?

If yes, send [names/IDs needed].

I’ll prep a preview-only JSP, wait for Run-button approval, then post results here.

**Reply: YES or NO**

- Codex
```

## Before JSP Work

- Re-read the thread before acting.
- Proceed only after explicit yes plus unambiguous scope.
- Resolve supplied names to IDs from production when IDs are omitted.
- Use `pear-prod-jsp` for JSP safety rules.

## JSP Follow-Through

- Make the no-parameter JSP path a zero-side-effect preview with exact targets.
- Deploy with an explicit environment.
- Open the preview in a browser and stop for Run-button approval.
- After an approved run, post a short Slack summary: target, attempted, updated, skipped, errors, and report link.
