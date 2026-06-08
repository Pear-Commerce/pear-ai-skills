---
name: remote-codex-worker-slot
description: Run one Codex-only remote worker slot wake cycle. Use inside slot Codex threads and automations to claim one S3 pending job at a time, maintain S3 leases, execute bounded Codex work, publish logs, and write structured results.
remote_codex_bundle_version: "2026-06-08.20"
---

# Remote Codex Worker Slot

Bundle version: `2026-06-08.20`

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

Optional config:

```json
{
  "maxSequentialJobsPerWake": null,
  "wakeStopAfterSeconds": null
}
```

These optional fields are safety caps, not queue fairness defaults. When they are missing or null, keep looping until no eligible task is found or another safety stop applies. Regardless of caps, a slot must own at most one active job lease at a time.

## Wake Cycle

Each automation wake should run a repeat-until-empty worker loop and then stop cleanly. The loop is:

1. Find or continue one task.
2. If no eligible task is found, stop the entire wake.
3. If a task is found, execute or continue that task.
4. When that task is terminal and the slot has cleared `currentJobId`, go back to step 1.

The invariant is one active lease at a time. Do not prefetch leases. Do not claim a second pending marker while the current job is still running, blocked, canceling, timing out, or waiting for result publication. It is fine for one awake slot to process multiple tasks serially, but only after each prior task has been completed, logged, and cleared.

1. Use `$remote-codex-updater` before doing anything else.
2. Print a concise diagnostic plan for this wake: slot id, whether you expect to inspect an existing job or scan pending work, that this wake will repeat until empty with at most one active lease, and the major steps you will take.
3. Create or refresh this slot thread's own heartbeat automation on a 1-minute cadence. Prefer `destination=thread` when running in the slot thread; if updating by id, keep `targetThreadId` equal to the current slot thread id. The prompt must include `remoteCodexBundleVersion: 2026-06-08.20`.
4. If the updater reports this invocation or automation is stale, finish the self-refresh above, publish a stale-version slot heartbeat that says `staleVersionRefreshed: true`, print a diagnostic explaining that work was skipped because the automation was stale, and stop before claiming or continuing work.
5. Publish a slot heartbeat/status object under:
   ```text
   {rootPrefix}/hosts/{hostId}/slots/{slotId}.json
   ```
6. Initialize repeat-until-empty state for this wake: `activeJobId`, `jobsClaimedThisWake`, `jobsCompletedThisWake`, `queueScansThisWake`, and `wakeStopReason`.
7. Enter the repeat-until-empty loop:
   - If the slot already has a `currentJobId`, inspect that job first and set it as the only active job.
   - If the active job has `done.json`, clear local slot state, publish an idle heartbeat, and continue the loop.
   - If the active job has `cancel.json`, write a canceled result if this slot owns the lease, clear the slot, publish an idle heartbeat, and continue the loop unless a safety stop applies.
   - If this slot still owns the active job lease, renew it with `If-Match: <etag>` and continue bounded work for that job.
   - If the active job lease is missing, expired and reclaimable, or owned by another slot, clear local slot state, publish an idle heartbeat, and continue the loop unless a safety stop applies.
   - If idle and there is no active job, list pending queue markers and try to claim the earliest eligible job. If no eligible job can be claimed after scanning candidates, set `wakeStopReason: "queue_empty"` and stop cleanly.
   - After one claim succeeds, set `activeJobId` and increment `jobsClaimedThisWake`. Do not inspect or claim any other pending marker until this active job is terminal, released, or lost.
   - Execute or continue bounded work for the active job.
   - Publish logs/status/result.
   - If the job is still running, blocked on user/external input, canceled, timed out, or only made bounded progress, set `wakeStopReason` to that state and stop; the next automation wake will continue it.
   - If the job completed terminally and the slot cleared `currentJobId`, increment counters, publish an updated idle slot heartbeat with `wakeStopReason: "completed_job_continuing"`, clear `activeJobId`, and immediately continue the loop.
8. Stop the repeat-until-empty loop when any safety stop applies:
   - the queue has no eligible pending jobs;
   - the updater was stale and the automation was refreshed;
   - the active job remains running, blocked, or only partially progressed;
   - the active job lease was lost and the slot cannot safely continue it;
   - AWS/S3 credentials or access are unavailable;
   - `maxSequentialJobsPerWake` is configured and reached;
   - `wakeStopAfterSeconds` is configured and reached;
   - the turn is approaching a practical limit where another claim would risk missing lease renewal, result publication, or a clean final status.
9. End the turn with a compact status summary that includes jobs claimed/completed this wake and `wakeStopReason`.

## Owned Automation Prompt

Use a heartbeat automation attached to this slot thread:

Schedule it every 1 minute.

```text
Use $remote-codex-updater first, then $remote-codex-worker-slot.
remoteCodexBundleVersion: 2026-06-08.20
Run one bounded repeat-until-empty worker wake cycle for this configured slot: print concise worker diagnostics including task action and fallback steps, self-refresh this slot automation if stale, renew or release the current job lease, claim one eligible pending job if idle, write host task start/complete events, perform bounded work, publish logs/status/result to S3, then loop back to scan for another eligible pending job only after the active job is terminal, released, or lost and the slot has cleared currentJobId. Never prefetch leases; own at most one active job lease at a time. Stop cleanly with a wakeStopReason when the queue is empty or a safety stop applies. Mirror major diagnostics into job log chunks when an attempt exists.
```

## Queue Listing

List candidates only when this wake is idle and has no active job lease:

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

After a job completes terminally, clear `currentJobId`, publish an idle heartbeat, then list pending markers again and try to claim the next eligible job. This is sequential repeat-until-empty, not lease prefetching.

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

## Shell Portability

Worker slots may run from different shells or project environments. Keep protocol helper commands portable:

- Prefer `python3` for ISO timestamps, epoch milliseconds, JSON shaping, and deadline math instead of shell-specific `date` flags such as BSD/macOS `date -v`.
- Do not use shell variable names that collide with common shell builtins or special parameters. In `zsh`, for example, `status` is reserved; use names like `job_status`, `lease_status`, or `result_status`.
- Use `mktemp` files for JSON payloads and validate generated JSON with `jq` or `python3 -m json.tool` before S3 writes when the payload is built across multiple steps.

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
- Repeat-until-empty: whether this wake is continuing an existing job, claiming a new job, or looping after a completed job, and why it eventually stopped.
- Queue scan: candidate count, scan number, and whether an eligible job exists.
- Claim result: claimed job id/attempt id, skipped because already done/timed out/max-attempts, or lost race to another slot.
- Lease result: renewed, lost, stale-reclaimed, or released.
- Task action/fallback steps: before a material external action or tool route, say what you are about to try and why; if it fails, say the fallback. Examples: `opening Chrome to whatsmyip.com`, `Chrome extension connection failed; trying the Chrome connector/MCP`, `page did not show an IP yet; waiting for DOMContentLoaded`, `schema parse failed; writing schema_validation_failed result`.
- Work result: started prompt work, made bounded progress, blocked, errored, timed out, canceled, or completed.
- Final state: idle/running/completed/blocked, jobs claimed/completed this wake, `wakeStopReason`, and what was written to S3.

Do not dump full prompts, secrets, credentials, or large response bodies into thread diagnostics. Summarize job prompts in a short phrase only when needed to orient the reader. Diagnostics should not delay real work; one sentence per major transition is enough. For task action/fallback steps, log material tool/browser/network attempts and fallback decisions, not every low-level shell command or every S3 object write.

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

Follow the request prompt and mode. Keep each individual job step bounded enough that the lease can be renewed. For large work, make progress, write logs/status, and let the next automation wake continue from thread context and S3 state. For short or completed jobs, publish the terminal result, clear local slot state, then return to the top of the repeat-until-empty loop to look for the next task.

## Job Compatibility

The remote Codex bundle version is not a job compatibility gate. A slot running bundle `.8` may execute a job submitted while `.7` was installed, and later workers should keep executing older queued jobs unless the actual job state makes them ineligible.

When deciding whether to claim or continue a job, use only protocol facts such as pool, `done.json`, `cancel.json`, lease ownership/expiry, `limits.timeoutSeconds`, `limits.maxAttempts`, and whether the request has the fields needed to execute safely. Ignore any `remoteCodexBundleVersion` found in `request.json`, pending markers, logs, or other job-owned S3 objects; at most, treat it as diagnostic metadata from the requester that created the job.

The `version` fields on request, marker, heartbeat, event, or result objects are object-shape markers. They should help readers understand the JSON shape, but they do not by themselves make a task unexecutable. If an older object is missing a field that newer workers need, apply the documented default when one exists; otherwise write a clear failed result or blocker log for the missing field instead of silently dropping the job.

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
6. Return to the top of the repeat-until-empty loop with `wakeStopReason: "completed_job_continuing"`. Do not claim another job until `done.json`, result/logs, host task events, and the cleared idle slot heartbeat have been written for the completed job.

If `done.json` already exists, treat the job as terminal and clear the slot.

## Safety

- Respect `cancel.json`.
- Respect request `maxAttempts`, `timeoutSeconds`, and `leaseSeconds`.
- Do not process jobs from another pool.
- Do not run destructive production actions unless the request explicitly allows them and Pear safety skills permit them.
- If blocked by missing AWS credentials or inaccessible S3, write a slot heartbeat explaining the blocker and stop.
