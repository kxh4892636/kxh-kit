---
name: skill-update
description: 维护远程来源 skill 的登记与更新流程。触发：更新或检查远程 skill、查看远程来源、添加/删除远程登记项、同步子 skill 或嵌入式 guidance，或新建 skill 后确认是否加入远程登记表。关键词：remote skill、Git source、skill registry、update skill。
---

# skill-update

Use this skill to keep remote skills reproducible. It records each skill name, remote source, local path, child skill folder or embedded guidance location when applicable, and the expected update method.

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
新创建的 <skill-name> 是否来自远程 Git 仓库或远程 skill 包？如果是，请提供来源地址和期望的更新方式。是否需要把它添加到 skill-update 的远程技能登记表？
```

If the user says yes, add an entry to the registry with:

- `skill-name`
- local skill path
- Remote source URL or Git repository URL
- source subdirectory, if any
- update method
- local overlays or post-update steps, if any

## Remote Skill Registry

| skill-name | Remote source | Local path | Update method |
| --- | --- | --- | --- |
| `design-lark-chart` | `skills.byted.org/iaasng/veai` | Embedded chart resources in `.agents/skills/lark-doc-quality`; no standalone `.agents/skills/design-lark-chart` folder | Fetch into a temporary repo/worktree with `npm_config_registry="https://bnpm.byted.org" pnpx skills@latest add skills.byted.org/iaasng/veai --skill design-lark-chart --agent codex --yes`, compare the fetched skill with the embedded chart resources in `.agents/skills/lark-doc-quality` (`references/01-pipeline.md` through `references/08-freeform-svg-mode.md`, `references/COVERAGE_REPORT.md`, `references/examples/`, `assets/`, `scripts/`), then sync only meaningful chart-resource changes. Preserve the `lark-doc-quality` integration entry `references/lark-chart.md`. Do not recreate a standalone `design-lark-chart` folder unless the user explicitly asks for it. |
| `gpt-image` | `https://github.com/wuyoscar/gpt_image_2_skill` | `.agents/skills/gpt-image` | Clone the repository into a temporary directory, inspect the root skill contents, then sync the skill files into the local path after reviewing the diff. Keep generated outputs, API keys, and local-only environment files out of the sync. |
| `shadcn` | `https://github.com/shadcn/ui/tree/main/skills/shadcn` | child folder: `.agents/skills/fe-code-spec/shadcn`; parent guidance: `.agents/skills/fe-code-spec/SKILL.md` shadcn/ui sections | Clone `https://github.com/shadcn/ui` with sparse checkout for `skills/shadcn`, then copy that subdirectory into the child folder after reviewing the diff. Preserve and refresh the concise shadcn/ui guidance embedded in `fe-code-spec` so it stays direct, readable, and aligned with current shadcn rules. |
| `skill-creator` | `https://github.com/anthropics/skills/tree/main/skills/skill-creator` | `.agents/skills/skill-creator` | Clone `https://github.com/anthropics/skills` with sparse checkout for `skills/skill-creator`, then sync that subdirectory into the local path after reviewing the diff. Preserve the local post-creation rule that invokes `skill-update` after creating a new skill. |
| `vite-plus` | `https://github.com/voidzero-dev/vite-plus` | child folder: `.agents/skills/fe-code-spec/vite-plus`; parent guidance: `.agents/skills/fe-code-spec/SKILL.md` Vite+ section | Clone the repository into a temporary directory, then use `skill-extractor` to regenerate the Vite+ child skill folder from the repository documentation. Do not update by direct file sync alone; the local skill is extracted and condensed. Preserve and refresh the concise Vite+ guidance embedded in `fe-code-spec` so it stays direct, readable, and linked to current detailed references. |

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

### Child Skill Folder and Embedded Guidance

Use when a remote skill is stored as a child folder under another local skill and its common rules are also embedded directly in the parent skill, such as `vite-plus` and `shadcn` inside `fe-code-spec`.

1. Update or regenerate the child skill folder first, following its registry method.
2. Inspect the embedded guidance section in `.agents/skills/fe-code-spec/SKILL.md`.
3. Keep the embedded guidance concise: it should explain the common workflow in direct language and only link out to the child folder for detailed command, config, or component API questions.
4. Preserve local integration notes, especially Vite+ command wrappers for shadcn and `kxh-awesome` validation boundaries.
5. Do not copy the whole upstream skill body into `fe-code-spec/SKILL.md`; keep it readable and leave deep details in the child skill folder references.
