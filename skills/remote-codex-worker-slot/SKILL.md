---
name: remote-codex-worker-slot
description: Run one Codex-only remote worker slot wake cycle. Use inside slot Codex threads and automations to claim S3 pending jobs, maintain S3 leases, execute bounded Codex work, publish logs, and write structured results.
---

# Remote Codex Worker Slot

This skill runs inside a slot Codex thread. The slot owns queue polling, job claiming, lease renewal, logs, and results.

Do not create other worker slots. Do not maintain host capacity. The orchestrator does that.

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

1. Publish a slot heartbeat/status object under:
   ```text
   {rootPrefix}/hosts/{hostId}/slots/{slotId}.json
   ```
2. If the slot already has a `currentJobId`, inspect that job first.
3. If the job has `done.json`, clear local slot state and become idle.
4. If the job has `cancel.json`, stop work, write a canceled result if this slot owns the lease, and clear the slot.
5. If this slot still owns the lease, renew it with `If-Match: <etag>` and continue bounded work.
6. If the lease is missing, expired and reclaimable, or owned by another slot, clear local slot state.
7. If idle, list pending queue markers and try to claim the earliest eligible job.
8. Execute or continue bounded work.
9. Publish logs/status/result.
10. End the turn with a compact status summary.

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

1. Extract `jobId` from the final dash-delimited segment before `.json`.
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

## Logging

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
