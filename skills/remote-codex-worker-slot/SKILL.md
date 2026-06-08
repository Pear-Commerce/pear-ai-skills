---
name: remote-codex-worker-slot
description: Run one Codex-only remote worker slot wake cycle. Use inside slot Codex threads and automations to claim S3 pending jobs, maintain S3 leases, execute bounded Codex work, publish logs, and write structured results.
remote_codex_bundle_version: "2026-06-08.9"
---

# Remote Codex Worker Slot

Bundle version: `2026-06-08.9`

This skill runs inside a slot Codex thread. The slot owns queue polling, job claiming, lease renewal, logs, and results.

Do not create other worker slots. Do not maintain host capacity. The orchestrator does that.
Do create or refresh this slot thread's own heartbeat automation from inside the slot thread before claiming queue work. Do not rely on the orchestrator or setup thread to own this automation.

## Inputs

Read config from the current thread prompt and, when available, from:

```text
s3://{bucket}/{rootPrefix}/hosts/{hostId}/slots/{slotId}.json
```

Required config:

```json
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

## Wake Cycle

Each automation wake should do one bounded cycle and then stop cleanly.

1. Use `$remote-codex-updater` before doing anything else.
2. Print a concise diagnostic plan for this wake: slot id, whether you expect to inspect an existing job or scan pending work, and the major steps you will take.
3. Create or refresh this slot thread's own heartbeat automation on a 1-minute cadence. Prefer `destination=thread` when running in the slot thread; if updating by id, keep `targetThreadId` equal to the current slot thread id. The prompt must include `remoteCodexBundleVersion: 2026-06-08.9`.
4. If the updater reports this invocation or automation is stale, finish the self-refresh above, publish a stale-version slot heartbeat that says `staleVersionRefreshed: true`, print a diagnostic explaining that work was skipped because the automation was stale, and stop before claiming or continuing work.
5. Publish a slot heartbeat/status object under:
   ```text
   {rootPrefix}/hosts/{hostId}/slots/{slotId}.json
   ```
6. If the slot already has a `currentJobId`, inspect that job first.
7. If the job has `done.json`, clear local slot state and become idle.
8. If the job has `cancel.json`, stop work, write a canceled result if this slot owns the lease, and clear the slot.
9. If this slot still owns the lease, renew it with `If-Match: <etag>` and continue bounded work.
10. If the lease is missing, expired and reclaimable, or owned by another slot, clear local slot state.
11. If idle, list pending queue markers and try to claim the earliest eligible job.
12. Execute or continue bounded work.
13. Publish logs/status/result.
14. End the turn with a compact status summary.

## Owned Automation Prompt

Use a heartbeat automation attached to this slot thread:

Schedule it every 1 minute.

```text
Use $remote-codex-updater first, then $remote-codex-worker-slot.
remoteCodexBundleVersion: 2026-06-08.9
Run one bounded worker wake cycle for this configured slot: print concise worker diagnostics, self-refresh this slot automation if stale, renew or release the current job lease, claim an eligible pending job if idle, write host task start/complete events, perform bounded work, publish logs/status/result to S3, mirror major diagnostics into job log chunks when an attempt exists, and stop cleanly.
```

## Queue Listing

List candidates:

```bash
aws s3api list-objects-v2 \
  --bucket "$BUCKET" \
  --prefix "$ROOT_PREFIX/queues/$POOL/pending/" \
  --max-keys "${MAX_CANDIDATES:-20}" \
  --query 'Contents[].Key' \
  --output json
```

S3 general purpose buckets return keys lexicographically. Pending keys are shaped so lower priority and earlier creation millis sort first:

```text
{rootPrefix}/queues/{pool}/pending/{priority}-{createdAtMillis}-{random}-{jobId}.json
```

## Claim Protocol

For each candidate:

1. Extract `jobId` by removing `.json`, then splitting the file name on the first three dashes: `{priority}-{createdAtMillis}-{random}-{jobId}`. The `jobId` itself may contain dashes.
2. Skip if `{rootPrefix}/jobs/{jobId}/done.json` exists.
3. Build a lease body:
   ```json
   {
     "jobId": "job_...",
     "attemptId": "attempt_...",
     "hostId": "host-user",
     "slotId": "slot-001",
     "workerThreadId": "019...",
     "status": "running",
     "leaseExpiresAt": "...",
     "lastRenewedAt": "...",
     "lastProgressAt": "...",
     "lastLogSeq": 0
   }
   ```
4. Try first claim:
   ```bash
   aws s3api put-object \
     --bucket "$BUCKET" \
     --key "$ROOT_PREFIX/jobs/$JOB_ID/lease.json" \
     --body "$LEASE_FILE" \
     --content-type "application/json; charset=UTF-8" \
     --if-none-match "*"
   ```
5. If a lease exists, read it and its ETag. If `leaseExpiresAt` is in the past, try stale reclaim:
   ```bash
   aws s3api put-object \
     --bucket "$BUCKET" \
     --key "$ROOT_PREFIX/jobs/$JOB_ID/lease.json" \
     --body "$LEASE_FILE" \
     --content-type "application/json; charset=UTF-8" \
     --if-match "$LEASE_ETAG"
   ```
6. If conditional write fails, another worker owns the job. Try the next candidate.

## Lease Renewal

Renew before work and after meaningful work:

```bash
aws s3api put-object \
  --bucket "$BUCKET" \
  --key "$ROOT_PREFIX/jobs/$JOB_ID/lease.json" \
  --body "$LEASE_FILE" \
  --content-type "application/json; charset=UTF-8" \
  --if-match "$LEASE_ETAG"
```

If renewal fails, stop working on that job. Do not write a terminal result after losing the lease.

## Host Task Events

Write immutable host task events so the orchestrator thread can print a simple task log.

Event objects live at:

```text
{rootPrefix}/hosts/{hostId}/task-events/{eventTimeMillis}-{slotId}-{jobId}-{attemptId}-{eventType}.json
```

Use zero-padded 13-digit Unix epoch milliseconds for `eventTimeMillis` so keys sort chronologically. Event files are append-only; never rewrite an existing event.

When this slot claims a job, write a `task_started` event immediately after the lease claim succeeds and before executing prompt work:

```json
{
  "version": 1,
  "eventType": "task_started",
  "ts": "2026-06-08T18:00:00Z",
  "hostId": "host-user",
  "slotId": "slot-001",
  "jobId": "job_...",
  "attemptId": "attempt_...",
  "workerThreadId": "019...",
  "requestUri": "s3://..."
}
```

When this slot writes a terminal result and `done.json`, write a `task_completed` event after `done.json` succeeds:

```json
{
  "version": 1,
  "eventType": "task_completed",
  "ts": "2026-06-08T18:00:00Z",
  "hostId": "host-user",
  "slotId": "slot-001",
  "jobId": "job_...",
  "attemptId": "attempt_...",
  "workerThreadId": "019...",
  "status": "succeeded",
  "resultUri": "s3://...",
  "doneUri": "s3://...",
  "outputJson": {
    "ok": true,
    "summary": "Short human-readable summary",
    "data": {}
  }
}
```

For failed, timed-out, canceled, or schema-validation terminal results, still write `task_completed` with `status` matching `done.json` and `outputJson` set to the result envelope that was written to `result.json`. If the completion event write fails after `done.json` succeeds, do not retry by rewriting `done.json`; instead write a normal job log chunk describing the missed host task event.

## Logging

Print simple diagnostics in the worker slot thread as the automation runs. Keep these diagnostics short and useful:

- Start of wake: slot id, current-job expectation, and plan.
- Updater result: current, refreshed, or stale-and-stopping.
- Automation refresh result.
- Queue scan: candidate count and whether an eligible job exists.
- Claim result: claimed job id/attempt id, skipped because already done/timed out/max-attempts, or lost race to another slot.
- Lease result: renewed, lost, stale-reclaimed, or released.
- Work result: started prompt work, made bounded progress, blocked, errored, timed out, canceled, or completed.
- Final state: idle/running/completed/blocked and what was written to S3.

Do not dump full prompts, secrets, credentials, or large response bodies into thread diagnostics. Summarize job prompts in a short phrase only when needed to orient the reader. Diagnostics should not delay real work; one sentence per major transition is enough.

When a job attempt exists, mirror major diagnostics into that attempt's immutable S3 log chunks as JSON lines. Use `type: "diagnostic"` for plan/progress messages, `type: "status"` for state changes, and `type: "error"` for failures or blockers. If there is no active attempt yet, the thread diagnostic and slot heartbeat message are enough.

Write immutable log chunks:

```text
{rootPrefix}/jobs/{jobId}/attempts/{attemptId}/logs/{seq}.jsonl
```

Events should be JSON lines:

```json
{"ts":"2026-06-08T18:00:00Z","type":"status","message":"claimed job"}
```

Do not rewrite one large log file.

## Executing Jobs

Read:

```text
{rootPrefix}/jobs/{jobId}/request.json
{rootPrefix}/jobs/{jobId}/response-schema.json
```

Follow the request prompt and mode. Keep each wake bounded enough that the lease can be renewed. For large work, make progress, write logs/status, and let the next automation wake continue from thread context and S3 state.

## Timeout Handling

Every job request may include:

```json
{
  "createdAt": "2026-06-08T18:00:00Z",
  "limits": {
    "timeoutSeconds": 3600,
    "leaseSeconds": 600,
    "maxAttempts": 2
  }
}
```

Treat `limits.timeoutSeconds` as the job execution deadline measured from `request.createdAt`. Before claiming, continuing, renewing, or completing a job, compute `createdAt + timeoutSeconds`. If the deadline is in the past:

1. Claim or renew the lease only if needed to be the current lease owner.
2. Write a timeout result envelope:
   ```json
   {
     "ok": false,
     "errorType": "timeout",
     "errorMessage": "Remote Codex job exceeded limits.timeoutSeconds"
   }
   ```
3. Write `done.json` with `status: "failed"`, the timeout result URI, and log prefix URI.
4. Clear `currentJobId` and skip any remaining work for that job.

Do not start new prompt work when the remaining timeout is too short to safely complete one bounded wake and write logs/results.

Before terminal success, produce a result envelope:

```json
{
  "ok": true,
  "summary": "Short human-readable summary",
  "data": {}
}
```

If the requested schema cannot be satisfied:

```json
{
  "ok": false,
  "errorType": "schema_validation_failed",
  "errorMessage": "Short reason",
  "rawOutputUri": "s3://..."
}
```

## Completion Protocol

Only the current lease owner may complete a job.

1. Renew the lease with `If-Match`.
2. Write:
   ```text
   {rootPrefix}/jobs/{jobId}/attempts/{attemptId}/result.json
   ```
3. Create terminal marker with `If-None-Match: *`:
   ```text
   {rootPrefix}/jobs/{jobId}/done.json
   ```
4. `done.json` shape:
   ```json
   {
     "jobId": "job_...",
     "attemptId": "attempt_...",
     "status": "succeeded",
     "workerThreadId": "019...",
     "resultUri": "s3://...",
     "logPrefixUri": "s3://...",
     "completedAt": "2026-06-08T18:00:00Z"
   }
   ```
5. Clear slot `currentJobId`.

If `done.json` already exists, treat the job as terminal and clear the slot.

## Safety

- Respect `cancel.json`.
- Respect request `maxAttempts`, `timeoutSeconds`, and `leaseSeconds`.
- Do not process jobs from another pool.
- Do not run destructive production actions unless the request explicitly allows them and Pear safety skills permit them.
- If blocked by missing AWS credentials or inaccessible S3, write a slot heartbeat explaining the blocker and stop.
