#!/usr/bin/env python3
import argparse
import json
import os
import secrets
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timedelta, timezone


DEFAULT_BUCKET = "private.pearcommerce.com"
DEFAULT_ROOT_PREFIX = "remote-codex"
DEFAULT_POOL = "default"
DEFAULT_PRIORITY = 50
DEFAULT_LEASE_SECONDS = 600
DEFAULT_JOB_TIMEOUT_SECONDS = 3600
DEFAULT_WAIT_SECONDS = 600
DEFAULT_POLL_SECONDS = 15
REMOTE_CODEX_BUNDLE_VERSION = "2026-06-08.11"


def utc_now():
    return datetime.now(timezone.utc)


def iso(dt):
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def parse_time(value):
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def safe_part(value, name):
    if not value:
        raise ValueError(f"{name} must not be blank")
    allowed = set("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._:-")
    if any(ch not in allowed for ch in value):
        raise ValueError(f"{name} has unsafe characters for remote Codex S3 keys: {value}")
    return value


def positive_int(value):
    try:
        seconds = int(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError(f"{value!r} is not an integer") from exc
    if seconds <= 0:
        raise argparse.ArgumentTypeError("must be a positive number of seconds")
    return seconds


def root(value):
    return (value or DEFAULT_ROOT_PREFIX).strip("/")


def s3_uri(bucket, key):
    return f"s3://{bucket}/{key}"


def run_aws(args, check=True):
    env = os.environ.copy()
    env["PATH"] = "/opt/homebrew/bin:/usr/local/bin:" + env.get("PATH", "")
    proc = subprocess.run(
        ["aws", *args],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        env=env,
    )
    if check and proc.returncode != 0:
        raise RuntimeError(f"aws {' '.join(args)} failed\nSTDOUT:\n{proc.stdout}\nSTDERR:\n{proc.stderr}")
    return proc


def missing_error(proc):
    text = f"{proc.stdout}\n{proc.stderr}"
    return any(token in text for token in ["NoSuchKey", "Not Found", "404", "NotFound"])


def precondition_error(proc):
    text = f"{proc.stdout}\n{proc.stderr}"
    return any(token in text for token in ["PreconditionFailed", "412", "condition"])


def json_aws(args):
    proc = run_aws(args)
    if not proc.stdout.strip():
        return {}
    return json.loads(proc.stdout)


def put_json(bucket, key, value, if_none_match=None, if_match=None):
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
        json.dump(value, f, indent=2, sort_keys=True)
        f.write("\n")
        path = f.name
    try:
        args = [
            "s3api",
            "put-object",
            "--bucket",
            bucket,
            "--key",
            key,
            "--body",
            path,
            "--content-type",
            "application/json; charset=UTF-8",
        ]
        if if_none_match:
            args.extend(["--if-none-match", if_none_match])
        if if_match:
            args.extend(["--if-match", if_match])
        proc = run_aws(args, check=False)
        if proc.returncode != 0:
            if precondition_error(proc):
                return False
            raise RuntimeError(f"put-object failed for {key}\nSTDOUT:\n{proc.stdout}\nSTDERR:\n{proc.stderr}")
        return True
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass


def get_json(bucket, key):
    with tempfile.NamedTemporaryFile("r", suffix=".json", delete=False) as f:
        path = f.name
    try:
        proc = run_aws(["s3api", "get-object", "--bucket", bucket, "--key", key, path], check=False)
        if proc.returncode != 0:
            if missing_error(proc):
                return None
            raise RuntimeError(f"get-object failed for {key}\nSTDOUT:\n{proc.stdout}\nSTDERR:\n{proc.stderr}")
        with open(path) as fh:
            return json.load(fh)
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass


def get_text(bucket, key):
    with tempfile.NamedTemporaryFile("r", suffix=".txt", delete=False) as f:
        path = f.name
    try:
        proc = run_aws(["s3api", "get-object", "--bucket", bucket, "--key", key, path], check=False)
        if proc.returncode != 0:
            if missing_error(proc):
                return None
            raise RuntimeError(f"get-object failed for {key}\nSTDOUT:\n{proc.stdout}\nSTDERR:\n{proc.stderr}")
        with open(path) as fh:
            return fh.read()
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass


def head(bucket, key):
    proc = run_aws(["s3api", "head-object", "--bucket", bucket, "--key", key], check=False)
    if proc.returncode != 0:
        if missing_error(proc):
            return None
        raise RuntimeError(f"head-object failed for {key}\nSTDOUT:\n{proc.stdout}\nSTDERR:\n{proc.stderr}")
    return json.loads(proc.stdout)


def list_keys(bucket, prefix, max_keys=100):
    data = json_aws([
        "s3api",
        "list-objects-v2",
        "--bucket",
        bucket,
        "--prefix",
        prefix,
        "--max-keys",
        str(max_keys),
    ])
    return sorted(obj["Key"] for obj in data.get("Contents", []))


def job_prefix(args, job_id):
    return f"{root(args.root_prefix)}/jobs/{safe_part(job_id, 'jobId')}"


def request_key(args, job_id):
    return f"{job_prefix(args, job_id)}/request.json"


def schema_key(args, job_id):
    return f"{job_prefix(args, job_id)}/response-schema.json"


def lease_key(args, job_id):
    return f"{job_prefix(args, job_id)}/lease.json"


def done_key(args, job_id):
    return f"{job_prefix(args, job_id)}/done.json"


def cancel_key(args, job_id):
    return f"{job_prefix(args, job_id)}/cancel.json"


def attempt_prefix(args, job_id, attempt_id):
    return f"{job_prefix(args, job_id)}/attempts/{safe_part(attempt_id, 'attemptId')}"


def log_prefix(args, job_id, attempt_id):
    return f"{attempt_prefix(args, job_id, attempt_id)}/logs/"


def result_key(args, job_id, attempt_id):
    return f"{attempt_prefix(args, job_id, attempt_id)}/result.json"


def pending_key(args, job_id, created_ms, random_part):
    return (
        f"{root(args.root_prefix)}/queues/{safe_part(args.pool, 'pool')}/pending/"
        f"{int(args.priority):03d}-{created_ms:013d}-{random_part}-{safe_part(job_id, 'jobId')}.json"
    )


def default_schema():
    return {
        "type": "object",
        "required": ["ok", "summary", "data"],
        "properties": {
            "ok": {"type": "boolean"},
            "summary": {"type": "string"},
            "data": {"type": "object"},
            "errorType": {"type": "string"},
            "errorMessage": {"type": "string"},
            "rawOutputUri": {"type": "string"},
        },
        "additionalProperties": True,
    }


def default_prompt(test_id):
    return (
        "This is a remote Codex end-to-end probe. Do not edit files. "
        "Return a result envelope JSON object with ok=true, a short summary, "
        f"and data.testId exactly equal to {json.dumps(test_id)}. "
        "Include data.workerObservation with one sentence about the job request."
    )


def submit(args):
    created = utc_now()
    created_ms = int(created.timestamp() * 1000)
    test_id = args.test_id or f"remote_codex_probe_{created_ms}_{secrets.token_hex(3)}"
    job_id = args.job_id or f"job_test_{created_ms}_{secrets.token_hex(4)}"
    random_part = secrets.token_hex(4)
    req_key = request_key(args, job_id)
    resp_schema_key = schema_key(args, job_id)
    pend_key = pending_key(args, job_id, created_ms, random_part)
    schema = default_schema()
    prompt = args.prompt or default_prompt(test_id)
    request = {
        "version": 1,
        "jobId": job_id,
        "pool": args.pool,
        "priority": args.priority,
        "createdAt": iso(created),
        "createdBy": args.created_by,
        "prompt": prompt,
        "mode": args.mode,
        "remoteCodexBundleVersion": REMOTE_CODEX_BUNDLE_VERSION,
        "limits": {
            "maxAttempts": args.max_attempts,
            "timeoutSeconds": args.timeout_seconds,
            "leaseSeconds": args.lease_seconds,
        },
        "response": {
            "schemaUri": s3_uri(args.bucket, resp_schema_key),
        },
        "test": {
            "testId": test_id,
            "kind": "remote-codex-e2e",
        },
    }
    marker = {
        "version": 1,
        "jobId": job_id,
        "pool": args.pool,
        "priority": args.priority,
        "remoteCodexBundleVersion": REMOTE_CODEX_BUNDLE_VERSION,
        "createdAt": iso(created),
        "requestUri": s3_uri(args.bucket, req_key),
        "responseSchemaUri": s3_uri(args.bucket, resp_schema_key),
        "testId": test_id,
    }
    put_json(args.bucket, req_key, request, if_none_match="*")
    put_json(args.bucket, resp_schema_key, schema, if_none_match="*")
    put_json(args.bucket, pend_key, marker, if_none_match="*")
    out = {
        "jobId": job_id,
        "testId": test_id,
        "pendingKey": pend_key,
        "requestUri": s3_uri(args.bucket, req_key),
        "responseSchemaUri": s3_uri(args.bucket, resp_schema_key),
    }
    print(json.dumps(out, indent=2, sort_keys=True))
    return out


def status_obj(args, job_id):
    done = get_json(args.bucket, done_key(args, job_id))
    cancel = head(args.bucket, cancel_key(args, job_id)) is not None
    if done:
        state = done.get("status", "failed").lower()
        return {
            "jobId": job_id,
            "state": "succeeded" if state in ("succeeded", "success") else state,
            "done": done,
            "cancelRequested": cancel,
        }
    lease = get_json(args.bucket, lease_key(args, job_id))
    if lease:
        expires = parse_time(lease.get("leaseExpiresAt"))
        state = "cancel_requested" if cancel else "running"
        if not cancel and expires and expires <= utc_now():
            state = "stale"
        return {
            "jobId": job_id,
            "state": state,
            "lease": lease,
            "cancelRequested": cancel,
        }
    if cancel:
        return {"jobId": job_id, "state": "cancel_requested", "cancelRequested": True}
    if head(args.bucket, request_key(args, job_id)):
        return {"jobId": job_id, "state": "queued", "cancelRequested": False}
    return {"jobId": job_id, "state": "unknown", "cancelRequested": False}


def cmd_status(args):
    print(json.dumps(status_obj(args, args.job_id), indent=2, sort_keys=True))


def s3_uri_key(args, uri):
    prefix = f"s3://{args.bucket}/"
    if not uri.startswith(prefix):
        raise ValueError(f"URI is outside bucket {args.bucket}: {uri}")
    return uri[len(prefix):]


def read_result(args, status):
    done = status.get("done") or {}
    result_uri = done.get("resultUri")
    if not result_uri:
        return None
    return get_json(args.bucket, s3_uri_key(args, result_uri))


def validate_result(result, expected_test_id=None):
    if not isinstance(result, dict):
        raise RuntimeError("result.json was not a JSON object")
    if result.get("ok") is not True:
        raise RuntimeError(f"result ok was not true: {result}")
    if not isinstance(result.get("summary"), str) or not result["summary"].strip():
        raise RuntimeError("result summary was missing")
    if not isinstance(result.get("data"), dict):
        raise RuntimeError("result data was missing or not an object")
    if expected_test_id is not None and result["data"].get("testId") != expected_test_id:
        raise RuntimeError(f"result data.testId did not match {expected_test_id}: {result}")


def wait_for_job(args, job_id, expected_test_id=None):
    deadline = time.time() + args.wait_seconds
    last_state = None
    while True:
        current = status_obj(args, job_id)
        state = current["state"]
        if state != last_state or args.verbose:
            print(json.dumps(current, indent=2, sort_keys=True))
            last_state = state
        if state == "succeeded":
            result = read_result(args, current)
            if result is not None:
                validate_result(result, expected_test_id=expected_test_id)
                print(json.dumps({"result": result}, indent=2, sort_keys=True))
            return current
        if state in ("failed", "canceled", "cancelled", "schema_validation_failed"):
            raise RuntimeError(f"job reached terminal failure state: {state}")
        if time.time() >= deadline:
            raise TimeoutError(f"timed out waiting for job {job_id}; last state was {state}")
        time.sleep(args.poll_seconds)


def cmd_wait(args):
    wait_for_job(args, args.job_id)


def cmd_tail_logs(args):
    prefix = log_prefix(args, args.job_id, args.attempt_id)
    keys = list_keys(args.bucket, prefix, max_keys=args.max_keys)
    for key in keys:
        text = get_text(args.bucket, key)
        print(f"===== {s3_uri(args.bucket, key)}")
        print(text or "", end="" if text and text.endswith("\n") else "\n")


def cmd_hosts(args):
    keys = list_keys(args.bucket, f"{root(args.root_prefix)}/hosts/", max_keys=args.max_keys)
    heartbeat_keys = [k for k in keys if k.endswith("/heartbeat.json") or k.endswith("/orchestrator.json") or "/slots/" in k]
    docs = []
    for key in heartbeat_keys:
        docs.append({"key": key, "value": get_json(args.bucket, key)})
    print(json.dumps(docs, indent=2, sort_keys=True))


def cmd_submit(args):
    submit(args)


def cmd_run_e2e(args):
    submitted = submit(args)
    wait_for_job(args, submitted["jobId"], expected_test_id=submitted["testId"])


def cmd_protocol_smoke(args):
    submitted = submit(args)
    job_id = submitted["jobId"]
    attempt_id = f"attempt_smoke_{int(time.time() * 1000)}_{secrets.token_hex(3)}"
    now = utc_now()
    lease = {
        "jobId": job_id,
        "attemptId": attempt_id,
        "hostId": "protocol-smoke",
        "slotId": "slot-smoke",
        "workerThreadId": "protocol-smoke",
        "status": "running",
        "leaseExpiresAt": iso(now + timedelta(seconds=args.lease_seconds)),
        "lastRenewedAt": iso(now),
        "lastProgressAt": iso(now),
        "lastLogSeq": 1,
    }
    if not put_json(args.bucket, lease_key(args, job_id), lease, if_none_match="*"):
        raise RuntimeError(f"could not claim synthetic lease for {job_id}")
    log_key = f"{log_prefix(args, job_id, attempt_id)}000001.jsonl"
    log_event = {"ts": iso(utc_now()), "type": "protocol-smoke", "message": "synthetic worker completed job"}
    put_json(args.bucket, log_key, log_event, if_none_match="*")
    result = {
        "ok": True,
        "summary": "Protocol smoke completed without a real Codex worker.",
        "data": {
            "jobId": job_id,
            "testId": submitted["testId"],
            "synthetic": True,
        },
    }
    res_key = result_key(args, job_id, attempt_id)
    put_json(args.bucket, res_key, result, if_none_match="*")
    done = {
        "jobId": job_id,
        "attemptId": attempt_id,
        "status": "succeeded",
        "workerThreadId": "protocol-smoke",
        "resultUri": s3_uri(args.bucket, res_key),
        "logPrefixUri": s3_uri(args.bucket, log_prefix(args, job_id, attempt_id)),
        "completedAt": iso(utc_now()),
    }
    if not put_json(args.bucket, done_key(args, job_id), done, if_none_match="*"):
        raise RuntimeError(f"could not write done marker for {job_id}")
    final_status = status_obj(args, job_id)
    final_result = read_result(args, final_status)
    validate_result(final_result, expected_test_id=submitted["testId"])
    print(json.dumps({"status": final_status, "result": final_result}, indent=2, sort_keys=True))


def add_common(parser):
    parser.add_argument("--bucket", default=DEFAULT_BUCKET)
    parser.add_argument("--root-prefix", default=DEFAULT_ROOT_PREFIX)
    parser.add_argument("--pool", default=DEFAULT_POOL)


def add_submit_args(parser):
    add_common(parser)
    parser.add_argument("--priority", type=int, default=DEFAULT_PRIORITY)
    parser.add_argument("--job-id")
    parser.add_argument("--test-id")
    parser.add_argument("--prompt")
    parser.add_argument("--mode", default="ask")
    parser.add_argument("--created-by", default="remote-codex-test-flow")
    parser.add_argument("--max-attempts", type=positive_int, default=2)
    parser.add_argument("--timeout-seconds", type=positive_int, default=DEFAULT_JOB_TIMEOUT_SECONDS)
    parser.add_argument("--lease-seconds", type=positive_int, default=DEFAULT_LEASE_SECONDS)


def main():
    parser = argparse.ArgumentParser(description="Requester-side Codex client for S3-only remote Codex jobs.")
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("submit")
    add_submit_args(p)
    p.set_defaults(func=cmd_submit)

    p = sub.add_parser("run-e2e")
    add_submit_args(p)
    p.add_argument("--wait-seconds", type=positive_int, default=DEFAULT_WAIT_SECONDS)
    p.add_argument("--poll-seconds", type=positive_int, default=DEFAULT_POLL_SECONDS)
    p.add_argument("--verbose", action="store_true")
    p.set_defaults(func=cmd_run_e2e)

    p = sub.add_parser("status")
    add_common(p)
    p.add_argument("--job-id", required=True)
    p.set_defaults(func=cmd_status)

    p = sub.add_parser("wait")
    add_common(p)
    p.add_argument("--job-id", required=True)
    p.add_argument("--wait-seconds", type=positive_int, default=DEFAULT_WAIT_SECONDS)
    p.add_argument("--poll-seconds", type=positive_int, default=DEFAULT_POLL_SECONDS)
    p.add_argument("--verbose", action="store_true")
    p.set_defaults(func=cmd_wait)

    p = sub.add_parser("tail-logs")
    add_common(p)
    p.add_argument("--job-id", required=True)
    p.add_argument("--attempt-id", required=True)
    p.add_argument("--max-keys", type=int, default=100)
    p.set_defaults(func=cmd_tail_logs)

    p = sub.add_parser("hosts")
    add_common(p)
    p.add_argument("--max-keys", type=int, default=200)
    p.set_defaults(func=cmd_hosts)

    p = sub.add_parser("protocol-smoke")
    add_submit_args(p)
    p.set_defaults(func=cmd_protocol_smoke)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"remote_codex_client.py: {exc}", file=sys.stderr)
        sys.exit(2)
