---
name: kit-update
description: 维护 packages/skills-kit 内远程来源 skill、reference 模块和嵌入式 guidance 的登记与更新流程。触发场景：更新或检查 skills-kit skill、同步 reference 模块、查看远程来源、添加/删除登记项。关键词：kit update、skills-kit update、loop skill、meta skill、remote skill、Git source、reference module、skill registry。
---

# kit-update

使用本 skill 让 `packages/skills-kit` 内有远程来源的 skills、reference 模块和嵌入式 guidance 保持可复现。它记录每个来源的名称、远程来源、本地路径、适用时的 reference 模块或嵌入式 guidance 位置，以及预期更新方式。当前未登记远程来源的本地 skills 不应被推断来源。

## 操作流程

1. 确认目标 skill、reference 模块或嵌入式 guidance，并读取下方对应的登记项。
2. 如果目标不在登记表中，先说明当前没有远程来源登记；不要凭空推断来源。
3. 修改前先检查当前本地目录。
4. 将远程来源获取到临时目录。优先使用浅克隆；对子目录使用 sparse checkout；更新后删除临时目录。
5. 更新前先比较获取到的远程内容与本地内容。如果没有有意义的差异，就停止并报告本地内容已是最新。
6. 只有在比较发现差异时，才应用登记的更新方式。不要盲目覆盖本地变更；先比较来源与目标。
7. 保留登记项中标明的本地 overlay。
8. 当运行环境有兼容的 Python 环境时，使用可用的 `skill-creator` validator 验证更新后的 skill。否则，至少检查 `SKILL.md` frontmatter、必需文件和变更文件 diff。
9. 总结已变更文件、已跳过文件、验证状态，以及任何需要跟进的事项。

## `setup-matt-pocock-skills` 依赖修正规则

每次更新来自 `mattpocock/skills` 且涉及 `setup-matt-pocock-skills` 的 skill，必须先读取上游最新 `skills/engineering/setup-matt-pocock-skills/SKILL.md` 及其模板文件。如果目标 skill 依赖 setup 产物，必须修正该 skill 的对应论述，移除所有对 setup 产物的依赖。

## 新登记项

只有当用户明确要求把某个新 skill、reference 模块或嵌入式 guidance 加入 `skills-kit` 远程来源登记表时，才新增登记项。新增时记录：

- `skill-name` 或 reference 名称
- 本地路径
- 远程来源 URL 或 Git 仓库 URL
- 来源子目录，如有
- 更新方式
- 本地 overlay 或更新后步骤，如有

## Loop 登记表

| skill-name | 远程来源 | 本地路径 | 更新方式 |
| --- | --- | --- | --- |
| `antd` | `https://ant.design/llms-full-cn.txt`; `https://ant.design/llms-semantic-cn.md` | reference 模块：`packages/skills-kit/loop/code-spec/references/antd`；父级 guidance：`packages/skills-kit/loop/code-spec/SKILL.md` component-library 相关章节 | 将两个官方中文 `llms` 文件下载到临时位置；按顶层 Ant Design 组件章节拆分 `llms-full-cn.txt`，重新生成 `references/component-docs/`；按顶层语义化章节拆分 `llms-semantic-cn.md`，重新生成 `references/semantic-docs/`；重新生成 `references/component-map.md` 和 `references/semantic-map.md`；拆分成功后删除下载的 `llms` 源文件；然后在同步有意义变更前，比较刷新后的临时模块与 `packages/skills-kit/loop/code-spec/references/antd`。保留本地 Ant Design 工作流 guidance 和 `code-spec` 父级路由入口。 |
| `browser-use` | `https://github.com/browser-use/browser-use/blob/main/skills/browser-use/SKILL.md` | `packages/skills-kit/loop/browser-use` | 使用 sparse checkout 克隆 `https://github.com/browser-use/browser-use` 的 `skills/browser-use/SKILL.md`，比较远程 `SKILL.md` 与本地 `packages/skills-kit/loop/browser-use/SKILL.md` 后同步有意义变更。该 skill 当前没有本地 overlay；同步时保留本地目录结构，不复制上游其他仓库文件，除非用户明确要求扩展维护范围。 |
| `code-review` | `https://github.com/mattpocock/skills/tree/main/skills/engineering/code-review` | `packages/skills-kit/loop/code-review` | 使用 sparse checkout 克隆 `https://github.com/mattpocock/skills` 的 `skills/engineering/code-review`，比较远程目录与本地目录后同步有意义变更。按最新 `setup-matt-pocock-skills` 修正 skill，移除依赖产物；同步后保留本地 overlay：强制并行启动 Standards/Spec 两个 sub-agent；如果 sub-agent 不可用则停止并报告阻塞。 |
| `design-lark-chart` | `skills.byted.org/iaasng/veai` | `packages/skills-kit/loop/lark-doc-quality` 中的嵌入式图表资源；没有独立的 `packages/skills-kit/loop/design-lark-chart` 文件夹 | 使用 `npm_config_registry="https://bnpm.byted.org" pnpx skills@latest add skills.byted.org/iaasng/veai --skill design-lark-chart --agent codex --yes` 获取到临时仓库/worktree；比较获取到的 skill 与 `packages/skills-kit/loop/lark-doc-quality` 中嵌入的图表资源（`references/01-pipeline.md` 到 `references/08-freeform-svg-mode.md`、`references/COVERAGE_REPORT.md`、`references/examples/`、`assets/`、`scripts/`）；然后只同步有意义的图表资源变更。保留 `lark-doc-quality` 集成入口 `references/lark-chart.md`。除非用户明确要求，否则不要重新创建独立的 `design-lark-chart` 文件夹。 |
| `diagnosing-bugs` | `https://github.com/mattpocock/skills/tree/main/skills/engineering/diagnosing-bugs` | `packages/skills-kit/loop/diagnosing-bugs` | 使用 sparse checkout 克隆 `https://github.com/mattpocock/skills` 的 `skills/engineering/diagnosing-bugs`，比较远程目录与本地目录后同步有意义变更。按最新 `setup-matt-pocock-skills` 修正 skill，移除依赖产物。 |
| `grilling` | `https://github.com/mattpocock/skills/tree/main/skills/productivity/grilling` | `packages/skills-kit/loop/grilling` | 使用 sparse checkout 克隆 `https://github.com/mattpocock/skills` 的 `skills/productivity/grilling`，比较远程目录与本地目录后同步有意义变更。 |
| `react-query` | `https://github.com/TanStack/query/tree/main/docs/framework/react` | reference 模块：`packages/skills-kit/loop/code-spec/references/react-query`；父级 guidance：`packages/skills-kit/loop/code-spec/SKILL.md` data-fetching 与外部依赖相关章节 | 将本地 reference 模块复制到临时目录，在该临时副本中运行 `node scripts/update-source-docs.mjs`，通过 git sparse checkout 刷新 React framework docs 快照，然后在同步有意义变更前，比较刷新后的临时模块与 `packages/skills-kit/loop/code-spec/references/react-query`。保留本地 TanStack Query 工作流 guidance、evals 和 `code-spec` 父级路由入口。如果上游 guides、hooks、plugins 或文件名发生变化，更新 `references/doc-map.md`。 |
| `tdd` | `https://github.com/mattpocock/skills/tree/main/skills/engineering/tdd` | `packages/skills-kit/loop/tdd` | 使用 sparse checkout 克隆 `https://github.com/mattpocock/skills` 的 `skills/engineering/tdd`，比较远程目录与本地目录后同步有意义变更。按最新 `setup-matt-pocock-skills` 修正 skill，移除依赖产物。 |
| `to-prd` | `https://github.com/mattpocock/skills/tree/main/skills/engineering/to-prd` | `packages/skills-kit/loop/to-prd` | 使用 sparse checkout 克隆 `https://github.com/mattpocock/skills` 的 `skills/engineering/to-prd`，比较远程目录与本地目录后同步有意义变更。按最新 `setup-matt-pocock-skills` 修正 skill，移除依赖产物。 |
| `vite-plus` | `https://github.com/voidzero-dev/vite-plus/tree/main/docs/config`; `https://github.com/voidzero-dev/vite-plus/tree/main/docs/guide` | reference 模块：`packages/skills-kit/loop/code-spec/references/vite-plus`；父级 guidance：`packages/skills-kit/loop/code-spec/SKILL.md` Vite+ 章节 | 将本地 reference 模块复制到临时目录，在该临时副本中运行 `node scripts/update-source-docs.mjs`，通过 git sparse checkout 刷新 `docs/config` 和 `docs/guide` 快照，然后在同步有意义变更前，比较刷新后的临时模块与 `packages/skills-kit/loop/code-spec/references/vite-plus`。保留 `README.md`、evals（如有）和 `code-spec` 父级 Vite+ 路由入口；旧的提炼型 `references/*.md` 不再保留。如果上游命令、配置主题或文件名发生变化，更新 `references/source-map.md`、`README.md` 和父级 Vite+ 路由说明。 |
| `zod` | `https://github.com/colinhacks/zod/tree/main/packages/docs/content` | reference 模块：`packages/skills-kit/loop/code-spec/references/zod`；父级 guidance：`packages/skills-kit/loop/code-spec/SKILL.md` validation 与外部依赖相关章节 | 将本地 reference 模块复制到临时目录，在该临时副本中运行 `node scripts/update-source-docs.mjs`，通过 git sparse checkout 刷新 Zod docs 快照，然后在同步有意义变更前，比较刷新后的临时模块与 `packages/skills-kit/loop/code-spec/references/zod`。保留本地 Zod 工作流 guidance、evals 和 `code-spec` 父级路由入口。如果上游 docs routes、package docs 或文件名发生变化，更新 `references/doc-map.md`。 |

## Meta 登记表

| skill-name | 远程来源 | 本地路径 | 更新方式 |
| --- | --- | --- | --- |
| `teach` | `https://github.com/mattpocock/skills/tree/main/skills/productivity/teach` | `packages/skills-kit/meta/teach` | 使用 sparse checkout 克隆 `https://github.com/mattpocock/skills` 的 `skills/productivity/teach`，比较远程目录与本地目录后同步有意义变更。同步 `SKILL.md` 时保留同目录格式参考文件：`MISSION-FORMAT.md`、`RESOURCES-FORMAT.md`、`LEARNING-RECORD-FORMAT.md`、`GLOSSARY-FORMAT.md`。保留本地 overlay：删除上游 `disable-model-invocation: true` 和 `argument-hint` frontmatter 字段，因为当前 validator 不接受这些字段。 |
| `writing-great-skills` | `https://github.com/mattpocock/skills/tree/main/skills/productivity/writing-great-skills` | `packages/skills-kit/meta/writing-great-skills` | 使用 sparse checkout 克隆 `https://github.com/mattpocock/skills` 的 `skills/productivity/writing-great-skills`，比较远程目录与本地目录后同步有意义变更。同步 `SKILL.md` 时保留同目录 `GLOSSARY.md`，避免正文引用断链。保留本地 overlay：删除上游 `disable-model-invocation: true` frontmatter 字段，因为当前 validator 不接受该字段。 |

当前 `note-creator` 和 `to-anki` 没有已登记的远程来源；只有用户明确提供来源并要求登记时才新增条目。

## 更新方式细节

### 一致性检查

获取远程来源后，在复制或重新生成任何内容前，先比较来源目录与本地目录。

```bash
diff -qr <remote-dir> <local-dir>
```

如果排除已知的仅本地文件后，`diff` 报告没有差异，就不要更新本地内容。报告本地与远程已经一致。

对于提取型 skills，先把刷新后的 skill 生成到临时输出目录，然后比较该临时生成 skill 与本地 skill。只有生成输出存在差异时，才替换本地文件。

### GitHub 子目录

适用于存放在较大仓库内部的 skills。

```bash
git clone --depth 1 --filter=blob:none --sparse <repo-url> <tmp-dir>
cd <tmp-dir>
git sparse-checkout set <source-subdirectory>
# 检查 <source-subdirectory>，将其与本地 skill 比较，然后有意识地同步。
```

只有在确认来源布局与目标 skill 匹配后，才优先考虑 `rsync --delete`。排除仅本地文件，不复制 secrets 或生成输出。

### Reference 模块与嵌入式 Guidance

适用于远程 skill 内容作为 reference 模块存放在另一个本地 skill 下，且其通用规则也直接嵌入父 skill 的情况，例如 `code-spec` 内部的 `references/vite-plus`、`references/antd`、`references/react-query` 和 `references/zod`。

1. 先按照登记方式更新或重新生成 reference 模块。
2. 检查 `packages/skills-kit/loop/code-spec/SKILL.md` 中的嵌入式 guidance 章节。
3. 保持嵌入式 guidance 简洁：它应使用直接语言说明通用工作流，并且只在详细命令、配置或组件 API 问题上链接到 reference 模块。
4. 保留本地集成说明，以及 `kxh-awesome` 的验证边界。
5. 不要把整个上游 skill 正文复制到 `code-spec/SKILL.md`；保持其可读性，把深入细节留在 reference 模块中。
