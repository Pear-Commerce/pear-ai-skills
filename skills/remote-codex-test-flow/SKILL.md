---
name: remote-codex-test-flow
description: Test the S3-only, Codex-only remote Codex worker flow end to end. Use when a user wants to submit probe tasks, validate requester-side S3 protocol behavior, inspect active remote Codex workers, poll logs/results, or run a remote Codex e2e smoke test.
---

# Remote Codex Test Flow

Use this skill to test the remote Codex worker system from inside Codex. It includes a requester-side Codex implementation of the S3 protocol at:

```text
scripts/remote_codex_client.py
```

The script can submit tasks, poll status, inspect host heartbeats, tail logs, and validate final result envelopes.

## Mandatory Bundle Update

Before testing, refresh the full remote Codex skill bundle from canonical GitHub. Use `REMOTE_CODEX_SKILLS_BRANCH` only when intentionally testing an unmerged branch.

```bash
set -euo pipefail
BRANCH="${REMOTE_CODEX_SKILLS_BRANCH:-main}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT
git clone --depth 1 --branch "$BRANCH" https://github.com/Pear-Commerce/pear-ai-skills.git "$TMP_DIR/pear-ai-skills"
for target in "${CODEX_HOME:-$HOME/.codex}/skills" "$HOME/.claude/skills"; do
  [ -d "$target" ] || continue
  for skill in remote-codex-workers remote-codex-orchestrator remote-codex-worker-slot remote-codex-test-flow; do
    test -d "$TMP_DIR/pear-ai-skills/skills/$skill"
    rm -rf "$target/$skill"
    cp -R "$TMP_DIR/pear-ai-skills/skills/$skill" "$target/$skill"
  done
done
```

If the update fails, stop unless the user explicitly asks to test the currently installed copy.

## Defaults

- Bucket: `private.pearcommerce.com`
- Root prefix: `remote-codex`
- Pool: `default`
- Priority: `050`
- Wait timeout: 10 minutes
- Poll interval: 15 seconds

## Real End-To-End Test

Use this when at least one remote Codex worker host should be active.

```bash
SKILL_DIR="${CODEX_HOME:-$HOME/.codex}/skills/remote-codex-test-flow"
python3 "$SKILL_DIR/scripts/remote_codex_client.py" run-e2e \
  --bucket private.pearcommerce.com \
  --root-prefix remote-codex \
  --pool default \
  --wait-seconds 600 \
  --poll-seconds 15
```

This submits a probe job asking a slot worker to return a structured result containing the test id, then waits for `done.json`, prints the final result, and validates the result envelope shape.

If no worker claims the job, inspect hosts:

```bash
python3 "$SKILL_DIR/scripts/remote_codex_client.py" hosts \
  --bucket private.pearcommerce.com \
  --root-prefix remote-codex
```

Then report whether the failure is likely no active hosts, stale host heartbeats, no slot automations, or a job lease/progress issue.

## Protocol Smoke Test

Use this only when no worker is available and the user wants to validate S3 paths, conditional writes, status polling, and result reading. It does not prove Codex worker execution.

```bash
SKILL_DIR="${CODEX_HOME:-$HOME/.codex}/skills/remote-codex-test-flow"
python3 "$SKILL_DIR/scripts/remote_codex_client.py" protocol-smoke \
  --bucket private.pearcommerce.com \
  --root-prefix remote-codex \
  --pool default
```

## Useful Commands

Submit without waiting:

```bash
python3 "$SKILL_DIR/scripts/remote_codex_client.py" submit --prompt "Return a tiny JSON result."
```

Check one job:

```bash
python3 "$SKILL_DIR/scripts/remote_codex_client.py" status --job-id JOB_ID
```

Wait for one job:

```bash
python3 "$SKILL_DIR/scripts/remote_codex_client.py" wait --job-id JOB_ID --wait-seconds 600
```

Tail log chunks:

```bash
python3 "$SKILL_DIR/scripts/remote_codex_client.py" tail-logs --job-id JOB_ID --attempt-id ATTEMPT_ID
```

## Reporting

Final response should include:

- job id
- pending key
- whether a worker claimed it
- final state
- result summary
- log/result S3 URIs
- any blocker and the exact S3 object that showed it
