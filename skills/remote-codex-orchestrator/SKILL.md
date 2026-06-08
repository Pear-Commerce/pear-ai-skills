---
name: remote-codex-orchestrator
description: Maintain a Codex-only remote worker host orchestrator. Use inside orchestrator Codex threads and automations to create, repair, inspect, and heartbeat worker slot threads backed by the S3 remote Codex protocol.
remote_codex_bundle_version: "2026-06-08.4"
---

# Remote Codex Orchestrator

Bundle version: `2026-06-08.4`

This skill runs inside the orchestrator Codex thread. It maintains slot threads and slot automations for one opted-in host.

The orchestrator must not claim queue jobs, renew job leases, execute requester prompts, or publish job results. Slot threads do that.

## Inputs

Read config from the current thread prompt and, when available, from:

```text
s3://{bucket}/{rootPrefix}/hosts/{hostId}/orchestrator.json
```

Required config:

```json
{
  "bucket": "private.pearcommerce.com",
  "rootPrefix": "remote-codex",
  "pool": "default",
  "hostId": "host-user",
  "desiredSlots": 4,
  "slotIntervalMinutes": 1,
  "leaseSeconds": 600
}
```

## Maintenance Cycle

1. Use `$remote-codex-updater` before doing anything else. If the updater reports this invocation or automation is stale, update/recreate the orchestrator automation and slot automation prompts to `remoteCodexBundleVersion: 2026-06-08.4`, then stop this invocation.
2. If Codex thread or automation tools are not loaded, use tool search for `create_thread`, `read_thread`, `list_threads`, and `automation_update`.
3. Read existing slot summaries from:
   ```text
   {rootPrefix}/hosts/{hostId}/slots/
   ```
4. For each desired slot number, use slot ids `slot-001`, `slot-002`, etc.
5. For each slot:
   - If the slot has no thread id, create a projectless Codex thread.
   - If the thread is missing, archived, inaccessible, or clearly wrong for this host/slot, create a replacement thread.
   - Ensure a heartbeat automation exists on that slot thread and its prompt contains `remoteCodexBundleVersion: 2026-06-08.4`.
   - Read the slot thread status when possible and include it in the slot summary.
6. Write each slot summary to:
   ```text
   {rootPrefix}/hosts/{hostId}/slots/{slotId}.json
   ```
7. Write host heartbeat to:
   ```text
   {rootPrefix}/hosts/{hostId}/heartbeat.json
   ```
8. If there are extra slots above `desiredSlots`, mark them `retiring: true`; do not delete or archive a slot that may still own a job.

## Slot Thread Prompt

Create each slot thread with a prompt like:

```text
Use $remote-codex-updater, then $remote-codex-worker-slot.

You are remote Codex worker slot slot-001 for host host-user.
Run one worker wake cycle whenever prompted or awakened by automation.

remoteCodexBundleVersion: 2026-06-08.4

Config:
{
  "bucket": "private.pearcommerce.com",
  "rootPrefix": "remote-codex",
  "pool": "default",
  "hostId": "host-user",
  "slotId": "slot-001",
  "leaseSeconds": 600,
  "maxCandidatesPerWake": 20
}
```

## Slot Automation Prompt

Use a heartbeat automation attached to the slot thread:

```text
Use $remote-codex-updater first, then $remote-codex-worker-slot.
remoteCodexBundleVersion: 2026-06-08.4
Run one bounded worker wake cycle for this configured slot: renew or release the current job lease, claim an eligible pending job if idle, perform bounded work, publish logs/status/result to S3, and stop cleanly. If the updater reports this automation is stale, update/recreate this automation prompt to the current version and stop before claiming work.
```

## Host Heartbeat Shape

```json
{
  "version": 1,
  "hostId": "host-user",
  "pool": "default",
  "desiredSlots": 4,
  "activeSlots": 3,
  "idleSlots": 1,
  "orchestratorThreadId": "019...",
  "updatedAt": "2026-06-08T18:00:00Z",
  "slots": [
    {
      "slotId": "slot-001",
      "threadId": "019...",
      "status": "active",
      "jobId": "job_...",
      "lastObservedAt": "2026-06-08T18:00:00Z"
    }
  ]
}
```

## Drift Rules

- Repair missing slot threads and missing automations.
- Repair stale automation prompts whose `remoteCodexBundleVersion` is missing or not `2026-06-08.4`.
- Prefer preserving existing slot threads over replacing them.
- Never create more active non-retiring slots than `desiredSlots`.
- Never renew a job lease from the orchestrator.
- Keep the final response short: report slots healthy, repaired, created, retiring, or blocked.
