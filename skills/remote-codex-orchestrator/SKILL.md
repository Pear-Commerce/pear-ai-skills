---
name: remote-codex-orchestrator
description: Maintain a Codex-only remote worker host orchestrator. Use inside orchestrator Codex threads and automations to create, repair, inspect, and heartbeat worker slot threads backed by the S3 remote Codex protocol.
remote_codex_bundle_version: "2026-06-08.15"
---

# Remote Codex Orchestrator

Bundle version: `2026-06-08.15`

This skill runs inside the orchestrator Codex thread. It owns the orchestrator heartbeat automation for one opted-in host and maintains slot threads for that host.

The orchestrator must not claim queue jobs, renew job leases, execute requester prompts, or publish job results. Slot threads do that.
The orchestrator should not directly create slot heartbeat automations during normal repair. It should create or refresh its own automation from inside the orchestrator thread, then ask each slot thread to create or refresh its own automation from inside the slot thread.

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
  "orchestratorIntervalMinutes": 5,
  "slotIntervalMinutes": 1,
  "leaseSeconds": 600
}
```

## Thread Placement

When creating or replacing slot threads, prefer the existing `/Users/alexwyler/api.pearcommerce.com` Codex project/workspace if that path exists. Create the slot with a Codex project target like:

```json
{
  "type": "project",
  "projectId": "/Users/alexwyler/api.pearcommerce.com",
  "environment": { "type": "local" }
}
```

If this orchestrator thread is already running in the `api.pearcommerce.com` project, use that same project target. If the API workspace does not exist or Codex cannot resolve it as a project target, fall back to a projectless chat and record `threadPlacementFallback: "projectless"` in the slot summary. Do not replace a healthy existing slot solely to move it between projectless and project placement.

## Maintenance Cycle

1. Use `$remote-codex-updater` before doing anything else.
2. If Codex thread or automation tools are not loaded, use tool search for `create_thread`, `read_thread`, `list_threads`, `send_message_to_thread`, and `automation_update`.
3. Create or refresh this orchestrator thread's own heartbeat automation on a 5-minute cadence. Prefer `destination=thread` when running in the orchestrator thread; if updating by id, keep `targetThreadId` equal to the current orchestrator thread id. The prompt must include `remoteCodexBundleVersion: 2026-06-08.15`.
4. If the updater reports this invocation or automation is stale, finish the self-refresh above, ask existing slot threads to self-refresh their automations, publish a heartbeat that says `staleVersionRefreshed: true`, and stop this invocation before maintaining capacity or touching jobs.
5. Read existing slot summaries from:
   ```text
   {rootPrefix}/hosts/{hostId}/slots/
   ```
6. For each desired slot number, use slot ids `slot-001`, `slot-002`, etc.
7. For each slot:
   - If the slot has no thread id, create a Codex thread using the Thread Placement rules above.
   - If the thread is missing, archived, inaccessible, or clearly wrong for this host/slot, create a replacement thread using the Thread Placement rules above.
   - Ask the slot thread to self-bootstrap or self-refresh its heartbeat automation on a 1-minute cadence. Do this by creating the slot with the self-bootstrap prompt below, or by sending the existing slot thread a follow-up prompt. Do not directly create a slot automation from the orchestrator unless the slot thread cannot be messaged and the user explicitly asked for emergency repair.
   - Read the slot thread status when possible and include it in the slot summary, along with `threadPlacement: "api-project"` or `threadPlacementFallback: "projectless"` when known.
8. Write each slot summary to:
   ```text
   {rootPrefix}/hosts/{hostId}/slots/{slotId}.json
   ```
9. Write host heartbeat to:
   ```text
   {rootPrefix}/hosts/{hostId}/heartbeat.json
   ```
10. Read live fleet status from:
   ```text
   {rootPrefix}/hosts/
   ```
   List host heartbeat objects, orchestrator objects, and slot summary objects across all hosts under this root prefix. Print a compact `REMOTE_CODEX_FLEET_STATUS_JSON` block in the orchestrator thread output. This is read-only fleet observation: never repair, archive, message, or mutate another host's orchestrator or slot threads from this host's orchestrator.
11. Read recent host task events from:
   ```text
   {rootPrefix}/hosts/{hostId}/task-events/
   ```
   Print a compact `REMOTE_CODEX_TASK_LOG_JSON` block in the orchestrator thread output. Include newly observed events since the last reported task event key when known; otherwise include the latest 20 events. Each item should include `eventType`, `ts`, `slotId`, `jobId`, `attemptId`, `status`, `resultUri`, and `outputJson` when present.
12. Write or update orchestrator state at:
   ```text
   {rootPrefix}/hosts/{hostId}/orchestrator.json
   ```
   Include `lastReportedTaskEventKey` set to the last event key included in `REMOTE_CODEX_TASK_LOG_JSON`, plus `taskEventPrefixUri`, `lastFleetStatusPrintedAt`, and `fleetStatusPrefixUri`.
13. If there are extra slots above `desiredSlots`, mark them `retiring: true`; do not delete or archive a slot that may still own a job.

## Orchestrator Automation Prompt

Use a heartbeat automation attached to this orchestrator thread:

Schedule it every 5 minutes.

```text
Use $remote-codex-updater first, then $remote-codex-orchestrator.
remoteCodexBundleVersion: 2026-06-08.15
Run one orchestrator maintenance cycle for the configured remote Codex worker host: self-refresh this orchestrator automation if stale, ensure slot threads exist, ask slot threads to self-refresh their own automations, publish host heartbeat, print REMOTE_CODEX_FLEET_STATUS_JSON from S3 host and slot heartbeats, print REMOTE_CODEX_TASK_LOG_JSON from slot task events, and repair drift. Format the final response as readable markdown with fenced JSON blocks; do not inline JSON and do not wrap output in XML or CDATA. Do not execute queue jobs in the orchestrator.
```

## Slot Thread Prompt

Create each slot thread with a prompt like:

```text
Use $remote-codex-updater, then $remote-codex-worker-slot.

You are remote Codex worker slot slot-001 for host host-user.
Run one worker wake cycle whenever prompted or awakened by automation.

remoteCodexBundleVersion: 2026-06-08.15

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

On your first turn, create or refresh your own heartbeat automation attached to this slot thread, print concise diagnostics about the wake plan, major state changes, and material task action/fallback steps, then run one bounded worker wake cycle. When you claim or complete a job, write host task events for the orchestrator task log and mirror major diagnostics into job log chunks.
```

## Slot Self-Refresh Prompt

When a slot exists but its automation is missing or stale, send the slot thread this prompt:

```text
Use $remote-codex-updater, then $remote-codex-worker-slot.
remoteCodexBundleVersion: 2026-06-08.15
Self-bootstrap this slot: create or refresh your own heartbeat automation attached to this slot thread, publish slot heartbeat, print concise diagnostics about the wake plan, major state changes, and material task action/fallback steps, and then run one bounded worker wake cycle if it is safe to do so. When you claim or complete a job, write host task events for the orchestrator task log and mirror major diagnostics into job log chunks.
```

## Slot Automation Prompt

Each slot creates this heartbeat automation from inside its own slot thread:

Schedule it every 1 minute.

```text
Use $remote-codex-updater first, then $remote-codex-worker-slot.
remoteCodexBundleVersion: 2026-06-08.15
Run one bounded worker wake cycle for this configured slot: print concise worker diagnostics including task action and fallback steps, renew or release the current job lease, claim an eligible pending job if idle, write host task start/complete events, perform bounded work, publish logs/status/result to S3, mirror major diagnostics into job log chunks when an attempt exists, and stop cleanly. If the updater reports this automation is stale, update/recreate this automation prompt to the current version and stop before claiming work.
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

## Fleet Status Output

The orchestrator final response for every maintenance wake should include a machine-readable fleet status block before the task log block. The label must be on its own line, followed immediately by a fenced `json` block. Do not inline the JSON into a paragraph. Do not wrap the response, labels, or JSON in XML, CDATA, HTML comments, or other transport markup.

````text
REMOTE_CODEX_FLEET_STATUS_JSON
```json
{
  "generatedAt": "2026-06-08T18:00:00Z",
  "bucket": "private.pearcommerce.com",
  "rootPrefix": "remote-codex",
  "pool": "default",
  "currentHostId": "host-user",
  "totals": {
    "hosts": 2,
    "liveHosts": 1,
    "staleHosts": 1,
    "desiredSlots": 4,
    "slots": 4,
    "liveSlots": 3,
    "idleSlots": 1,
    "runningSlots": 2,
    "blockedSlots": 0,
    "staleSlots": 1
  },
  "hosts": [
    {
      "hostId": "host-user",
      "pool": "default",
      "updatedAt": "2026-06-08T18:00:00Z",
      "stale": false,
      "desiredSlots": 4,
      "orchestratorThreadId": "019...",
      "slots": [
        {
          "slotId": "slot-001",
          "threadId": "019...",
          "status": "running",
          "jobId": "job_...",
          "updatedAt": "2026-06-08T18:00:00Z",
          "stale": false
        }
      ]
    }
  ]
}
```
````

Derive the fleet view from S3 only:

```bash
aws s3api list-objects-v2 \
  --bucket "$BUCKET" \
  --prefix "$ROOT_PREFIX/hosts/" \
  --query 'Contents[].Key' \
  --output json
```

Load keys ending in `/heartbeat.json`, `/orchestrator.json`, and `/slots/{slotId}.json`. Treat a host as live when its heartbeat `updatedAt` is no older than the greater of twice `orchestratorIntervalMinutes` or 15 minutes. Treat a slot as live when its slot summary `updatedAt` or `lastObservedAt` is no older than the greater of twice `slotIntervalMinutes` or 5 minutes. Use `"unknown"` for missing status fields instead of dropping the host or slot from the summary.

Include all discovered hosts when the fleet is small. If more than 50 hosts exist, include the current host plus the 49 most recently updated hosts, set `"truncated": true`, and keep totals computed across every discovered host. Sort hosts by current host first, then newest `updatedAt`, then `hostId`; sort slots by `slotId`.

## Task Log Output

The orchestrator final response for every maintenance wake should include a machine-readable task log block after the fleet status block. The label must be on its own line, followed immediately by a fenced `json` block. Do not inline the JSON into a paragraph.

````text
REMOTE_CODEX_TASK_LOG_JSON
```json
[
  {
    "eventType": "task_started",
    "ts": "2026-06-08T18:00:00Z",
    "slotId": "slot-001",
    "jobId": "job_...",
    "attemptId": "attempt_..."
  },
  {
    "eventType": "task_completed",
    "ts": "2026-06-08T18:02:00Z",
    "slotId": "slot-001",
    "jobId": "job_...",
    "attemptId": "attempt_...",
    "status": "succeeded",
    "resultUri": "s3://...",
    "outputJson": {
      "ok": true,
      "summary": "Short human-readable summary",
      "data": {}
    }
  }
]
```
````

If there are no new events, print:

````text
REMOTE_CODEX_TASK_LOG_JSON
```json
[]
```
````

Do not execute queue jobs from the orchestrator to fill this log. The log is assembled only from slot-written task event objects.

## Final Response Format

Every orchestrator automation wake must end with this readable markdown structure:

````text
Maintenance completed.

- Bundle: 2026-06-08.15
- Host: host-user
- Slots: 1 healthy, 0 repaired, 0 blocked
- S3: heartbeat/state refreshed

REMOTE_CODEX_FLEET_STATUS_JSON
```json
{
  "generatedAt": "2026-06-08T18:00:00Z",
  "totals": {
    "hosts": 1,
    "slots": 1,
    "idleSlots": 1
  },
  "hosts": []
}
```

REMOTE_CODEX_TASK_LOG_JSON
```json
[]
```
````

Keep the human summary short, but preserve the line breaks and fenced JSON blocks. Never emit a single-line response containing labels plus JSON. Never emit `<![CDATA[` or `]]>`.

## Drift Rules

- Repair missing slot threads directly.
- Repair missing or stale slot automations by asking the owning slot thread to self-bootstrap.
- Repair stale automation prompts whose `remoteCodexBundleVersion` is missing or not `2026-06-08.15`.
- Prefer preserving existing slot threads over replacing them.
- Never create more active non-retiring slots than `desiredSlots`.
- Never renew a job lease from the orchestrator.
- Keep the human summary short, then use the exact `Final Response Format` with fenced JSON blocks.
