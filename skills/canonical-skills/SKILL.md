---
name: canonical-skills
description: Bootstrap Pear's canonical skill system. Use whenever the user mentions skills, asks to use a skill, install/import/update/create/modify a skill, references a repo-local or installed skill, or asks what skills are available. Finds skills in the canonical Pear-Commerce/pear-ai-skills repo, syncs the canonical skill library preemptively, re-checks whether a newly synced skill applies, and makes all skill edits in the canonical repo first.
---

# Canonical Skills

This is the one Pear skill people should install manually in any AI assistant that supports local skills. It teaches the assistant where Pear skills live, syncs Pear's shared skill library up front, and keeps future skill edits rooted in the canonical repo.

## Canonical Source

The canonical Pear skills repository is:

```text
https://github.com/Pear-Commerce/pear-ai-skills
```

Local checkout should usually be:

```text
$HOME/pear-ai-skills
```

## When Any Skill Is Mentioned

When the user mentions skills in any context, do this before deciding no skill applies:

1. Make sure the canonical repo exists locally.
   ```bash
   PEAR_AI_SKILLS_REPO="${PEAR_AI_SKILLS_REPO:-$HOME/pear-ai-skills}"
   if [ -d "$PEAR_AI_SKILLS_REPO/.git" ]; then
     git -C "$PEAR_AI_SKILLS_REPO" pull --ff-only
   else
     git clone https://github.com/Pear-Commerce/pear-ai-skills "$PEAR_AI_SKILLS_REPO"
   fi
   ```
2. Sync the canonical skill library into every available local skill target preemptively:
   ```bash
   PEAR_AI_SKILLS_REPO="${PEAR_AI_SKILLS_REPO:-$HOME/pear-ai-skills}"
   "$PEAR_AI_SKILLS_REPO/scripts/install-all-skills.sh" --no-color
   ```
3. List available canonical skills:
   ```bash
   PEAR_AI_SKILLS_REPO="${PEAR_AI_SKILLS_REPO:-$HOME/pear-ai-skills}"
   find "$PEAR_AI_SKILLS_REPO/skills" -maxdepth 2 -name SKILL.md -print | sort
   ```
4. Choose likely relevant skills by reading their YAML frontmatter only unless more detail is needed.
5. Re-check whether any imported skill is appropriate for the user's request.
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

All Pear skill creation and edits start in the canonical repo.

1. Pull the canonical repo first:
   ```bash
   PEAR_AI_SKILLS_REPO="${PEAR_AI_SKILLS_REPO:-$HOME/pear-ai-skills}"
   git -C "$PEAR_AI_SKILLS_REPO" pull --ff-only
   ```
2. Create or edit `skills/<skill-name>/SKILL.md` in `$PEAR_AI_SKILLS_REPO`.
3. Keep the skill concise, with clear YAML `name` and `description`. Add optional assistant metadata files, such as `agents/openai.yaml`, only when a target UI or assistant integration uses them. Do not create, require, or default skill icons; skill metadata should focus on names, descriptions, instructions, and target-specific prompts.
4. Commit and push `Pear-Commerce/pear-ai-skills`.
5. Copy the changed skill into any repo-local or installed copies that must stay in sync.
6. For app repos other than `api.pearcommerce.com`, commit and push those synced copies directly after verification.
7. For `api.pearcommerce.com`, use a `codex/` branch and open a pull request instead of pushing directly to `master`.

Do not make a repo-local skill copy the source of truth. Repo-local copies are vendored mirrors for compatibility.

## Quick Install

To install this bootstrap skill and immediately get set up with Pear's shared skills in both Codex-compatible and Claude Desktop targets, run:

```bash
curl -fsSL https://raw.githubusercontent.com/Pear-Commerce/pear-ai-skills/main/scripts/install-all-skills.sh | bash
```

If the repo is already checked out locally:

```bash
PEAR_AI_SKILLS_REPO="${PEAR_AI_SKILLS_REPO:-$HOME/pear-ai-skills}"
"$PEAR_AI_SKILLS_REPO/scripts/install-all-skills.sh" --no-color
```

Then start a new chat in that assistant and mention skills normally. Claude Desktop may need a restart before it sees newly synced skills.
