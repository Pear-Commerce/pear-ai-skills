---
name: remote-codex-updater
description: Refresh and version-check the remote Codex skill bundle. Use at the start of every remote Codex worker, orchestrator, setup, or test automation invocation to sync canonical skills from GitHub and detect stale automation prompts.
remote_codex_bundle_version: "2026-06-08.14"
---

# Remote Codex Updater

Bundle version: `2026-06-08.14`

Use this skill first in every remote Codex setup, orchestrator, slot, and test-flow invocation. It updates the remote Codex skill bundle from canonical GitHub, verifies the installed bundle version, and tells the caller whether automation prompts should be recreated.

## Bundle Skills

- `remote-codex-updater`
- `remote-codex-workers`
- `remote-codex-orchestrator`
- `remote-codex-worker-slot`
- `remote-codex-test-flow`

## Update Command

Run the bundled script:

```bash
SKILL_DIR="${CODEX_HOME:-$HOME/.codex}/skills/remote-codex-updater"
"$SKILL_DIR/scripts/update_remote_codex_bundle.sh" "2026-06-08.14"
```

Use `REMOTE_CODEX_SKILLS_BRANCH` only when intentionally testing an unmerged branch. Otherwise it defaults to `main`.

If the script fails, stop and report the blocker. Do not continue orchestrating or claiming jobs from stale skills unless the user explicitly tells you to continue.

## Version Gate

Every remote Codex thread prompt and automation prompt should include:

```text
remoteCodexBundleVersion: 2026-06-08.14
```

After updating, compare the installed bundle version reported by the script to the version in the current thread/automation prompt.

- If the current prompt has no `remoteCodexBundleVersion`, treat it as stale.
- If the current prompt version differs from the installed version, treat it as stale.
- If stale, the owning thread should update or recreate its own automation prompt with the current version and stop this invocation after reporting that it refreshed itself.
- If current, continue to the caller skill.

This version gate applies only to Codex skill bundles, thread prompts, and automation prompts. It must never be used as a queued-job compatibility check. Do not compare `remoteCodexBundleVersion` from `request.json`, pending markers, logs, or other job-owned S3 objects to the installed bundle version when deciding whether a worker may execute a job. Existing queued jobs from older bundle versions remain eligible as long as their request shape, pool, timeout, cancel, max-attempt, and lease state permit execution.

## Caller Responsibilities

The updater does not know enough context to rebuild every automation by itself. The caller must do the context-specific repair:

- `remote-codex-workers`: create or find the orchestrator thread, then ask the orchestrator to self-bootstrap its own automation.
- `remote-codex-orchestrator`: update/recreate its own automation and ask each slot thread to update/recreate its own automation.
- `remote-codex-worker-slot`: update/recreate its own slot automation when possible; otherwise report stale and stop.
- `remote-codex-test-flow`: update installed skills before submitting tests.

## Output

Report a compact JSON-like summary:

```json
{
  "installedBundleVersion": "2026-06-08.14",
  "expectedBundleVersion": "2026-06-08.14",
  "skillsUpdated": true,
  "automationRefreshRequired": false
}
```
