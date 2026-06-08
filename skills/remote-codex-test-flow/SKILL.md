---
name: remote-codex-test-flow
description: Test the S3-only, Codex-only remote Codex worker flow end to end. Use when a user wants to submit probe tasks, validate requester-side S3 protocol behavior, inspect active remote Codex workers, poll logs/results, or run a remote Codex e2e smoke test.
remote_codex_bundle_version: "2026-06-08.15"
---

# Remote Codex Test Flow

Bundle version: `2026-06-08.15`

Use this skill to test the remote Codex worker system from inside Codex. It includes a requester-side Codex implementation of the S3 protocol at:

```text
scripts/remote_codex_client.py
```

The script can submit tasks, poll status, inspect host heartbeats, tail logs, and validate final result envelopes.

## Mandatory Bundle Update

Before testing, use `$remote-codex-updater` to refresh the full remote Codex skill bundle from canonical GitHub.

```bash
SKILL_DIR="${CODEX_HOME:-$HOME/.codex}/skills/remote-codex-updater"
"$SKILL_DIR/scripts/update_remote_codex_bundle.sh" "2026-06-08.15"
```

If the update fails, stop unless the user explicitly asks to test the currently installed copy.

## Defaults

- Bucket: `private.pearcommerce.com`
- Root prefix: `remote-codex`
- Pool: `default`
- Priority: `050`
- Job execution timeout: 1 hour
- Wait timeout: 10 minutes
- Poll interval: 15 seconds

`--timeout-seconds` is written into the submitted job as `limits.timeoutSeconds` for workers to enforce. `--wait-seconds` only controls how long this requester process waits for `done.json`.

Submitted test jobs do not carry `remoteCodexBundleVersion`. Bundle versions are only for keeping Codex skills and automations fresh; workers should execute queued jobs created by older bundle versions when the actual request fields and job state are valid.

## Real End-To-End Test

Use this when at least one remote Codex worker host should be active.

```bash
SKILL_DIR="${CODEX_HOME:-$HOME/.codex}/skills/remote-codex-test-flow"
python3 "$SKILL_DIR/scripts/remote_codex_client.py" run-e2e \
  --bucket private.pearcommerce.com \
  --root-prefix remote-codex \
  --pool default \
  --timeout-seconds 3600 \
  --wait-seconds 600 \
  --poll-seconds 15
```

This submits a probe job asking a slot worker to return a structured result containing the test id, then waits for `done.json`, prints the final result, and validates the result envelope shape.

Long `run-e2e` waits may be quiet while the requester process is polling. If there is no terminal output yet, inspect S3 state from another command instead of assuming the test is stuck: use `status --job-id`, `hosts`, and `tail-logs --job-id ... --attempt-id ...` to check queue publication, lease ownership, worker progress, and result/done markers.

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
python3 "$SKILL_DIR/scripts/remote_codex_client.py" submit \
  --timeout-seconds 300 \
  --prompt "Return a tiny JSON result."
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
