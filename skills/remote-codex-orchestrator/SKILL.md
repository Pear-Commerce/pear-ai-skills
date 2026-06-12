---
name: remote-codex-orchestrator
description: Maintain a Codex-only remote worker host orchestrator. Use inside orchestrator Codex threads and automations to create, repair, inspect, and heartbeat worker slot threads backed by the S3 remote Codex protocol.
remote_codex_bundle_version: "2026-06-08.20"
---

# Remote Codex Orchestrator

Bundle version: `2026-06-08.20`

This skill runs inside the orchestrator Codex thread. It owns the orchestrator heartbeat automation for one opted-in host and maintains slot threads for that host.

The orchestrator must not claim queue jobs, renew job leases, execute requester prompts, or publish job results. Slot threads do that.
The orchestrator should not directly create slot heartbeat automations during normal repair. It should create or refresh its own automation from inside the orchestrator thread, then ask each slot thread to create or refresh its own automation from inside the slot thread.

## Requester Protocol Awareness

Pear API PR `Pear-Commerce/api.pearcommerce.com#5473` added `RemoteCodexJobQueue`, the Java requester-side S3 client used by API code. Orchestrators do not submit or execute jobs, but fleet diagnostics and repairs should understand its behavior:

- Java requester jobs use the same queue and job paths as Codex requester jobs: `queues/{pool}/pending/...`, `jobs/{jobId}/request.json`, `lease.json`, `done.json`, and `attempts/{attemptId}/result.json`.
- Requester retries are intentionally idempotent. Existing `request.json` plus `lease.json` or `done.json` means the job is already running or terminal; do not ask slots to requeue or rerun it just because a pending marker exists.
- Stale pending markers may remain after a job is leased or completed. Fleet/task-log summaries should rely on job state (`done.json`, live/stale `lease.json`, cancel marker, request presence), not pending-marker presence alone.
- S3 `403 AccessDenied` should be reported as an access/configuration blocker. Do not collapse it into "object missing" or "queue empty" in human diagnostics.

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
  "orchestratorNoChangeBackoffMaxMinutes": 15,
  "slotIntervalMinutes": 1,
  "leaseSeconds": 600
}
```

Optional backoff config:

```json
{
  "orchestratorNoChangeBackoffBaseMinutes": 5,
  "orchestratorNoChangeBackoffMaxMinutes": 15
}
```

When these fields are missing or null, use a 5-minute base and 15-minute maximum.

## Orchestrator No-Change Backoff

The orchestrator heartbeat automation must use exponential backoff only after wakes with no material changes:

- Start and reset the orchestrator heartbeat interval to 5 minutes.
- Treat a wake as having material changes when it creates or replaces slot threads, asks a slot thread to self-refresh, marks extra slots retiring, emits any new task events, sees task-event read errors, handles stale-version repair, or observes a material local slot state change such as status/job/backoff fields changing.
- Do not count routine host heartbeat refresh, orchestrator state refresh, fleet-status printing, task-log cursor confirmation with zero new events, or refreshing this orchestrator automation prompt as material changes by themselves.
- When a wake has no material changes, increment `consecutiveNoChangeWakes`, double the previous orchestrator no-change interval, and cap the next heartbeat interval at 15 minutes. With the default base, the sequence is 5 -> 10 -> 15 -> 15 minutes.
- Persist the backoff state in `orchestrator.json` and host heartbeat where practical, including `consecutiveNoChangeWakes`, `orchestratorBackoffMinutes`, `orchestratorBackoffMaxMinutes`, `nextHeartbeatIntervalMinutes`, `lastMaterialChangeAt`, and `lastMaterialChangeReasons`.
- Before ending the wake, update or recreate this orchestrator's own heartbeat automation with `FREQ=MINUTELY;INTERVAL=<nextHeartbeatIntervalMinutes>`.
- As soon as any material change occurs, reset `consecutiveNoChangeWakes` to `0`, reset `orchestratorBackoffMinutes` and `nextHeartbeatIntervalMinutes` to `5`, publish that reset in state, and refresh this orchestrator heartbeat automation back to `FREQ=MINUTELY;INTERVAL=5`.
- Do not sleep inside the orchestrator turn to implement backoff. Backoff is represented only by the next heartbeat automation interval.

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
3. Create or refresh this orchestrator thread's own heartbeat automation on the adaptive cadence from the Orchestrator No-Change Backoff rules: 5 minutes while changes are active or recently observed, then exponential backoff after no-change wakes up to 15 minutes. Prefer `destination=thread` when running in the orchestrator thread; if updating by id, keep `targetThreadId` equal to the current orchestrator thread id. The prompt must include `remoteCodexBundleVersion: 2026-06-08.20`.
4. If the updater reports this invocation or automation is stale, finish the self-refresh above, ask existing slot threads to self-refresh their automations, publish a heartbeat that says `staleVersionRefreshed: true`, and stop this invocation before maintaining capacity or touching jobs.
5. Read existing slot summaries from:
   ```text
   {rootPrefix}/hosts/{hostId}/slots/
   ```
6. For each desired slot number, use slot ids `slot-001`, `slot-002`, etc.
7. For each slot:
   - If the slot has no thread id, create a Codex thread using the Thread Placement rules above.
   - If the thread is missing, archived, inaccessible, or clearly wrong for this host/slot, create a replacement thread using the Thread Placement rules above.
   - Ask the slot thread to self-bootstrap or self-refresh its repeat-until-empty heartbeat automation on an adaptive cadence: 1 minute while work is active or recently found, then exponential backoff after `queue_empty` wakes up to 15 minutes. Do this by creating the slot with the self-bootstrap prompt below, or by sending the existing slot thread a follow-up prompt. Do not directly create a slot automation from the orchestrator unless the slot thread cannot be messaged and the user explicitly asked for emergency repair.
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
   Print a compact `REMOTE_CODEX_TASK_LOG_JSON` block in the orchestrator thread output using cursor-based event delivery. If `lastReportedTaskEventKey` exists, list keys lexicographically after that key and emit the next 100 event objects. If more than 100 new events exist, set `truncated: true` in the task-log metadata and leave the remaining events for the next orchestrator wake. If no cursor exists yet, bootstrap with the latest 100 events only. Each item should include `eventType`, `ts`, `slotId`, `jobId`, `attemptId`, `status`, `resultUri`, and `outputJson` when present.
12. Write or update orchestrator state at:
   ```text
   {rootPrefix}/hosts/{hostId}/orchestrator.json
   ```
   Include `lastReportedTaskEventKey` set only to the last event key actually included in `REMOTE_CODEX_TASK_LOG_JSON`, plus `taskEventPrefixUri`, `lastFleetStatusPrintedAt`, `fleetStatusPrefixUri`, `lastTaskEventBatchCount`, `taskEventBacklogRemaining`, and orchestrator no-change backoff fields when known. Never advance `lastReportedTaskEventKey` to the newest listed key if that key was not emitted.
13. If there are extra slots above `desiredSlots`, mark them `retiring: true`; do not delete or archive a slot that may still own a job.

## Orchestrator Automation Prompt

Use a heartbeat automation attached to this orchestrator thread:

Start it every 5 minutes. The orchestrator then adjusts its own heartbeat schedule after each wake using the Orchestrator No-Change Backoff rules: double after no-change wakes, cap at 15 minutes, and reset to 5 minutes whenever material changes are observed.

```text
Use $remote-codex-updater first, then $remote-codex-orchestrator.
remoteCodexBundleVersion: 2026-06-08.20
Run one orchestrator maintenance cycle for the configured remote Codex worker host: self-refresh this orchestrator automation if stale, ensure slot threads exist, ask slot threads to self-refresh their own automations, publish host heartbeat, print REMOTE_CODEX_FLEET_STATUS_JSON from S3 host and slot heartbeats, print cursored REMOTE_CODEX_TASK_LOG_JSON from slot task events, repair drift, and update this orchestrator automation with exponential no-change backoff capped at 15 minutes. Reset the orchestrator automation to a 5-minute interval whenever material changes are observed. Format the final response as readable markdown with fenced JSON blocks; do not inline JSON and do not wrap output in XML or CDATA. Do not execute queue jobs in the orchestrator.
```

## Slot Thread Prompt

Create each slot thread with a prompt like:

```text
Use $remote-codex-updater, then $remote-codex-worker-slot.

You are remote Codex worker slot slot-001 for host host-user.
Run one repeat-until-empty worker wake cycle whenever prompted or awakened by automation.

remoteCodexBundleVersion: 2026-06-08.20

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

On your first turn, create or refresh your own heartbeat automation attached to this slot thread, print concise diagnostics about the wake plan, major state changes, and material task action/fallback steps, then run one bounded repeat-until-empty worker wake cycle. Loop: find one task; if none found, stop the wake; if found, execute it; after it is terminal, released, or lost and currentJobId is cleared, go back to find the next task. Use exponential empty-queue backoff for your own heartbeat automation: start/reset at 1 minute, double only after `queue_empty` wakes, and cap at 15 minutes. Never prefetch leases; own at most one active job lease at a time. When you claim or complete a job, write host task events for the orchestrator task log and mirror major diagnostics into job log chunks.
```

## Slot Self-Refresh Prompt

When a slot exists but its automation is missing or stale, send the slot thread this prompt:

```text
Use $remote-codex-updater, then $remote-codex-worker-slot.
remoteCodexBundleVersion: 2026-06-08.20
Self-bootstrap this slot: create or refresh your own heartbeat automation attached to this slot thread, publish slot heartbeat, print concise diagnostics about the wake plan, major state changes, and material task action/fallback steps, and then run one bounded repeat-until-empty worker wake cycle if it is safe to do so. Loop: find one task; if none found, stop the wake; if found, execute it; after it is terminal, released, or lost and currentJobId is cleared, go back to find the next task. Use exponential empty-queue backoff for your own heartbeat automation: start/reset at 1 minute, double only after `queue_empty` wakes, and cap at 15 minutes. Never prefetch leases; own at most one active job lease at a time. When you claim or complete a job, write host task events for the orchestrator task log and mirror major diagnostics into job log chunks.
```

## Slot Automation Prompt

Each slot creates this heartbeat automation from inside its own slot thread:

Start it every 1 minute. The slot then adjusts the interval itself: double after `queue_empty` wakes with no task claimed or continued, cap at 15 minutes, and reset to 1 minute whenever work is found or active.

```text
Use $remote-codex-updater first, then $remote-codex-worker-slot.
remoteCodexBundleVersion: 2026-06-08.20
Run one bounded repeat-until-empty worker wake cycle for this configured slot: print concise worker diagnostics including task action and fallback steps, renew or release the current job lease, claim one eligible pending job if idle, write host task start/complete events, perform bounded work, publish logs/status/result to S3, then loop back to scan for another eligible pending job only after the active job is terminal, released, or lost and the slot has cleared currentJobId. Never prefetch leases; own at most one active job lease at a time. Stop cleanly with a wakeStopReason when the queue is empty or a safety stop applies. If wakeStopReason is queue_empty and no task was claimed or continued, update this slot automation to use exponential empty-queue backoff capped at 15 minutes; reset the automation to a 1-minute interval whenever work is found or active. Mirror major diagnostics into job log chunks when an attempt exists. If the updater reports this automation is stale, update/recreate this automation prompt to the current version and stop before claiming work.
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

Use loss-resistant cursoring for task events:

- Event keys are immutable and shaped as `{eventTimeMillis}-{slotId}-{jobId}-{attemptId}-{eventType}.json`, so S3 lexicographic order is chronological for this prefix.
- Prefer listing with `StartAfter` set to `lastReportedTaskEventKey`, then follow pagination with continuation tokens until you have the next 100 new event keys or there are no more keys.
- Emit only the event objects you actually loaded and included in `REMOTE_CODEX_TASK_LOG_JSON`.
- Advance `lastReportedTaskEventKey` only to the last emitted event key. If there are more than 100 new events, do not skip them; keep the cursor at the 100th emitted event so the next wake emits the next batch.
- If `lastReportedTaskEventKey` is missing because this is the first orchestrator run or state was reset, bootstrap with the latest 100 events and include `"bootstrapWindow": true` in the metadata. Older historic events may exist, but no new events should be lost after the cursor is established.
- If the task-event list or an event object cannot be read, keep the previous cursor and include a short error in the human summary instead of advancing.

The preferred JSON shape is an object with metadata and events:

````text
REMOTE_CODEX_TASK_LOG_JSON
```json
{
  "prefix": "remote-codex/hosts/host-user/task-events/",
  "previousLastReportedTaskEventKey": "remote-codex/hosts/host-user/task-events/1780939903000-slot-001-job-a-attempt-a-task_started.json",
  "lastReportedTaskEventKey": "remote-codex/hosts/host-user/task-events/1780939917000-slot-001-job-b-attempt-b-task_completed.json",
  "batchSize": 100,
  "eventCount": 2,
  "truncated": false,
  "bootstrapWindow": false,
  "events": [
    {
      "eventType": "task_started",
      "ts": "2026-06-08T18:00:00Z",
      "slotId": "slot-001",
      "jobId": "job_...",
      "attemptId": "attempt_..."
    }
  ]
}
```
````

For backward compatibility, consumers should still tolerate the older bare-array shape, but orchestrators should emit the object shape above going forward.

````text
REMOTE_CODEX_TASK_LOG_JSON
```json
{
  "batchSize": 100,
  "eventCount": 2,
  "truncated": false,
  "bootstrapWindow": false,
  "events": [
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
}
```
````

If there are no new events, print:

````text
REMOTE_CODEX_TASK_LOG_JSON
```json
{
  "batchSize": 100,
  "eventCount": 0,
  "truncated": false,
  "bootstrapWindow": false,
  "events": []
}
```
````

Do not execute queue jobs from the orchestrator to fill this log. The log is assembled only from slot-written task event objects.

## Final Response Format

Every orchestrator automation wake must end with this readable markdown structure:

````text
Maintenance completed.

- Bundle: 2026-06-08.20
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
{
  "batchSize": 100,
  "eventCount": 0,
  "truncated": false,
  "bootstrapWindow": false,
  "events": []
}
```
````

Keep the human summary short, but preserve the line breaks and fenced JSON blocks. Never emit a single-line response containing labels plus JSON. Never emit `<![CDATA[` or `]]>`.

## Drift Rules

- Repair missing slot threads directly.
- Repair missing or stale slot automations by asking the owning slot thread to self-bootstrap.
- Repair stale automation prompts whose `remoteCodexBundleVersion` is missing or not `2026-06-08.20`.
- Prefer preserving existing slot threads over replacing them.
- Never create more active non-retiring slots than `desiredSlots`.
- Never renew a job lease from the orchestrator.
- Keep the human summary short, then use the exact `Final Response Format` with fenced JSON blocks.
