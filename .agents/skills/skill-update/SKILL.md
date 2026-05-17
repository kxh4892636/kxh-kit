---
name: skill-update
description: Track, register, and update skills that were downloaded or generated from remote Git repositories. Use when a user asks to update a Git-backed skill, inspect a remote skill source, add or remove a remote skill registry entry, or immediately after creating any new skill to ask whether the new skill is backed by a remote Git repository and should be added to this registry.
---

# skill-update

Use this skill to keep remote Git-backed skills reproducible. It records each skill name, source repository, local path, and the expected update method.

## Operating Workflow

1. Identify the target skill and read its registry entry below.
2. Inspect the current local skill directory before changing it.
3. Fetch the remote source into a temporary directory. Prefer shallow clones, sparse checkout for subdirectories, and delete the temporary directory after the update.
4. Compare the fetched remote skill content with the local skill before updating. If there is no meaningful diff, stop and report that the local skill is already up to date.
5. Apply the recorded update method only when the comparison shows differences. Do not blindly overwrite local changes; compare the source and destination first.
6. Preserve local overlays called out in the registry entry.
7. Validate the updated skill with the available `skill-creator` validator when the runtime has a compatible Python environment. If not, at least check `SKILL.md` frontmatter, required files, and changed-file diffs.
8. Summarize changed files, skipped files, validation status, and any follow-up needed.

## New Skill Follow-up

After any new skill is created, ask the user:

```text
新创建的 <skill-name> 是否来自远程 Git 仓库？如果是，请提供仓库地址和期望的更新方式。是否需要把它添加到 skill-update 的远程技能登记表？
```

If the user says yes, add an entry to the registry with:

- `skill-name`
- local skill path
- Git repository URL
- source subdirectory, if any
- update method
- local overlays or post-update steps, if any

## Remote Skill Registry

| skill-name | Git repository | Local path | Update method |
| --- | --- | --- | --- |
| `gpt-image` | `https://github.com/wuyoscar/gpt_image_2_skill` | `.agents/skills/gpt-image` | Clone the repository into a temporary directory, inspect the root skill contents, then sync the skill files into the local path after reviewing the diff. Keep generated outputs, API keys, and local-only environment files out of the sync. |
| `shadcn` | `https://github.com/shadcn/ui/tree/main/skills/shadcn` | `.agents/skills/shadcn` | Clone `https://github.com/shadcn/ui` with sparse checkout for `skills/shadcn`, then copy that subdirectory into the local path after reviewing the diff. Preserve local Codex/Vite+ notes if added later. |
| `skill-creator` | `https://github.com/anthropics/skills/tree/main/skills/skill-creator` | `.agents/skills/skill-creator` | Clone `https://github.com/anthropics/skills` with sparse checkout for `skills/skill-creator`, then sync that subdirectory into the local path after reviewing the diff. Preserve the local post-creation rule that invokes `skill-update` after creating a new skill. |
| `vite-plus` | `https://github.com/voidzero-dev/vite-plus` | `.agents/skills/vite-plus` | Clone the repository into a temporary directory, then use `skill-extractor` to regenerate the skill from the Vite+ repository documentation. Do not update by direct file sync alone; the local skill is an extracted and condensed skill, not a direct copy of the source repository. |

## Update Method Details

### Consistency Check

After fetching the remote source, compare the source skill directory with the local skill directory before copying or regenerating anything.

```bash
diff -qr <remote-skill-dir> <local-skill-dir>
```

If `diff` reports no differences after excluding known local-only files, do not update the local skill. Report that the local and remote skills are already consistent.

For extracted skills, generate the refreshed skill into a temporary output directory first, then compare that temporary generated skill with the local skill. Only replace local files when the generated output differs.

### Direct Skill Repository

Use for repositories whose root is already the skill package, such as `gpt-image`.

```bash
git clone --depth 1 <repo-url> <tmp-dir>
# Inspect <tmp-dir>, compare it with .agents/skills/<skill-name>, then sync intentionally.
```

Prefer `rsync --delete` only after verifying the source layout matches the destination skill. Exclude local-only files and do not copy secrets or generated outputs.

### GitHub Subdirectory

Use for skills stored inside a larger repository, such as `skill-creator`.

```bash
git clone --depth 1 --filter=blob:none --sparse <repo-url> <tmp-dir>
cd <tmp-dir>
git sparse-checkout set <source-subdirectory>
# Inspect <source-subdirectory>, compare it with the local skill, then sync intentionally.
```

After updating `skill-creator`, confirm its instructions still include the `skill-update` new-skill follow-up.

### Extracted Skill

Use for source repositories whose documentation is transformed into a skill, such as `vite-plus`.

1. Clone or update the remote repository in a temporary directory.
2. Read the relevant docs and source documentation entry points.
3. Use `skill-extractor` to regenerate the skill into the target path.
4. Verify the generated skill preserves important source documentation and follows progressive disclosure.
5. Review diffs before accepting the regenerated files.
