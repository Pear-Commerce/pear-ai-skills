---
name: "step9-phase4-stabilization"
description: "Use for Step9 Phase 4 stabilization, gold-standard retailer runs, Stage9-vs-artifact parity verification, tracker updates, watchdog reviews, and supervising flaky long-running Step9 runs without rediscovering launch/provenance traps."
metadata:
  short-description: "Step9 Phase 4 run supervision and parity stabilization"
---

# Step9 Phase 4 Stabilization

Use this skill in `/Users/eric/api.pearcommerce.com` when working on Step9 Phase 4 stabilization, gold-standard runs, retailer artifact parity, or the tracker.

## First Moves

Read before changing Step9 behavior or tracker state:

```bash
sed -n '1,220p' src/com/pear/codegen/Step9SolverHarness.md
sed -n '1,220p' src/com/pear/codegen/Step9PipelineContracts.md
sed -n '1,220p' src/com/pear/codegen/Step9Phase4Tracker.md
```

Keep exactly one retailer `ACTIVE`. Do not switch retailers until the current one is `DONE`, `BLOCKED`, or `PARKED` in the tracker.

When multiple source fixes are already pending or watchdog-approved, prefer integrating all of them before launching new residential verification runs. Run one focused regression batch over the combined source state, then launch the affected retailers in parallel up to the four-active-run cap. Do not relaunch a retailer with a known unresolved source bug just to reproduce the same failure.

For final wave closure, the verification scope is every non-skipped retailer. Older green runs are regression anchors only if they happened before the last production code change. After the final production code commit, launch fresh residential A/C verification in four-at-a-time batches for all retailers except `hollywoodfeed`.

Prioritize final-wave launch order by code-change risk: latest-production-code-change retailers first, recent Step9-source-fix retailers next, unchanged regression anchors last. If a touched retailer exposes a real semantic/source/codegen comparison failure, stop launching new final-wave retailers until the fixer + watchdog + commit loop completes and the post-code-change wave is reset. Lower-risk runs already in flight may continue, but they become regression anchors if another production source commit lands.

## Launch Runs

Prefer the Phase 4 launcher. It uses detached `screen` by default because plain `nohup` can disconnect the Gradle client and cancel the build while leaving idle Gradle daemons behind.

```bash
devops/step9_phase4_launch.sh --retailer walmart
```

The launcher prints `ts`, `screenSession`, log paths, summary paths, and expected generated source paths. Copy those into the tracker/heartbeat.

For final wave closure, launch fresh residential A/C verification only after the last production code change has been committed. Earlier green runs are regression evidence, but they do not close the wave if later production code changes could have affected them. The final batch plan must cover every non-skipped retailer, not only retailers touched by the final patch, and should front-load the retailers most directly touched by the latest production code change.

When launching a multi-retailer batch, stagger individual launcher invocations by at least 2 seconds. Same-second launches can share the same wrapper timestamp, which causes master/artifact-summary path collisions and makes the evidence unusable. If this happens, stop the collided just-launched batch promptly, mark that timestamp discarded, and relaunch with unique actual timestamps.

## Supervise Runs

Use the supervisor before deciding whether a run is alive, orphaned, or complete:

```bash
devops/step9_phase4_supervise.sh --retailer walmart --ts 20260424-142633
```

Interpretation:

- `RUNNING_REAL`: keep waiting; do not kill the process.
- `ORPHANED_LAUNCH`: startup happened but no real Step9 process/summaries/sources exist; record it before relaunching.
- `COMPLETED_SUCCESS`: inspect same-run Stage9-vs-artifact evidence before any `DONE` claim.
- `COMPLETED_FAIL`: update the tracker with exact failure evidence, then classify and fix the drift.
- `MISSING_SUMMARIES` or `UNKNOWN`: gather more local evidence before relaunching.

Never treat an idle `GradleWorkerMain` by itself as proof a run is active. A real run should have evidence such as `step9_gold_standard.sh run`, `worker-harness <retailer> <ts>`, `springboot-tomcat-local.sh`, or Gradle `runBootstrappedMain`, plus moving logs or eventual summaries.

For long runs, close out with a 10-minute heartbeat that names the current `ts`, exact paths, active retailer, next supervision command, email status rule, remote Gmail direction rule, and any active fixer/watchdog subagent rule. A 15-minute heartbeat is acceptable during quiet transport-wait stretches, but active final-wave/fix loops should not use 30-minute cadence.

Do not close out while a fixer or watchdog subagent is still running on the critical path. Stay in the thread, wait for the subagent result, and advance the next gate (review, watchdog, commit, relaunch, tracker update) unless the user explicitly asks to pause or hand off to heartbeat. Heartbeats should supervise long Step9 runners, not replace waiting on active subagents.

When the user is away or asks for mail, send concise status updates through `devops/send_step9_status_email.sh`. Discovery is done: AWS CLI v2 is available, default region is `us-east-1`, the IAM caller is `arn:aws:iam::042357577846:user/eric`, and repo mail precedent uses SES in `us-east-1` from `customer.success@pearcommerce.com`. Default recipient is `eric@pearcommerce.com`. Keep email tone around `7/10` goblin-y while preserving exact operational facts: active timestamps, latest source/tracker commits, blocker, next gate, and final-wave reset status.

When the user is away and may reply to status emails, run `devops/pull_step9_remote_prompts.sh` before the next substantive decision. The helper uses the same Gmail OAuth/DB path as `GmailUtil` and `GmailLabelJob`, writes new de-duplicated reply directions to `/tmp/step9-remote-prompts.md`, and updates `/tmp/step9-remote-prompts-seen.json`. Treat new entries as user direction at a distance with the same safety rules as direct thread messages, and record any workflow-changing remote instruction in the tracker/status email. Use `--peek` only for testing because it does not update seen-message state.

## Stabilization Rules

- Runtime/Stage9 remains semantic authority.
- Artifacts replay persisted truth; do not add artifact-side semantic guessing.
- Phase 3 cache rules remain closed: `OTHER_STORE`, `UNAVAILABLE`, replay gaps, transport failures, and bootstrap failures must not become durable semantic truth.
- No retailer-specific fixes, key/path English heuristics, raw response-body semantic interpretation, request-wide store-id broadcast, stale replay shortcuts, or product-code watchdogs.
- Value matching governs fixes: exact selected-store-backed carrier/path values may be replaced from live context; unproven paths preserve captured literal value, type, and skeleton.
- `xptc` and similar session/original-store evidence must be inspected, but not rewritten or dropped without exact persisted carrier policy evidence.
- Repeat-canary output is diagnostic. Do not let a deterministic repeat mismatch alone decide retailer drift or block a same-run parity conclusion without inspecting the actual pre-send curls.
- LLM-assisted raw curl comparison is authoritative for stabilization triage: compare same-run Stage9 and artifact pre-send method, URL/path/query, headers/cookies with persisted carrier policy evidence, and request body exact paths. Do not use shell `structure_match` / `structure_mismatch` output as a workflow gate, do not run extra shell comparison just to decide proof, and do not spawn a source fixer from shell mismatch alone. If summary output already contains shell comparator fields, treat them as optional telemetry for locating evidence only.
- Correct comparator selection comes before the LLM read. Match same-run Stage9 candidates by slot (`A` or `C`), target step, method, endpoint path, and boundary (`store-loader` vs `executor`). Prefer the latest settled Stage9 pre-send/final curl after bootstrap, required-request header override, cookie lock-step, and context-alignment logs. Reject bootstrap, startup, required-request capture, challenge, pre-chain, or earlier mutation curls when a later same-run success curl exists for that slot and endpoint.
- Executor proof is the stronger correctness gate. Store-loader differences are secondary unless they change selected-store extraction or feed an executor context error.
- For selected-store aliases, require same-run evidence and carrier-shape correctness rather than raw string equality. Kroger short selected context ids such as `00929` and long location/listing ids such as `01400929` may both be correct in their expected carriers; `DD_modStore`/session/bootstrap carriers remain under the known Kroger caveat unless same-run evidence proves exact context linkage.
- If a retailer slot lacks a same-run Stage9 final/pre-send curl, do not use that slot for parity comparison and do not treat it as drift. When Stage9 produced honest A/C evidence but not B, run and compare artifact slots A/C only.
- When artifact replay is blocked by captcha/IP/challenge/transport before semantic comparison, retry first. For Target, Kroger, Safeway, and similar residential transport/captcha/challenge blocks, do not automatically rerun the full Stage9 harness when fresh same-run Stage9 sources/evidence already exist and the failure is transport-only before comparison. Stay active when practical and rerun the artifact/transport path several times, commonly five or six attempts, before escalating. Then generated-copy residential transport edits are allowed for Target and any other retailer. Patch only transport shape (same integer residential session id for Chrome bootstrap and final Jurl send), compare against same-run Stage9 A/C evidence, and record the result as transport-only rather than a source/codegen fix unless separately proven.
- Session/bootstrap churn may be explained away only when it is not tied to exact persisted selected-store or context-linked carrier evidence. Store/context drift on an exact carrier/path must be treated as real until fixed or explicitly explained by persisted policy evidence.

## Verification Gates

A retailer cannot be `DONE` until all are true:

- fresh harness run is complete enough for that retailer,
- fresh emitted sources exist when expected,
- artifacts ran from those exact fresh sources,
- raw same-run Stage9-vs-artifact curl comparison exists for affected slots; shell comparator status is not a done criterion,
- repeat canary has been inspected as a diagnostic when present,
- regression coverage exists for the fixed seam,
- watchdog subagent passes the fix/claim,
- tracker is updated immediately.

The overall wave is not truly `DONE` until every non-skipped retailer has passed a fresh post-final-production-code residential A/C run with same-run artifact comparison and raw curl inspection. Keep the four-active-retailer cap for those final batches.

Use watchdog review before accepting fixes or `DONE` claims. The watchdog should `BLOCK` artifact-side guessing, request-wide rewriting, non-store boolean/enum/mode rewrites, durable `OTHER_STORE` caching, and claims based on stale or post-generation-only evidence.
