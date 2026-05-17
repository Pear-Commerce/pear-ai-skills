---
name: pear-pr-review-flow
description: Pear PR workflow for adding reviewers/Copilot, handling review comments, watching Codex-authored PRs with explicit auto-fix/auto-land preferences, and landing when approved. Always use when the user mentions a PR, pull request, review request, PR creation, PR update, PR feedback loop, or PR landing in api.pearcommerce.com, admin.pearcommerce.com, offers.pearcommerce.com, pear-dashboard, pear-dashboard-api, or any Pear repo with many commits, many collaborators, or multiple likely code owners/authors.
---

# Pear PR Review Flow

## Canonical Skill Source

The canonical Pear skills repository is `https://github.com/Pear-Commerce/pear-ai-skills`.

When asked to update this skill from any in-repository or locally installed copy, first read the canonical copy at `skills/pear-pr-review-flow/SKILL.md`, make the canonical repo change, and push it. Then update any vendored or installed copy that should stay in sync. For app repos other than `api.pearcommerce.com`, commit and push directly after verification. For `api.pearcommerce.com`, use a `codex/` branch and open a pull request instead of pushing directly to `master`.

## Overview

Use this skill whenever the user mentions a PR or asks to create, update, review, monitor, or land a PR. Before opening a Pear code PR, make sure `$pear-engineering-workflow` has run its cleanup/review-rules pass. Request the right PR reviewers without relying on broad teams, request GitHub Copilot in the way GitHub actually records, ask which autonomous review-loop actions the user wants, create the review-watch loop for Codex-authored PRs, and keep the PR review loop visible in Slack when the user wants that.

## Codex Authorship Signature

When Codex authored or materially edited a PR body, GitHub issue/PR comment, review-thread reply, Slack post, or commit message, end the written text with a blank line followed exactly by:

```text
Thanks,
Codex
```

Do not duplicate the signoff if it is already present. If the user explicitly supplies exact text to post unchanged, treat that as user-authored and do not add the signoff unless they ask.

## Review Reply Tone

When replying to PR comments, be appreciative, understanding, and humble. Assume the commenter is trying to improve the work, acknowledge the useful intent, and keep the response concise and grounded in evidence.

Do not accept every suggestion by default. If a comment conflicts with `$pear-engineering-workflow` guidance or with explicit design decisions from the author/user, stand firm graciously: cite the relevant guidance or decision, explain the technical tradeoff, and offer a narrow alternative when useful. Avoid dismissive language, but do not apologize for preserving the correct engineering direction.

## Concurrent Worktrees

When creating or updating a PR while the user's main checkout or another Codex thread may be active in the same repo, use a sibling git worktree instead of sharing the working directory:

```bash
git fetch origin master --prune
git worktree add -b codex/<short-task-name> ../<repo-name>-<short-task-name> origin/master
```

Commit, push, and open the PR from that worktree. Do not stash, reset, rebase, or clean the user's main checkout to prepare PR work. If the branch already exists, choose a unique `codex/` branch name or add the worktree for the existing branch in a distinct sibling directory.

## Pre-PR Cleanup Gate

Before creating a PR for Pear code changes, load `$pear-engineering-workflow` and complete its Review Rules cleanup pass. In practice:

- read the PR-improvement guide from the engineering workflow skill, preferably `/Users/alexwyler/pear-ai-skills/skills/pear-engineering-workflow/references/codex-pr-improvement-goal.md` or `https://raw.githubusercontent.com/Pear-Commerce/pear-ai-skills/main/skills/pear-engineering-workflow/references/codex-pr-improvement-goal.md`
- apply it as a final cleanup checklist before calling implementation done or opening the PR
- run the relevant focused checks after cleanup
- mention in the PR summary or final response that the Pear engineering cleanup pass was completed, or state plainly if the guide/checks could not be run

For an existing PR, repeat this gate before marking the PR ready for review or re-requesting reviewers when Codex has materially changed code.

## Reviewer Workflow

1. Identify the PR and repo.
   - Prefer `gh pr view --json number,url,author,headRefName,baseRefName`.
   - Resolve the repo with `gh repo view --json nameWithOwner --jq .nameWithOwner`.

2. Identify individual engineering reviewers.
   - Do not default to `Pear-Commerce/tech` or other broad teams when the user asks for engineers by name.
   - For a new non-draft Codex-authored PR in a Pear engineering repo, default to the current known Pear engineering reviewer set unless the user explicitly names a narrower reviewer set, asks to keep the PR quiet/draft, or says not to request reviewers.
   - When the user asks for "all engineers" or broadly wants engineering review, request the current known Pear engineering reviewer set: `SarahYiskah`, `ericmartell`, `ksader`, `peteyfb-pear`, `AthulyaRaj7`, `justin-pear`, and `isaacanderson33`, excluding the PR author and anyone who is not a collaborator on the current repo.
   - Start with current repo collaborators:
     ```bash
     gh api repos/OWNER/REPO/collaborators --paginate --jq '.[] | {login,type,permissions} | @json'
     ```
   - Use commit history as context clues:
     ```bash
     git log --since='18 months ago' --format='%an <%ae>' --all | sort | uniq -c | sort -nr | head -80
     ```
   - For Pear mono-repo context, also check nearby repos when useful, especially `api.pearcommerce.com`, `admin.pearcommerce.com`, `offers.pearcommerce.com`, `pear-dashboard`, and `pear-dashboard-api`.
   - If Slack is available, search user profiles for engineering titles to distinguish engineers from product/ops/design:
     `slack_search_users` queries such as `engineering`, `software`, `backend`, `frontend`.
   - Exclude the PR author, bots, deactivated users, non-collaborators, and people who clearly are not engineers. `arjun-karunakaran` is not an engineering reviewer; do not include him in "all engineers" requests unless the user explicitly names him. If unsure, prefer fewer reviewers and explain the inference.

3. Add reviewers by login using the helper script or the same REST API shape.
   - Preferred helper:
     ```bash
     /Users/alexwyler/.codex/skills/pear-pr-review-flow/scripts/request-reviewers.sh --pr PR_NUMBER --reviewers login1,login2 --copilot
     ```
   - Direct API equivalent:
     ```bash
     printf '%s' '{"reviewers":["login1","login2"]}' \
       | gh api -X POST repos/OWNER/REPO/pulls/PR_NUMBER/requested_reviewers --input -
     ```

4. Request Copilot separately and verify with the PR timeline.
   - Prefer GitHub CLI `v2.88.0` or newer. If `gh --version` is older, upgrade it before trying to request Copilot.
   - Use `@copilot`, not `copilot`, `github-copilot`, or `copilot-pull-request-reviewer`.
   - Preferred command:
     ```bash
     gh pr edit PR_NUMBER --add-reviewer @copilot
     ```
   - REST fallback:
     ```bash
     printf '%s' '{"reviewers":["@copilot"]}' \
       | gh api -X POST repos/OWNER/REPO/pulls/PR_NUMBER/requested_reviewers --input -
     ```
   - Verify with:
     ```bash
     gh api repos/OWNER/REPO/issues/PR_NUMBER/timeline --paginate \
       --jq '.[] | select(.event=="review_requested" and .requested_reviewer.login=="Copilot")'
     ```
   - Note: `gh pr view --json reviewRequests` and the REST requested-reviewers endpoint may omit the special Copilot reviewer even when the PR timeline shows `Copilot`.

5. Remove accidental broad team requests if needed.
   ```bash
   printf '%s' '{"reviewers":[],"team_reviewers":["tech"]}' \
     | gh api -X DELETE repos/OWNER/REPO/pulls/PR_NUMBER/requested_reviewers --input -
   ```

## Slack Review Ask

After reviewers and Copilot are requested, ask the user whether to post in `#engineering` unless they already asked you to post.

Suggested question:

> Want me to post in `#engineering` asking for reviews?

If the user says yes or already requested a Slack post, use the Slack tool to send a short message to `#engineering`:

```text
PR is ready for review: [repo #PR](PR_URL)

- <one-line summary>
- Reviewers and Copilot requested

Could I get reviews when you have a minute?

Thanks,
Codex
```

If the PR is urgent, a hotfix, or already landed, say that plainly and include the deploy or merge status if known.

## Screenshot Evidence

For user-facing admin, offers, dashboard, or extension changes, add screenshots or short videos to the PR when feasible. Cover each relevant state the reviewer needs to trust: loading, empty, success, error, disabled/no-extension, persisted/refreshed, and any manual override or warning state introduced by the PR. Prefer using the Chrome connector to drive the real local app/profile and capture screenshots manually from the browser flow. If Chrome is unavailable or live data is unstable, use a small local harness that renders the changed UI faithfully and say so in the PR. Host images somewhere reviewers can open, such as S3, and include concise captions in the PR body.

## Review Follow-Up Loop

When the user asks to handle PR feedback, inspect every GitHub feedback surface before editing, not just Copilot or currently unresolved threads. Use the GitHub comment-handler skill for thread-aware review data, then also inspect flat PR review comments, top-level issue/PR comments, requested-changes reviews, reviewdog/github-actions bot comments, check annotations when available, timeline review requests, and existing Codex replies. Treat actionable comments from any author as feedback, including bots. Treat explicit phrases like "fix issues", "fix blockers", "fix the unit tests", "fix the PR", or "fix the unit tests and update the PR" as approval to make targeted PR follow-up fixes, push the PR branch, and re-request review. Fix every actionable issue that has not already been addressed by a later Codex reply or code change, or reply with a clear reason when a requested change is not appropriate. After code changes, rebase the PR branch against the latest base branch, rerun the relevant focused checks, amend the existing branch commit instead of adding a noisy follow-up commit, force-push with lease, and reply to each addressed GitHub thread or comment with what changed and what was verified. End Codex-authored replies and commit messages with the Codex authorship signature above. When the follow-up pass is done, re-request GitHub Copilot review with the same Copilot workflow above and verify the timeline shows the new request. For recurring automations, only perform these fix-and-push actions automatically when the user has opted into auto-fixing comments.

## Branch Refresh On PR Updates

Whenever Codex materially updates an existing PR branch, rebase it against the latest base branch before the final push and review re-request. This gives required checks, including flaky or previously failed unit tests, another run on current code. At Pear, branch refresh means rebase: do not use `git merge origin/master`, `git merge origin/main`, or `gh pr update-branch` if that would create a merge commit on the PR branch.

When unit tests or required checks are failing on an existing PR, first check whether the branch is behind the latest base branch before debugging the PR's code. If the branch is out of date, or if a known master/base fix for shared test failures has recently landed, rebase the PR branch from the latest base branch and rerun the relevant checks before making code changes. Only continue debugging PR-specific code after the failures reproduce on the rebased branch.

For `api.pearcommerce.com` test failures involving Spring beans, method-parameter `@Autowired`, `awsAppConfigUtil`, `Persistence`, `Resources`, or other Pear app resources, verify the test extends `BasePearScript`. If it already does, debug deterministic test data/setup next; do not assume shared CI seed rows exist when the test can create the needed SimpleORM rows itself.

Preferred local flow for Codex-authored branches:

```bash
BASE="$(gh pr view PR_NUMBER --json baseRefName --jq .baseRefName)"
git fetch origin "$BASE" --prune
git rebase "origin/$BASE"
```

Then run focused checks, amend the existing commit if needed, and push with `git push --force-with-lease`. If the PR branch is stacked, rebase the parent branch first, force-push it with lease, then rebase each child branch onto the new parent tip and force-push with lease. If the PR branch is user-authored, shared, or unsafe to rewrite, stop and report that a rebase needs owner approval; do not create a merge commit as a workaround.

If no code change is needed but checks are stale, failed for likely transient reasons, or the branch is behind the base branch, rebase the PR branch to latest anyway so CI gets a clean fresh attempt. If conflicts appear during any rebase, resolve them deliberately, run the relevant checks, and continue the rebase; if safe resolution is unclear, abort the rebase and report the exact files and conflict.

## Watch And Land Loop

When working on a Codex-authored PR, create a recurring review loop instead of relying on a one-time pass. Also create it when the user asks Codex to keep watching, wait for acceptances, handle comments, or land when green. In the Codex app, use the automation tool when available and prefer a thread-attached heartbeat for short-interval checks. A typical active-feedback cadence is every 5 to 10 minutes.

After a watcher verifies that the latest Copilot review produced no new comments, there are no unanswered actionable comments from any source, and required checks are green or only intentionally skipped/non-actionable, relax the cadence during weekends and off-hours instead of continuing a tight polling loop. Hourly checks are usually enough while the PR is quiet. If new actionable feedback, requested changes, failing checks, or mergeability problems appear, handle or report them promptly and tighten the cadence again while fixes or check reruns are active.

Before creating or updating the recurring loop, ask which autonomous actions the user wants unless the current conversation already clearly grants them. Use a concise question such as:

```text
Do you want this PR watcher to auto-fix actionable review comments, auto-land once approved/green/up to date, both, or just report status?
```

Interpret explicit requests like "handle comments as they come in", "keep fixing feedback", "fix issues", "fix blockers", "fix the unit tests", "fix the PR", "fix the unit tests and update the PR", or "auto-fix review comments" as approval for auto-fix. Interpret explicit requests like "land when green", "merge once approved", "close it when ready", or "auto-land" as approval for auto-land. If the user has not answered yet, make the watcher report-only for that category and ask for approval in the next thread update instead of editing code or merging. Record the selected mode in the automation prompt so future heartbeat passes do not guess.

The recurring task should:

- watch only explicitly named PRs, or open PRs related to the current thread that were authored or materially written by Codex
- identify Codex-authored PRs by the PR body or Codex-authored comments ending with exactly `Thanks,\nCodex`
- inspect every GitHub feedback source on each pass: all review threads whether unresolved, resolved, or outdated; flat PR review comments; top-level issue/PR comments; requested-changes reviews; reviewdog/github-actions bot comments; Copilot feedback; check annotations when available; timeline review requests; approvals; mergeability; branch status; and required checks
- do not treat Copilot as the only reviewer. Actionable comments from any author, including `github-actions`, `reviewdog`, humans, and Codex self-review comments, must be evaluated and either addressed or explicitly answered
- when auto-fix is approved, make the smallest clean code change for every actionable comment that has not already been handled by a later Codex reply or code change, rebase the PR branch against the latest base branch, run focused checks, amend the existing branch commit, and force-push with lease
- when auto-fix is not approved, report actionable comments back to the thread and ask before changing code, pushing, or posting GitHub replies that imply a fix was made
- reply to each addressed thread/comment with what changed and what was verified; do not resolve or close feedback conversations immediately after pushing a fix. Keep the back-and-forth visible for reviewer context, then resolve/close finished conversations after they have been quiet for at least 6 hours, when the user explicitly asks, or during landing/merging. Still address new feedback promptly.
- reply with a concise technical reason when no code change is appropriate
- end all Codex-authored GitHub replies and commit messages with the Codex authorship signature above
- re-request GitHub Copilot review after each completed fix pass and verify the timeline shows the new request
- avoid unrelated PRs and user-authored PRs that lack the Codex authorship signal
- if a non-draft PR has been open and not landable for more than 24 hours, and human review or re-review is still useful, send a concise Slack nudge to `#engineering` with the PR link, current blocker, and requested review/re-review; do this at most once per PR every 48 hours, checking recent Slack/thread history for the PR URL before posting. Keep the same 24-hour eligibility and 48-hour repeat limit, but never send these review nudge Slack messages on Saturdays or Sundays in the user's locale. If the nudge first becomes eligible on a weekend, defer it until the next Monday; for example, a PR made ready on Saturday should not nudge on Sunday, and should nudge Monday if reviews are still missing.
- when auto-land is approved, land/merge the PR once it is open, not draft, rebased against the latest base branch, required checks are green, review decision is accepted or there are no required reviewers, no blocking review threads or actionable comments remain, and the branch is mergeable under the repo's normal merge method. This is what closes the PR; do not close an unmerged PR unless the user explicitly asks to abandon it.
- when auto-land is not approved, report that the PR is ready to merge and ask for approval instead of merging
- do not land when the user explicitly says to keep the PR open, keep watching only, avoid merging, pause, or wait for a named reviewer beyond normal branch protection
- after a successful merge, verify the PR is closed/merged, delete or stop the recurring watch automation for that PR when possible, and report the merge status back to the thread
- if landing is blocked by branch protection, missing permissions, merge queue, conflicts, stale checks, or unavailable merge methods, report the blocker and keep watching instead of guessing
- summarize each pass back in the thread, including checks run, comments handled, branch-refresh status, landing/merge status, and blockers

## Landing Green PRs

Only close eligible Codex-authored PRs by merging them when the user has asked to land, merge, close when ready, or opted into auto-land for the watcher. Without that approval, stop after proving readiness and ask the user whether to merge. "Ready" means:

- the PR is open, not draft, and still points to the expected branch
- the branch has been rebased onto the latest base branch without merge commits
- all required checks are complete and successful, ignoring only intentionally skipped non-required jobs
- reviewer requirements are satisfied, requested-changes reviews are cleared, and Copilot has reviewed or been explicitly unavailable
- review threads, flat review comments, top-level comments, bot comments, and check annotations have no unresolved actionable feedback
- `gh pr view` or the GitHub API reports the PR as mergeable/clean, or the repo's merge queue accepts it

Use the repo's normal merge path. Prefer a standard `gh pr merge PR_NUMBER` flow that respects branch protection and merge queues; if GitHub requires a merge queue or auto-merge, enable that instead of trying to bypass it. If the branch should be deleted by repo convention, use the repo's normal branch-deletion behavior after merge.

## New PR Completion Gate

Before sending the final response after creating or materially updating a Codex-authored PR, explicitly verify and, if missing, fix these items:

- the PR exists, is on the intended branch, and the final response includes the PR URL
- the Pear engineering cleanup pass was run or the reason it was skipped is stated
- the intended engineering reviewers are requested; for new non-draft Codex PRs in Pear engineering repos, this means the known Pear engineering reviewer set unless the user asked for a narrower set
- Copilot was requested and verified through the PR timeline, not only `gh pr view`
- after any material PR update, the PR branch was rebased against the latest base branch, or the final response states why it was unsafe or unnecessary
- a recurring review-watch automation was created or updated for the PR; include the automation id/name, or state why no automation was created
- the user's auto-fix and auto-land preferences were captured for the recurring watcher; if not, the watcher is report-only for those actions and the final response asks for approval
- if the PR is now ready under the landing rules, it was merged/closed, user approval to merge is needed, or the exact landing blocker is stated
- the final response says whether Slack was posted, skipped by user instruction, or still needs user approval

If any item is missing, do not paper over it in the final answer. Complete it first, or clearly call out the blocker and the exact next command/tool action needed.

## Common Pear Reviewer Clues

Use current repo evidence first. These names have recently appeared as engineering reviewers/authors in Pear admin/API work, but do not add them blindly if they are not collaborators on the current repo:

- `ericmartell`
- `SarahYiskah`
- `ksader`
- `peteyfb-pear`
- `AthulyaRaj7`
- `justin-pear`
- `isaacanderson33`

## Final Response

Summarize exactly who was requested, whether Copilot was verified through the PR timeline, whether a Slack message was posted or still needs user approval, whether any requested watch/land loop was created or completed, and whether the PR was merged/closed or why landing is still blocked.
