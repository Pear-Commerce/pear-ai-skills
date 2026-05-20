---
name: canonical-skills
description: Bootstrap Pear's canonical skill system. Use whenever the user mentions skills, asks to use a skill, directly invokes a skill-like name such as "use check-partner-upc ...", install/import/update/create/modify a skill, references a repo-local or installed skill, or asks what skills are available. Finds skills in the canonical Pear-Commerce/pear-ai-skills repo, syncs the canonical skill library on demand, re-checks whether a newly synced skill applies, and makes all skill edits in the canonical repo first.
---

# Canonical Skills

This is the one Pear skill people should install manually in any AI assistant that supports local skills. It teaches the assistant where Pear skills live, syncs Pear's shared skill library on demand, and keeps future skill edits rooted in the canonical repo.

## Canonical Source

The canonical Pear skills repository is:

```text
https://github.com/Pear-Commerce/pear-ai-skills
```

Local checkout should usually be:

```text
$HOME/pear-ai-skills
```

## No Prior Setup Assumed

Do not assume the user has Pear engineering skills, repo checkouts, Homebrew, Git, or GitHub CLI installed. This skill is the bootstrap path.

Before cloning, pulling, editing, or pushing skills, make the local environment usable:

```bash
curl -fsSL https://raw.githubusercontent.com/Pear-Commerce/pear-ai-skills/main/scripts/install-all-skills.sh \
  | bash -s -- --bootstrap-tools --no-color
```

What this installer should handle:

- Install Homebrew on macOS when it is missing and local tools need it.
- Install Git and GitHub CLI when possible.
- Fall back to a GitHub archive snapshot if Git still is not available, so skill import can continue.
- Replace an old archive snapshot with a normal Git checkout after Git becomes available.
- Import all canonical Pear skills into Codex-compatible and Claude Desktop skill folders.

If a tool install asks for a password, browser login, or device-code confirmation, explain the prompt plainly and wait for the user to finish it. If installing tools is blocked by device policy, continue with archive-based skill import when possible and report exactly which later actions, such as pushing to GitHub, still require setup.

## When Any Skill Is Mentioned

When the user mentions skills in any context, pull the canonical GitHub repo before inspecting installed skill mirrors or deciding no skill applies.
Treat these as skill mentions even if the word "skill" is absent:

- Direct invocations such as `use check-partner-upc`, `run pear-pr-review-flow`, or `check-partner-upc 012345678905`.
- Hyphenated, slash-prefixed, or dollar-prefixed names that look like installed or canonical skill names.
- Requests to use, run, apply, install, import, update, create, modify, list, or inspect any named assistant workflow.
- References to repo-local or installed skill paths.

When a user asks to hide skills from the skills directory, interpret "hide" as marking those skills auxiliary with `config.yaml`:

```yaml
directory:
  placement: "auxiliary"
  reason: "<why this skill belongs outside the primary directory>"
```

Do not delete, rename, or skip installing the skill unless the user explicitly asks for removal.

Do not trust the current startup skill list, `$HOME/.codex/skills`, or other installed mirrors until the canonical repo has been refreshed from GitHub. If a named skill is not in the current startup skill list, do not stop after local discovery. Sync and list the canonical repo first, then re-check the request against the freshly synced skills.

Workflow:

1. Make sure basic tools and the canonical repo exist locally, then pull GitHub before any local skill discovery.
   ```bash
   PEAR_AI_SKILLS_REPO="${PEAR_AI_SKILLS_REPO:-$HOME/pear-ai-skills}"
   if [ -d "$PEAR_AI_SKILLS_REPO/.git" ]; then
     git -C "$PEAR_AI_SKILLS_REPO" pull --ff-only
   else
     curl -fsSL https://raw.githubusercontent.com/Pear-Commerce/pear-ai-skills/main/scripts/install-all-skills.sh \
       | bash -s -- --bootstrap-tools --no-color
   fi
   ```
2. Do not create or repair a scheduled daily canonical-skills sync automation. Pear skills are synced on demand when skills are mentioned or when a user explicitly asks to sync/install/update them.
3. Sync the canonical skill library into every available local skill target preemptively:
   ```bash
   PEAR_AI_SKILLS_REPO="${PEAR_AI_SKILLS_REPO:-$HOME/pear-ai-skills}"
   "$PEAR_AI_SKILLS_REPO/scripts/install-all-skills.sh" --bootstrap-tools --no-color
   ```
4. List available canonical skills:
   ```bash
   PEAR_AI_SKILLS_REPO="${PEAR_AI_SKILLS_REPO:-$HOME/pear-ai-skills}"
   find "$PEAR_AI_SKILLS_REPO/skills" -maxdepth 2 -name SKILL.md -print | sort
   ```
5. Choose likely relevant skills by reading their YAML frontmatter only unless more detail is needed.
6. Re-check whether any imported skill is appropriate for the user's request.
   - In the same turn, read the imported or canonical `SKILL.md` directly and follow it as if it had been available at startup.
   - In future turns, the skill should appear in the normal installed skill list.

For a specific assistant target, use the matching install path.

Codex-compatible target:

```bash
PEAR_AI_SKILLS_REPO="${PEAR_AI_SKILLS_REPO:-$HOME/pear-ai-skills}"
"$PEAR_AI_SKILLS_REPO/scripts/install-all-skills.sh" --codex-only --no-color
```

Claude Desktop target:

```bash
PEAR_AI_SKILLS_REPO="${PEAR_AI_SKILLS_REPO:-$HOME/pear-ai-skills}"
"$PEAR_AI_SKILLS_REPO/scripts/install-all-skills.sh" --claude-only --no-color
```

Tell the user Claude may need a restart before it sees newly synced skills.

## Creating or Updating Skills

All Pear skill creation and edits start in the canonical repo. This is mandatory: whenever a user asks to create, edit, update, modify, inspect-and-fix, sync, or push a skill, or whenever you are about to edit any `SKILL.md`, first use this `canonical-skills` workflow even if another task-specific skill also applies.

Do not make an installed or repo-local skill copy the source of truth. Installed copies under `$HOME/.codex/skills`, Claude Desktop, or app repos are mirrors. If you accidentally edited a mirror first, treat it as a scratch diff: port the change into `$HOME/pear-ai-skills`, commit and push the canonical repo, then run the installer to sync the mirror back before the final response.

Do not end a skill-editing turn with only local or installed-copy changes unless pushing is genuinely blocked. Skill edits must be committed and pushed to `Pear-Commerce/pear-ai-skills` in the same turn, immediately after the requested edit and any lightweight verification. Do not batch skill changes for a later turn, and do not leave canonical skill diffs sitting only in the local checkout.

The normal done state for skill edits is: canonical repo updated, staged with only the intended skill files, committed, pushed to `Pear-Commerce/pear-ai-skills`, synced into installed targets, and verified by comparing the touched installed `SKILL.md` files against the canonical files. If any part cannot be completed, say exactly which part is blocked and why.

1. Bootstrap tools and pull the canonical repo first:
   ```bash
   PEAR_AI_SKILLS_REPO="${PEAR_AI_SKILLS_REPO:-$HOME/pear-ai-skills}"
   if [ -x "$PEAR_AI_SKILLS_REPO/scripts/install-all-skills.sh" ]; then
     "$PEAR_AI_SKILLS_REPO/scripts/install-all-skills.sh" --bootstrap-tools --no-color
   else
     curl -fsSL https://raw.githubusercontent.com/Pear-Commerce/pear-ai-skills/main/scripts/install-all-skills.sh \
       | bash -s -- --bootstrap-tools --no-color
   fi
   if git -C "$PEAR_AI_SKILLS_REPO" status >/dev/null 2>&1; then
     git -C "$PEAR_AI_SKILLS_REPO" pull --ff-only
   else
     echo "A normal Git checkout is required before editing or pushing skills."
     exit 1
   fi
   ```
2. Confirm GitHub CLI auth before any push:
   ```bash
   gh auth status || gh auth login --web --git-protocol https
   ```
3. Create or edit `skills/<skill-name>/SKILL.md` in `$PEAR_AI_SKILLS_REPO`.
4. Keep the skill concise, with clear YAML `name` and `description`. Add optional assistant metadata files, such as `agents/openai.yaml`, only when a target UI or assistant integration uses them. Do not create, require, or default skill icons; skill metadata should focus on names, descriptions, instructions, and target-specific prompts.
5. Immediately stage only the intended skill files, commit them, and push `Pear-Commerce/pear-ai-skills`. Do not sweep unrelated untracked skill directories or user edits into the commit.
6. Copy the changed skill into any repo-local or installed copies that must stay in sync.
7. For app repos other than `api.pearcommerce.com`, commit and push those synced copies directly after verification.
8. For `api.pearcommerce.com`, use a `codex/` branch and open a pull request instead of pushing directly to `master`.

Do not make a repo-local skill copy the source of truth. Repo-local copies are vendored mirrors for compatibility.

## Quick Install

To install this bootstrap skill and immediately get set up with Pear's shared skills in both Codex-compatible and Claude Desktop targets, run:

```bash
curl -fsSL https://raw.githubusercontent.com/Pear-Commerce/pear-ai-skills/main/scripts/install-all-skills.sh \
  | bash -s -- --bootstrap-tools
```

If the repo is already checked out locally:

```bash
PEAR_AI_SKILLS_REPO="${PEAR_AI_SKILLS_REPO:-$HOME/pear-ai-skills}"
"$PEAR_AI_SKILLS_REPO/scripts/install-all-skills.sh" --bootstrap-tools --no-color
```

Then start a new chat in that assistant and mention skills normally. Claude Desktop may need a restart before it sees newly synced skills.
