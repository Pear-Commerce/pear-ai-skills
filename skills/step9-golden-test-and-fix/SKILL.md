---
name: step9-golden-test-and-fix
description: Run and stabilize Step9 golden residential retailer tests. Use when Codex is asked to run the golden harness, residential Stage9, artifact curl parity, A/C artifact comparisons, retailer queues, Step9 failure triage, or a fixer-plus-watchdog subagent workflow for Step9 golden failures and artifact mismatches.
---

# Step9 Golden Test And Fix

## Which Repo?

There are TWO Step9 repos:

1. **`/Users/eric/api.pearcommerce.com`** — original repo, used for Phase 4 stabilization runs
2. **`/Users/eric/api.pearcommerce.com-step9-rearch/`** — rearch branch (`codex/step9-browser-agent-rearch`), used for genericness refactor + gold test work

**For genericness refactor / gold test work**: use the rearch worktree.
**For Phase 4 stabilization / tracker runs**: use the original repo.

Also load the `step9-infra-ops` skill for infrastructure operations (dev DB, MCP, fp proxy, session capture, health checkers).

## Rearch Genericness Refactor (Aug 7, 2026)

The rearch worktree has a completed genericness refactor:

- **All deterministic heuristics disabled** in `FlowRuntimeLlmKeyClassifier`, `FlowRuntimeContextCarrierProfiles`, `FlowRuntimeChainEliminator`, `DependencyDiscovery`, `Phase9SolverHookGenerator`, `StoreAddressStoreIdResolver`
- **KeyRole-based semantic roles** replace all hardcoded English field names. Store class uses `Map<KeyRole, List<SemanticFieldBinding>>` instead of `addressLine1`/`locationName`/`state` etc.
- **`run(Map<String, String>)` API** replaces old `run(String zip, String latitude, String longitude)` overloads
- **LLM-first store resolver** — `StoreAddressStoreIdResolver` redesigned to send chunked candidates to LLM instead of using deterministic address/ID shape heuristics
- **3 under-rewrite carrier fixes**: scalar cookie admission (CONTEXT_LINKED only), case-insensitive cookie lookup, BODY invariant synthesis
- **639 tests pass** across 6 test classes (BehaviorTest, ContractsTest, ResolverTest, ArtifactTranspilePlanRuntimePolicyTest, Phase9SolverHookGeneratorLockStepParityTest, ArtifactParityReplayTest)
- **Oracle signed off** on all genericness fixes and carrier fixes

### Non-negotiable coding standards (from deepwork file lines 1-45)
- NO hardcoded English field names, cookie names, header names, URL patterns, or address formats in the generator framework
- All semantics must come from `FlowRuntimeLlmKeyClassifier.KeyRole` enum
- Generated flow files (Phase9Flow.java etc.) CAN have retailer-specific values — they're codegen output
- Framework infrastructure files under `flow/` must be generic
- Oracle must review and sign off on every commit

## First Moves

Work from `/Users/eric/api.pearcommerce.com-step9-rearch/` (rearch) or `/Users/eric/api.pearcommerce.com` (original).

Before changing anything under `src/com/pear/codegen`, read:

```bash
sed -n '1,220p' src/com/pear/codegen/Step9SolverHarness.md
sed -n '1,220p' src/com/pear/codegen/Step9PipelineContracts.md
```

Also read the `step9-phase4-stabilization` skill when supervising long Step9 runs or updating the tracker.
Also read the `step9-infra-ops` skill for infrastructure operations (dev DB, MCP, fp proxy, session capture).

If prior runs/heartbeats exist, inspect them first. Do not accidentally resume a paused run.

## Golden Run Contract

Run all retailers in `retailer-contexts/*` except `hollywoodfeed`.

Default artifact slots are `A,C`. Do not run or compare `B` unless the user explicitly asks or fresh same-run Stage9 B evidence is known to exist.

Keep at most four retailers actively running at a time. Launch one-retailer gold-standard runs, not a mixed all-retailer run.

Use residential Stage9 from start to finish:

```bash
force='cvs,dollargeneral,dollartree,kroger,petsmart,safeway,target,walgreens,walmart'
STEP9_GOLD_STANDARD_FORCE_RESIDENTIAL_RETAILERS="$force" \
  ./devops/step9_phase4_launch.sh --retailer <retailer> --artifact-slots A,C \
  --screen-session "step9-<retailer>-residential"
```

Track the actual timestamp from the run log or `worker-harness`, not only the launcher prediction. The launcher timestamp and script timestamp can differ by a second.

Use `devops/step9_phase4_supervise.sh --retailer <retailer> --ts <actual-ts>` for status. Treat `RUNNING_REAL` as alive. Do not kill real runs unless the user asks to pause/stop.

For long runs, create or update a heartbeat automation attached to the thread. Use a 10-minute cadence by default so completed runs and freed queue slots are acted on promptly; 15 minutes is acceptable for quiet transport-wait stretches, but 30 minutes is too slow for active final-wave/fix loops. The heartbeat prompt must include exact retailer timestamps, active queue, A/C-only rule, next supervision command, email status rule, remote Gmail direction rule, and any active fixer/watchdog subagent rule. Pause/delete the heartbeat when the user says pause or stop.

Do not close out a live turn just because a fixer or watchdog subagent is still running. Once a fixer/watchdog has been spawned in the current thread, stay active, wait for it, and advance the next gate (local review, watchdog, commit, relaunch, or tracker update) unless the user explicitly asks to pause/hand off to heartbeat. Heartbeats are for long runner supervision and resilience, not a substitute for waiting on active subagents that are on the critical path.

## Email Status Updates

When the user is away or asks for email updates, send concise Step9 status mail with:

```bash
devops/send_step9_status_email.sh \
  --to eric@pearcommerce.com \
  --from customer.success@pearcommerce.com \
  --subject "[Step9] <short status>" \
  --body-file /tmp/step9-status-email.txt
```

Discovery already performed: this workspace has AWS CLI v2, default region `us-east-1`, IAM caller `arn:aws:iam::042357577846:user/eric`, and repo precedent in `EmailUtil` sending SES mail from `customer.success@pearcommerce.com` in `us-east-1`.

Use a `7/10` goblin tone for these emails: lively, a little toothy, but still operationally clear. Include current active runs, blockers, latest source/tracker commits, next action, and whether the final-wave reset rule was triggered. Send mail after important state changes: source commits, watchdog PASS/BLOCK, fresh runner launches, run failures, final-wave batch completions, and before any handoff/closeout while the user is away. If email sending fails, record the failure in the tracker or thread handoff and keep the normal heartbeat active.

Keep Step9 status emails in one Gmail thread by default. The helper sends threaded raw SES mail unless called with `--no-thread`; prefer the stable subject `[Step9] residential final-wave status` and put the specific event title in the body rather than changing the subject.

## Remote Gmail Directions

When the user is away and replying to Step9 status emails, check for Gmail replies before making the next substantive workflow decision:

```bash
devops/pull_step9_remote_prompts.sh
```

The helper uses the same Gmail OAuth material as `GmailUtil`/`GmailLabelJob`: Eric's `GmailUser` refresh token from the dev/test DB credentials path (`devops/db.sh -e test --dev`) plus `WebContent/WEB-INF/classes/client_secret.json`. It searches Eric's all-mail/sent mail for replies from `eric@pearcommerce.com` to `customer.success@pearcommerce.com` on Step9 subjects, strips quoted history, de-duplicates by Gmail message id, and writes new remote instructions to `/tmp/step9-remote-prompts.md`.

Treat new entries in `/tmp/step9-remote-prompts.md` as user direction at a distance, subject to the same safety and Step9 contracts as direct thread messages. If a remote instruction changes the workflow, record that source in the tracker and status email. If the helper fails, record the failure and continue the normal heartbeat rather than silently skipping remote direction. Use `--peek` only for testing/discovery because it does not update seen-message state.

## Batch Fixes Before Relaunch

Prefer applying all pending watchdog-passed source fixes before launching new residential verification runners. When multiple retailers are waiting on already-reviewed patches, integrate those patches first, resolve conflicts locally, run one focused/adjacent regression batch that covers all touched seams, commit with cross-retailer compatibility notes, then relaunch the affected retailers in parallel up to the four-active-run limit.

If one affected retailer still has an unresolved real source/codegen failure, do not launch that retailer again just to reproduce the known failure. Keep investigating it with the fixer-plus-watchdog workflow, and launch the batch only after the source side is complete enough to produce meaningful fresh evidence. Transport/IP/challenge retries are the exception: those may be retried without source changes when the evidence is transport-only.

When a fresh batch is source-complete, parallel residential A/C verification is preferred over serial launches, as long as it respects the four-retailer cap and avoids known timestamp/path collision traps. Do not fire multiple launcher commands in the same second: the launcher timestamp can become a shared master/artifact-summary namespace. Stagger launches by at least 2 seconds, or otherwise force unique actual timestamps, then record every actual timestamp separately. If a same-second collision slips through, stop that just-launched batch before using summaries/artifacts and treat the collided timestamp as discarded transport/launch evidence only.

For final wave closure, the batch scope is all non-skipped retailers, not just retailers touched by the last patch. Previously green runs are regression anchors only if they happened before the last production code change. After the last production code commit, rerun every non-`hollywoodfeed` retailer through fresh residential A/C verification in four-at-a-time batches, then inspect raw same-run curls before claiming the whole wave is truly `DONE`.

Order final-wave batches by risk. Run retailers directly touched by the latest production code change first, then retailers touched by recent earlier Step9 source fixes, then unchanged regression anchors. If a touched retailer hits a real semantic/source/codegen comparison failure, pause advancement of the remaining final-wave queue until fixer + watchdog + commit resets the post-code-change wave. Already-running lower-risk retailers may continue to finish, but their green results become regression anchors if a later production source fix lands.

## Artifact Comparison

Compare artifact executor pre-send curls with same-run Stage9 final curls for semantic coherence. Bootstrapped cookies, random tokens, timestamps, residential session churn, browser profile noise, and challenge/proxy headers may differ. Context and upstream dependencies must be applied the same way.

Do not use the shell `structure_match` / `structure_mismatch` comparator as a workflow gate. Do not run an extra shell comparison just to decide proof, and do not spawn a source fixer from a shell mismatch alone. If the gold-standard summary already contains shell comparator output, treat it as optional telemetry for locating evidence only; the proof decision comes from raw same-run curl comparison.

- `freshArtifactsFromExactSources=true`
- `evidenceMixedOrStale=false`

Before classifying a curl mismatch as real drift, and before marking any retailer `DONE`, perform an LLM-assisted raw curl comparison for every compared A/C slot. Use the summary rows only to locate the evidence and candidate diffs, then inspect both boundaries:

- Stage9 store-loader curl vs artifact store-loader pre-send curl,
- Stage9 executor curl vs artifact executor pre-send curl.

Choose the correct same-run Stage9 comparator curl before judging drift:

- Match candidates on proof slot (`A` or `C`), target step, HTTP method, endpoint path, and boundary (`store-loader` vs `executor`).
- Prefer the latest successful Stage9 pre-send/final curl for that same slot and endpoint after bootstrap, required-request header override, cookie lock-step, and context-alignment logs have settled.
- Reject bootstrap, startup, required-request capture, challenge, pre-chain, or earlier mutation curls as authoritative when a later same-run store-loader/executor success curl exists for that slot and endpoint.
- For executor proof, compare the curl that actually performs the selected product/detail/search action. Store-loader mismatches are secondary unless they change selected-store extraction or feed an executor context error.
- Treat same-run selected-store aliases as equivalent only when their shapes are expected for those carriers. For example, Kroger short selected context ids such as `00929` and long location/listing ids such as `01400929` can both be correct when each appears in its expected carrier shape.

The LLM/manual read does not require exact equality. It must decide whether the requests apply the same upstream context/dependencies: selected store ids and aliases in the right shape for each carrier, persisted context-linked headers/cookies/body/query fields, request bodies, product/query inputs, and explicit carrier policy. Differences may be ignored only when they are clearly runtime/transport/randomization/session noise or backed by persisted `SESSION_ONLY`/volatile policy. Record in the tracker that raw A/C store/executor curls received an LLM-assisted semantic comparison before calling `DONE`.

For mismatches, transport-only generated-copy runs, Kroger/Safeway caveats, request bodies, or any suspicious summary field, inspect the raw curl/body more deeply and identify the exact carrier/body/query/header/path difference before classifying the run. If an automated summary reports failure but the raw same-run curls are semantically aligned, call it a comparator false positive. If an automated summary reports success but the LLM/manual curl read finds semantic drift, treat the raw read as authoritative.

If a same-run Stage9 curl is missing for a slot, do not compare that slot and do not call it drift. For the known current pattern, compare A/C.

For Target, Kroger, Safeway, and any other retailer whose artifact replay is blocked by captcha/IP/challenge/transport before semantic comparison, it is allowed to create generated-copy residential artifact transport patches after retrying the block. Verify those generated copies contain the residential runtime transport shape when needed: integer runtime session id, Chrome bootstrap proxy map using the same session id, and final `j.go()` / `goBody()` routed through `JurlProxyFallback(Type.RESIDENTIAL).setProxySessionId(...)`. Treat generated-copy residential edits as transport-only evidence unless a source/codegen fix is separately proven.

If artifact replay is blocked by IP/challenge/transport, retry the artifact before treating it as a code failure. For Target, Kroger, Safeway, and similar residential transport/captcha/challenge blocks, do not automatically rerun the full Stage9 harness when fresh same-run Stage9 sources/evidence already exist and the failure is pre-comparison transport-only. Stay active in the session when practical and rerun the artifact/transport path several times, commonly five or six attempts, before escalating. If the block repeats and fresh same-run Stage9 evidence exists, prefer the generated-copy residential transport patch path over spawning a source fixer, and record the result as transport-only. For Kroger especially, transient bootstrap/challenge failures before comparison are transport noise, not semantic drift; same-run Stage9-vs-artifact A/C evidence is the authority.

Known Kroger caveat: Kroger can maintain `DD_modStore` and possibly similar carriers as the original session/bootstrap store even after switching stores. Do not treat those carriers as semantic drift unless same-run Stage9 evidence proves the exact carrier is context-linked and should change with selected store. For Kroger artifact mismatches, inspect whether the compared carrier is original-bootstrap/session-only versus selected-store/context-linked before patching. For Kroger `x-laf-object`/listing-style executor carriers, if an earlier Stage9 curl appears stale but a later same-run Stage9 executor curl and the artifact both use selected-store-consistent values and return 200, do not patch source from that earlier stale curl alone.

## Failure Workflow

When a retailer fails in Stage9 or artifact comparison:

1. Classify the boundary: harness pre-emission, artifact compile/invoke, artifact curl mismatch, missing same-run curl, transport/IP/challenge, or classfile/Gradle conflict.
2. If it is transport/IP/challenge in artifact replay, retry artifact replay before patching. If the block repeats, generated-copy residential transport edits are allowed for Target and any other retailer, with the same transport-only evidence caveat as Kroger/Safeway.
3. If the only failure signal is shell comparator output, stop and perform raw same-run curl candidate selection plus LLM/manual comparison before patching.
4. Before patching, inspect relevant git history for previous Step9 fixes in the same seam or nearby retailer paths. Identify which prior retailer fixes could be regressed.
5. If it is a real source/codegen failure or real artifact curl mismatch, start a fixer subagent only when the user has authorized subagents/delegation for this turn or workflow.
6. After the fixer returns, review the diff locally enough to understand it and confirm it does not unwind previous retailer fixes.
7. Start a separate watchdog subagent, also only when subagents are authorized.
8. Commit only after watchdog `PASS`, regression coverage, fresh verification plan/evidence, tracker update, and a commit message/body that explains why the fix should not regress known prior retailer fixes.
9. Add the retailer back to the run queue after the fix is committed.

If a fixer or watchdog subagent is active, do not end the turn and rely on the heartbeat interval for that subagent result. Wait for the active subagent and continue the workflow from its result unless the user explicitly tells you to pause.

For PetSmart source modifications, prove the failure before patching whenever feasible. Use a red unit/replay/debuggable reproduction that demonstrates the exact failing boundary first, then make the narrow fix and show the test/debug evidence going green. PetSmart Stage9 breakpoints are allowed when they help explain a live failure boundary, but they are optional because PetSmart runs are long.

Subagents must use `reasoning_effort: xhigh`. Do not override the model unless the user explicitly asks.

Give every fixer and watchdog subagent a memorable goblin codename in the prompt and use that codename in updates, tracker notes, and handoffs. The platform may still auto-display its own nickname; treat the goblin codename as the workflow name.

Use a `worker` agent for the fixer when code changes are expected. Tell it that it is not alone in the codebase, must not revert others' work, and must list changed files. Give it a bounded write scope when possible.

Use a separate `default` or reviewer-style agent for the watchdog. The watchdog must not edit code.

If the current user has not explicitly authorized subagents in the active turn/workflow, ask before spawning, or perform only local triage.

## Fix Rules

Only deterministic value matching is acceptable.

Exact upstream or accepted-request values may wire exact downstream carriers only when that relationship is explicitly observed and proven in accepted/runtime evidence.

Preserve Step9 decision-first behavior:

- dynamic winners stay dynamic,
- literal preservation happens only for exact carriers already proven constant,
- accepted execution-request literals may be used only for exact accepted carriers,
- accepted capture must be valid and `acceptedStep.ok=true` before any accepted-capture-derived replay or literal-preserve decision.

Block all of these:

- semantic guessing,
- key-name or path-name heuristics,
- request-wide store-id propagation,
- sibling/family/root promotion,
- fresh artifact-side classifier logic,
- stale failed-capture replay,
- blind `DROP` synthesis,
- enum/mode/boolean rewrites without exact persisted evidence,
- claims based on stale runs, mismatched source hashes, or pre-comparison failures.

Legacy deterministic store-loader step selection may continue without LLM help if it is already value/signature based. Use LLM only when the existing contract needs it and the result is persisted/verified without turning into semantic guessing.

PetSmart store-loader caveat: the store search/availability endpoint may return a directory/list containing all stores. If the selected store appears in that concrete store list, repeated LLM `OTHER_STORE` adjudication can be a false negative. The preferred repair is to fix LLM adjudication/input/cache behavior, not to bypass the LLM. First verify that `selectedStoreContext` is valid and non-empty, that failed `OTHER_STORE`/`UNAVAILABLE` verdicts are not cached or replayed, and that the prompt distinguishes an all-store/directory list from a nearest-store or recommendation list. Tighten the prompt or use a stronger model for this adjudication lane if evidence shows the model is genuinely misjudging the case. Any deterministic pre-LLM shortcut requires separate watchdog approval and exact list-scoped concrete store evidence; never accept from unrelated response-wide token hits, product ids, sibling/root promotion, or retailer-specific path names.

Avoid editing source while active Stage9 runs are compiling/executing if it may cause Gradle classfile conflicts. If conflicts still happen, treat affected active runs as transient failures and re-add those retailers to the queue after the fix.

## Fixer Prompt Template

Use this shape for the fixer subagent. Keep it concrete and pass raw evidence paths.

```text
Goblin codename: <short goblin name>. Use this codename in your final response.

You are fixing a Step9 golden residential failure for <retailer>.

Use /Users/eric/api.pearcommerce.com-step9-rearch/ (rearch worktree). Read Step9SolverHarness.md and Step9PipelineContracts.md before codegen changes. Also read the `step9-infra-ops` skill for infrastructure details.

CRITICAL GENERICNESS RULES (non-negotiable):
- NO hardcoded English field names, cookie names, header names, URL patterns, or address formats in the generator framework
- All semantics must come from KeyRole enum (ZIP_POSTAL, ADDRESS, LATITUDE, LONGITUDE, STATE_REGION, STORE_CONTEXT, STORE_ALIAS, NAME, etc.)
- Generated flow files (Phase9Flow.java etc.) CAN have retailer-specific values — they're codegen output
- Framework infrastructure files under flow/ must be generic
- All deterministic heuristics are DISABLED — the LLM is the only source of semantic decisions

Failure evidence:
- harness/artifact timestamp: <ts>
- logs/summaries: <paths>
- observed boundary: <harness pre-emission | artifact curl mismatch | artifact transport | etc>
- exact failure excerpt: <paste concise excerpt>

Implement the narrow source/codegen fix if and only if it satisfies deterministic value matching and Step9 decision-first rules. Do not add semantic guessing, key/path heuristics, request-wide propagation, sibling/family/root promotion, artifact-side classifier logic, stale replay, blind DROP synthesis, or enum/mode/boolean rewrites without exact persisted evidence.

Before editing, inspect git history for prior Step9 fixes touching the same seam or nearby retailer behavior, and explicitly note which prior fixes/retailers your patch must preserve.

Add focused regression coverage for the repaired seam plus enough adjacent coverage to show the patch does not regress known prior retailer fixes. Do not commit. List changed files, verification commands/results, and the prior-fix compatibility evidence.

If this fix is part of a multi-retailer pending-fix batch, say which other pending fixes should be integrated before the next residential launch and which tests should run together before the post-final-code verification batch.
```

Spawn with `reasoning_effort: xhigh`.

## Watchdog Prompt Template

Use this after the fixer finishes and local review finds the patch plausible.

```text
Goblin codename: <short goblin name>. Use this codename in your final response.

Review the Step9 fix for <retailer>. Return PASS, FLAG, or BLOCK.

Watchdog contract:
- only deterministic value matching is acceptable,
- exact upstream or accepted-request values may wire exact downstream carriers only when explicitly observed and proven in accepted/runtime evidence,
- dynamic winners stay dynamic,
- literal preservation only for exact proven-constant carriers,
- accepted execution-request literals only for exact accepted carriers and only when acceptedStep.ok=true,
- residential generated-copy edits are transport-only evidence unless separately proven,
- no claims from stale runs, mismatched source hashes, or pre-comparison failures,
- fixes must account for relevant prior Step9 retailer fixes from git history and include enough regression evidence to make cross-retailer regressions unlikely.
- if this patch is part of the final wave, it must not claim overall DONE until every non-skipped retailer has passed fresh residential A/C verification, in four-at-a-time batches, after the last production code change and raw same-run curls are inspected.

If FLAG or BLOCK, cite the exact violated rule, specific file/line or artifact evidence, and what must change.

Explicitly call out any sign of semantic enum/query/store inference, request-wide store-id propagation, artifact-side runtime guessing, failed accepted-capture usage, broad sibling/family/root rewrite, blind DROP, or enum/mode/boolean rewrite.

Also call out whether the patch could interfere with previous fixes for other retailers, and whether the proposed tests/commit notes give enough confidence that it will not.

Also call out whether any pending watchdog-passed fixes should be integrated before relaunching, and whether the proposed launch plan waits until after the last production code change. For final closure, verify the launch plan covers all non-skipped retailers, not only the retailer being patched.

Do not edit files.
```

Spawn with `reasoning_effort: xhigh`.

## Done Criteria

A retailer can be marked `DONE` only when all are true:

- fresh harness run completed,
- fresh emitted sources exist,
- artifact runs used exact fresh sources or clearly recorded transport-only patched copies,
- same-run comparison curls exist for affected A/C slots,
- raw same-run A/C store-loader and executor curl evidence received LLM-assisted semantic comparison; shell comparator status is not a done criterion,
- mismatch is resolved or exactly explained,
- regression coverage exists for the repaired seam,
- regression evidence covers relevant prior retailer fixes or explains why they are out of scope,
- tracker is updated,
- watchdog returns `PASS`,
- source fix is committed with the retailer name in the commit message and enough body detail to explain the seam, prior-fix compatibility, and why the change should not regress other retailers.

For the overall wave to be truly `DONE`, run fresh residential verification batches after the last production code change is committed. Use A/C slots, keep the four-active-retailer cap, and require harness/artifact success plus raw same-run curl inspection for every non-skipped retailer in that post-final-code state. Earlier green runs remain regression evidence, but they do not close the wave if later production code changes could have affected them.

Suggested commit message shape:

```text
Fix Step9 <retailer> golden <short-seam>

<why this deterministic fix is safe>
<which prior retailer fixes/seams were checked>
<focused tests and fresh evidence>
```

After a commit, re-add the retailer to the run queue and run fresh residential A/C verification.

## Pause

When the user says pause/stop:

1. Pause the heartbeat automation.
2. Stop active screens for the affected retailers.
3. Kill only the exact active timestamps' process trees.
4. Confirm no matching `step9_gold_standard`, `worker-harness`, `Step9SolverHarness`, or `RunStoreThenExecutorSourcesMain` processes remain.
5. Report concise paused state and last known evidence.
