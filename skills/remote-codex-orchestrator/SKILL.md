---
name: remote-codex-orchestrator
description: Maintain a Codex-only remote worker host orchestrator. Use inside orchestrator Codex threads and automations to create, repair, inspect, and heartbeat worker slot threads backed by the S3 remote Codex protocol.
---

# Remote Codex Orchestrator

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

1. If Codex thread or automation tools are not loaded, use tool search for `create_thread`, `read_thread`, `list_threads`, and `automation_update`.
2. Read existing slot summaries from:
   ```text
   {rootPrefix}/hosts/{hostId}/slots/
   ```
3. For each desired slot number, use slot ids `slot-001`, `slot-002`, etc.
4. For each slot:
   - If the slot has no thread id, create a projectless Codex thread.
   - If the thread is missing, archived, inaccessible, or clearly wrong for this host/slot, create a replacement thread.
   - Ensure a heartbeat automation exists on that slot thread.
   - Read the slot thread status when possible and include it in the slot summary.
5. Write each slot summary to:
   ```text
   {rootPrefix}/hosts/{hostId}/slots/{slotId}.json
   ```
6. Write host heartbeat to:
   ```text
   {rootPrefix}/hosts/{hostId}/heartbeat.json
   ```
7. If there are extra slots above `desiredSlots`, mark them `retiring: true`; do not delete or archive a slot that may still own a job.

## Slot Thread Prompt

Create each slot thread with a prompt like:

```text
Use $remote-codex-worker-slot.

You are remote Codex worker slot slot-001 for host host-user.
Run one worker wake cycle whenever prompted or awakened by automation.

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
Use $remote-codex-worker-slot. Run one bounded worker wake cycle for this configured slot: renew or release the current job lease, claim an eligible pending job if idle, perform bounded work, publish logs/status/result to S3, and stop cleanly.
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
- Prefer preserving existing slot threads over replacing them.
- Never create more active non-retiring slots than `desiredSlots`.
- Never renew a job lease from the orchestrator.
- Keep the final response short: report slots healthy, repaired, created, retiring, or blocked.
