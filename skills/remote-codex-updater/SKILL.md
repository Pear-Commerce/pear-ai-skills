---
name: remote-codex-updater
description: Refresh and version-check the remote Codex skill bundle. Use at the start of every remote Codex worker, orchestrator, setup, or test automation invocation to sync canonical skills from GitHub and detect stale automation prompts.
remote_codex_bundle_version: "2026-06-08.4"
---

# Remote Codex Updater

Bundle version: `2026-06-08.4`

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
"$SKILL_DIR/scripts/update_remote_codex_bundle.sh" "2026-06-08.4"
```

Use `REMOTE_CODEX_SKILLS_BRANCH` only when intentionally testing an unmerged branch. Otherwise it defaults to `main`.

If the script fails, stop and report the blocker. Do not continue orchestrating or claiming jobs from stale skills unless the user explicitly tells you to continue.

## Version Gate

Every remote Codex thread prompt and automation prompt should include:

```text
remoteCodexBundleVersion: 2026-06-08.4
```

After updating, compare the installed bundle version reported by the script to the version in the current thread/automation prompt.

- If the current prompt has no `remoteCodexBundleVersion`, treat it as stale.
- If the current prompt version differs from the installed version, treat it as stale.
- If stale, update or recreate the relevant automation prompt with the current version and stop this invocation after reporting that it refreshed itself.
- If current, continue to the caller skill.

## Caller Responsibilities

The updater does not know enough context to rebuild every automation by itself. The caller must do the context-specific repair:

- `remote-codex-workers`: update/recreate the orchestrator automation.
- `remote-codex-orchestrator`: update/recreate its own automation and all slot automations.
- `remote-codex-worker-slot`: update/recreate its own slot automation when possible; otherwise report stale and stop.
- `remote-codex-test-flow`: update installed skills before submitting tests.

## Output

Report a compact JSON-like summary:

```json
{
  "installedBundleVersion": "2026-06-08.4",
  "expectedBundleVersion": "2026-06-08.4",
  "skillsUpdated": true,
  "automationRefreshRequired": false
}
```
