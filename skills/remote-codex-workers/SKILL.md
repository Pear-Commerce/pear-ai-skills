---
name: remote-codex-workers
description: Opt a Codex host into the S3-only remote Codex worker pool. Use when a user wants to start, configure, repair, inspect, or change remote Codex worker capacity, slots, orchestrator threads, or worker automations.
remote_codex_bundle_version: "2026-06-08.7"
---

# Remote Codex Workers

Bundle version: `2026-06-08.7`

Use this skill to configure a Codex-native worker host. The worker system is S3-only and Codex-only:

- One orchestrator Codex thread per opted-in host.
- One heartbeat automation owned and self-created by the orchestrator thread.
- N slot Codex threads per host.
- One heartbeat automation owned and self-created by each slot thread.
- S3 stores queue markers, leases, heartbeats, logs, and results.

Do not start a local daemon, background shell loop, launchd service, or PID-based supervisor.
Do not create child heartbeat automations from the setup thread. The setup thread delegates bootstrapping to the child, and the child creates or refreshes its own automation from inside its own turn.

## Defaults

- Bucket: `private.pearcommerce.com`
- Root prefix: `remote-codex`
- Pool: `default`
- Orchestrator interval: 5 minutes
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
"$SKILL_DIR/scripts/update_remote_codex_bundle.sh" "2026-06-08.7"
```

After syncing, read the freshly installed Codex copy of this skill before continuing:

```bash
sed -n '1,220p' "${CODEX_HOME:-$HOME/.codex}/skills/remote-codex-workers/SKILL.md"
```

If the GitHub update fails, stop and report the blocker. Do not proceed with worker setup from a stale copy unless the user explicitly tells you to continue anyway. `REMOTE_CODEX_SKILLS_BRANCH` is only for deliberately testing an unmerged skill branch; otherwise use `main`.

## Setup Workflow

1. Complete the mandatory self-update above.
2. If Codex thread tools are not loaded, use tool search for `create_thread`, `read_thread`, `list_threads`, `send_message_to_thread`, and `set_thread_archived`.
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

   remoteCodexBundleVersion: 2026-06-08.7

   Maintain this remote Codex worker host:
   {
     "bucket": "...",
     "rootPrefix": "remote-codex",
     "pool": "default",
     "hostId": "...",
     "desiredSlots": 4,
     "orchestratorIntervalMinutes": 5,
     "slotIntervalMinutes": 1,
     "leaseSeconds": 600
   }

   On your first turn, create or refresh your own heartbeat automation from inside this orchestrator thread, then maintain slot threads. Do not execute queue jobs in the orchestrator.
   ```
6. Do not create the orchestrator heartbeat from this setup thread. Instead, ensure the orchestrator thread runs an immediate self-bootstrap turn. If the orchestrator thread already exists, send it this follow-up:
   ```text
   Use $remote-codex-updater, then $remote-codex-orchestrator.
   remoteCodexBundleVersion: 2026-06-08.7
   Self-bootstrap this orchestrator: create or refresh your own heartbeat automation attached to this thread, publish host heartbeat, ensure desired slot threads exist, and ask each slot thread to create or refresh its own heartbeat automation. Do not claim queue jobs.
   ```
7. Let the orchestrator thread publish `hosts/{hostId}/orchestrator.json`, `hosts/{hostId}/heartbeat.json`, and slot summaries to S3. The setup thread may inspect those objects for verification, but it should not be the source of truth for host state.
8. Report whether the orchestrator self-bootstrap completed, whether its automation exists, and whether slots were created immediately or will be repaired on the next orchestrator wake.

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
- orchestrator-owned automation status
- whether slots were created immediately or will be repaired on next wake

Mention that `remote-codex-orchestrator` maintains the pool and `remote-codex-worker-slot` owns job claims and leases.
