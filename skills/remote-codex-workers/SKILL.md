---
name: remote-codex-workers
description: Opt a Codex host into the S3-only remote Codex worker pool. Use when a user wants to start, configure, repair, inspect, or change remote Codex worker capacity, slots, orchestrator threads, or worker automations.
remote_codex_bundle_version: "2026-06-08.4"
---

# Remote Codex Workers

Bundle version: `2026-06-08.4`

Use this skill to configure a Codex-native worker host. The worker system is S3-only and Codex-only:

- One orchestrator Codex thread per opted-in host.
- One heartbeat automation on the orchestrator thread.
- N slot Codex threads per host.
- One heartbeat automation per slot thread.
- S3 stores queue markers, leases, heartbeats, logs, and results.

Do not start a local daemon, background shell loop, launchd service, or PID-based supervisor.

## Defaults

- Bucket: `private.pearcommerce.com`
- Root prefix: `remote-codex`
- Pool: `default`
- Orchestrator interval: 2 minutes
- Slot interval: 1 minute
- Lease duration: 10 minutes

Accept user overrides for bucket, root prefix, pool, slot count, and intervals. If the user gives only a number, treat it as slot count.

## Mandatory Self-Update

Before doing any setup, repair, or inspection work, use `$remote-codex-updater` to update this skill and its related skills from the canonical Pear skills GitHub repo.

If `$remote-codex-updater` is not installed yet, bootstrap the bundle with a fresh temporary clone:

```bash
set -euo pipefail
BRANCH="${REMOTE_CODEX_SKILLS_BRANCH:-main}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

git clone --depth 1 --branch "$BRANCH" https://github.com/Pear-Commerce/pear-ai-skills.git "$TMP_DIR/pear-ai-skills"

for target in "${CODEX_HOME:-$HOME/.codex}/skills" "$HOME/.claude/skills"; do
  [ -d "$target" ] || continue
  for skill in remote-codex-updater remote-codex-workers remote-codex-orchestrator remote-codex-worker-slot remote-codex-test-flow; do
    test -d "$TMP_DIR/pear-ai-skills/skills/$skill"
    rm -rf "$target/$skill"
    cp -R "$TMP_DIR/pear-ai-skills/skills/$skill" "$target/$skill"
  done
done
```

Then run the updater:

```bash
SKILL_DIR="${CODEX_HOME:-$HOME/.codex}/skills/remote-codex-updater"
"$SKILL_DIR/scripts/update_remote_codex_bundle.sh" "2026-06-08.4"
```

After syncing, read the freshly installed Codex copy of this skill before continuing:

```bash
sed -n '1,220p' "${CODEX_HOME:-$HOME/.codex}/skills/remote-codex-workers/SKILL.md"
```

If the GitHub update fails, stop and report the blocker. Do not proceed with worker setup from a stale copy unless the user explicitly tells you to continue anyway. `REMOTE_CODEX_SKILLS_BRANCH` is only for deliberately testing an unmerged skill branch; otherwise use `main`.

## Setup Workflow

1. Complete the mandatory self-update above.
2. If Codex thread or automation tools are not loaded, use tool search for `create_thread`, `read_thread`, `list_threads`, `automation_update`, and `set_thread_archived`.
3. Derive a stable `hostId` from the local machine and user, for example:
   ```bash
   python3 - <<'PY'
   import getpass, platform, re
   raw = f"{platform.node()}-{getpass.getuser()}".lower()
   print(re.sub(r"[^a-z0-9._:-]+", "-", raw).strip("-") or "codex-host")
   PY
   ```
4. Create or find one orchestrator thread for this `hostId`, bucket, root prefix, and pool. Prefer reusing an active thread whose initial prompt/config matches this host.
5. The orchestrator thread prompt must say:
   ```text
   Use $remote-codex-updater, then $remote-codex-orchestrator.

   remoteCodexBundleVersion: 2026-06-08.4

   Maintain this remote Codex worker host:
   {
     "bucket": "...",
     "rootPrefix": "remote-codex",
     "pool": "default",
     "hostId": "...",
     "desiredSlots": 4,
     "slotIntervalMinutes": 1,
     "leaseSeconds": 600
   }
   ```
6. Create or update a heartbeat automation on the orchestrator thread. The automation prompt should be self-contained and include the current bundle version:
   ```text
   Use $remote-codex-updater first, then $remote-codex-orchestrator.
   remoteCodexBundleVersion: 2026-06-08.4
   Run one orchestrator maintenance cycle for the configured remote Codex worker host: ensure slot threads and slot automations exist, publish host heartbeat, and repair drift. If the updater reports this automation is stale, recreate/update the automation prompt to the current version and stop. Do not execute queue jobs in the orchestrator.
   ```
7. Publish `hosts/{hostId}/orchestrator.json` to S3 with the thread id, requested slots, pool, intervals, and current timestamp.
8. Run one immediate orchestrator cycle by sending/starting the orchestrator thread if needed, or tell the user the automation will repair slots on its next wake.

## S3 Paths

All paths are under `{rootPrefix}`:

```text
queues/{pool}/pending/{priority}-{createdAtMillis}-{random}-{jobId}.json
jobs/{jobId}/request.json
jobs/{jobId}/response-schema.json
jobs/{jobId}/lease.json
jobs/{jobId}/done.json
jobs/{jobId}/cancel.json
jobs/{jobId}/attempts/{attemptId}/logs/{seq}.jsonl
jobs/{jobId}/attempts/{attemptId}/result.json
hosts/{hostId}/orchestrator.json
hosts/{hostId}/heartbeat.json
hosts/{hostId}/slots/{slotId}.json
```

## Final Response

Report:

- `hostId`
- bucket/root prefix/pool
- desired slot count
- orchestrator thread id
- automation status
- whether slots were created immediately or will be repaired on next wake

Mention that `remote-codex-orchestrator` maintains the pool and `remote-codex-worker-slot` owns job claims and leases.
