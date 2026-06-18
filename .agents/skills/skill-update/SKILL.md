---
name: skill-update
description: 维护远程来源 skill 的登记与更新流程。触发场景：更新或检查远程 skill、查看远程来源、添加/删除远程登记项、同步 reference 模块或嵌入式 guidance，或新建 skill 后确认是否加入远程登记表。关键词：remote skill、Git source、skill registry、update skill。
---

# skill-update

使用本 skill 让远程来源的 skills 保持可复现。它记录每个 skill 的名称、远程来源、本地路径、适用时的 reference 模块或嵌入式 guidance 位置，以及预期更新方式。

## 操作流程

1. 确认目标 skill，并读取下方对应的登记项。
2. 修改前先检查当前本地 skill 目录。
3. 将远程来源获取到临时目录。优先使用浅克隆；对子目录使用 sparse checkout；更新后删除临时目录。
4. 更新前先比较获取到的远程 skill 内容与本地 skill。如果没有有意义的差异，就停止并报告本地 skill 已是最新。
5. 只有在比较发现差异时，才应用登记的更新方式。不要盲目覆盖本地变更；先比较来源与目标。
6. 保留登记项中标明的本地 overlay。
7. 当运行环境有兼容的 Python 环境时，使用可用的 `skill-creator` validator 验证更新后的 skill。否则，至少检查 `SKILL.md` frontmatter、必需文件和变更文件 diff。
8. 总结已变更文件、已跳过文件、验证状态，以及任何需要跟进的事项。

## 新 Skill 后续处理

创建任何新 skill 后，询问用户：

```text
新创建的 <skill-name> 是否来自远程 Git 仓库或远程 skill 包？如果是，请提供来源地址和期望的更新方式。是否需要把它添加到 skill-update 的远程技能登记表？
```

如果用户确认需要，就向登记表添加一项，包含：

- `skill-name`
- 本地 skill 路径
- 远程来源 URL 或 Git 仓库 URL
- 来源子目录，如有
- 更新方式
- 本地 overlay 或更新后步骤，如有

## 远程 Skill 登记表

| skill-name | 远程来源 | 本地路径 | 更新方式 |
| --- | --- | --- | --- |
| `antd` | `https://ant.design/llms-full-cn.txt`; `https://ant.design/llms-semantic-cn.md` | reference 模块：`.agents/skills/code-spec/references/antd`；父级 guidance：`.agents/skills/code-spec/SKILL.md` component-library 相关章节 | 将两个官方中文 `llms` 文件下载到临时位置；按顶层 Ant Design 组件章节拆分 `llms-full-cn.txt`，重新生成 `references/component-docs/`；按顶层语义化章节拆分 `llms-semantic-cn.md`，重新生成 `references/semantic-docs/`；重新生成 `references/component-map.md` 和 `references/semantic-map.md`；拆分成功后删除下载的 `llms` 源文件；然后在同步有意义变更前，比较刷新后的临时模块与 `.agents/skills/code-spec/references/antd`。保留本地 Ant Design 工作流 guidance 和 `code-spec` 父级路由入口。 |
| `design-lark-chart` | `skills.byted.org/iaasng/veai` | `.agents/skills/lark-doc-quality` 中的嵌入式图表资源；没有独立的 `.agents/skills/design-lark-chart` 文件夹 | 使用 `npm_config_registry="https://bnpm.byted.org" pnpx skills@latest add skills.byted.org/iaasng/veai --skill design-lark-chart --agent codex --yes` 获取到临时仓库/worktree；比较获取到的 skill 与 `.agents/skills/lark-doc-quality` 中嵌入的图表资源（`references/01-pipeline.md` 到 `references/08-freeform-svg-mode.md`、`references/COVERAGE_REPORT.md`、`references/examples/`、`assets/`、`scripts/`）；然后只同步有意义的图表资源变更。保留 `lark-doc-quality` 集成入口 `references/lark-chart.md`。除非用户明确要求，否则不要重新创建独立的 `design-lark-chart` 文件夹。 |
| `diagnosing-bugs` | `https://github.com/mattpocock/skills/tree/main/skills/engineering/diagnosing-bugs` | `.agents/skills/diagnosing-bugs` | 使用 sparse checkout 克隆 `https://github.com/mattpocock/skills` 的 `skills/engineering/diagnosing-bugs`，比较远程目录与本地目录后同步有意义变更。同步后保留本地后处理：删除对 `setup-matt-pocock-skills` 基础配置的硬性假设，包括预置 domain glossary、`CONTEXT.md`、ADR 配置等表述；只保留基于实际读取文件的诊断流程。 |
| `drizzle-orm` | `https://github.com/drizzle-team/drizzle-orm-docs/tree/main/src/content/docs` | reference 模块：`.agents/skills/code-spec/references/drizzle-orm`；父级 guidance：`.agents/skills/code-spec/SKILL.md` backend 相关章节 | 将本地 reference 模块复制到临时目录，在该临时副本中运行 `node scripts/update-source-docs.mjs`，通过 git sparse checkout 刷新 docs 快照，然后在同步有意义变更前，比较刷新后的临时模块与 `.agents/skills/code-spec/references/drizzle-orm`。保留本地 Drizzle 安全 guidance、evals 和 `code-spec` 父级路由入口。如果上游主题或文件名发生变化，更新 `references/doc-map.md`。 |
| `grilling` | `https://github.com/mattpocock/skills/tree/main/skills/productivity/grilling` | `.agents/skills/grilling` | 使用 sparse checkout 克隆 `https://github.com/mattpocock/skills` 的 `skills/productivity/grilling`，比较远程目录与本地目录后同步有意义变更。该 skill 当前没有 `setup-matt-pocock-skills` 基础配置依赖；若上游以后新增相关表述，同步后删除这些硬性假设。 |
| `hono` | `https://github.com/honojs/website/tree/main/docs` | reference 模块：`.agents/skills/code-spec/references/hono`；父级 guidance：`.agents/skills/code-spec/SKILL.md` backend 相关章节 | 将本地 reference 模块复制到临时目录，在该临时副本中运行 `node scripts/update-source-docs.mjs`，通过 git sparse checkout 刷新 `docs` 快照，然后在同步有意义变更前，比较刷新后的临时模块与 `.agents/skills/code-spec/references/hono`。保留本地 Hono 工作流 guidance、evals 和 `code-spec` 父级路由入口。如果上游主题或文件名发生变化，更新 `references/source-map.md` 和 `README.md`。 |
| `improve-codebase-architecture` | `https://github.com/mattpocock/skills/tree/main/skills/engineering/improve-codebase-architecture` | `.agents/skills/improve-codebase-architecture` | 使用 sparse checkout 克隆 `https://github.com/mattpocock/skills` 的 `skills/engineering/improve-codebase-architecture`，比较远程目录与本地目录后同步有意义变更。同步后保留本地后处理：删除对 `setup-matt-pocock-skills` 基础配置的硬性假设，包括预置 `CONTEXT.md`、ADR 布局、`grill-with-docs` 产物和未安装相对链接；只保留基于实际读取文件的架构审查流程。 |
| `react-query` | `https://github.com/TanStack/query/tree/main/docs/framework/react` | reference 模块：`.agents/skills/code-spec/references/react-query`；父级 guidance：`.agents/skills/code-spec/SKILL.md` data-fetching 与外部依赖相关章节 | 将本地 reference 模块复制到临时目录，在该临时副本中运行 `node scripts/update-source-docs.mjs`，通过 git sparse checkout 刷新 React framework docs 快照，然后在同步有意义变更前，比较刷新后的临时模块与 `.agents/skills/code-spec/references/react-query`。保留本地 TanStack Query 工作流 guidance、evals 和 `code-spec` 父级路由入口。如果上游 guides、hooks、plugins 或文件名发生变化，更新 `references/doc-map.md`。 |
| `shadcn` | `https://github.com/shadcn/ui/tree/main/skills/shadcn` | reference 模块：`.agents/skills/code-spec/references/shadcn`；父级 guidance：`.agents/skills/code-spec/SKILL.md` shadcn/ui 相关章节 | 将本地 reference 模块复制到临时目录，在该临时副本中运行 `node scripts/update-source-docs.mjs`，通过 git sparse checkout 刷新 `skills/shadcn` 快照，然后在同步有意义变更前，比较刷新后的临时模块与 `.agents/skills/code-spec/references/shadcn`。保留本地 `scripts/` 更新入口和 `code-spec` 父级路由入口；刷新嵌入在 `code-spec` 中的简明 shadcn/ui guidance，确保它直接、可读，并与当前 shadcn 规则一致。 |
| `skill-creator` | `https://github.com/anthropics/skills/tree/main/skills/skill-creator` | `.agents/skills/skill-creator` | 使用 sparse checkout 克隆 `https://github.com/anthropics/skills` 的 `skills/skill-creator`，然后在审阅 diff 后将该子目录同步到本地路径。保留本地规则：创建新 skill 后调用 `skill-update` 做后续处理。 |
| `teach` | `https://github.com/mattpocock/skills/tree/main/skills/productivity/teach` | `.agents/skills/teach` | 使用 sparse checkout 克隆 `https://github.com/mattpocock/skills` 的 `skills/productivity/teach`，比较远程目录与本地目录后同步有意义变更。该 skill 当前没有本地 overlay；若上游以后新增对 `setup-matt-pocock-skills` 基础配置的硬性假设，同步后删除这些硬性假设。 |
| `tdd` | `https://github.com/mattpocock/skills/tree/main/skills/engineering/tdd` | `.agents/skills/tdd` | 使用 sparse checkout 克隆 `https://github.com/mattpocock/skills` 的 `skills/engineering/tdd`，比较远程目录与本地目录后同步有意义变更。同步后保留本地后处理：删除对 `setup-matt-pocock-skills` 基础配置的硬性假设，包括预置 domain glossary、`CONTEXT.md`、ADR 配置等表述；只保留基于实际读取文件的 TDD 流程。 |
| `to-prd` | `https://github.com/mattpocock/skills/tree/main/skills/engineering/to-prd` | `.agents/skills/to-prd` | 使用 sparse checkout 克隆 `https://github.com/mattpocock/skills` 的 `skills/engineering/to-prd`，比较远程目录与本地目录后同步有意义变更。同步后保留本地后处理：删除对 `setup-matt-pocock-skills` 基础配置的硬性假设，包括 issue tracker、triage label、预置 domain glossary 和 ADR 配置；默认只产出 PRD 并返回给用户，不发布到问题追踪系统。 |
| `vite-plus` | `https://github.com/voidzero-dev/vite-plus/tree/main/docs/config`; `https://github.com/voidzero-dev/vite-plus/tree/main/docs/guide` | reference 模块：`.agents/skills/code-spec/references/vite-plus`；父级 guidance：`.agents/skills/code-spec/SKILL.md` Vite+ 章节 | 将本地 reference 模块复制到临时目录，在该临时副本中运行 `node scripts/update-source-docs.mjs`，通过 git sparse checkout 刷新 `docs/config` 和 `docs/guide` 快照，然后在同步有意义变更前，比较刷新后的临时模块与 `.agents/skills/code-spec/references/vite-plus`。保留 `README.md`、evals（如有）和 `code-spec` 父级 Vite+ 路由入口；旧的提炼型 `references/*.md` 不再保留。如果上游命令、配置主题或文件名发生变化，更新 `references/source-map.md`、`README.md` 和父级 Vite+ 路由说明。 |
| `zod` | `https://github.com/colinhacks/zod/tree/main/packages/docs/content` | reference 模块：`.agents/skills/code-spec/references/zod`；父级 guidance：`.agents/skills/code-spec/SKILL.md` validation 与外部依赖相关章节 | 将本地 reference 模块复制到临时目录，在该临时副本中运行 `node scripts/update-source-docs.mjs`，通过 git sparse checkout 刷新 Zod docs 快照，然后在同步有意义变更前，比较刷新后的临时模块与 `.agents/skills/code-spec/references/zod`。保留本地 Zod 工作流 guidance、evals 和 `code-spec` 父级路由入口。如果上游 docs routes、package docs 或文件名发生变化，更新 `references/doc-map.md`。 |

## 更新方式细节

### 一致性检查

获取远程来源后，在复制或重新生成任何内容前，先比较来源 skill 目录与本地 skill 目录。

```bash
diff -qr <remote-skill-dir> <local-skill-dir>
```

如果排除已知的仅本地文件后，`diff` 报告没有差异，就不要更新本地 skill。报告本地与远程 skill 已经一致。

对于提取型 skills，先把刷新后的 skill 生成到临时输出目录，然后比较该临时生成 skill 与本地 skill。只有生成输出存在差异时，才替换本地文件。

### 直接 Skill 仓库

适用于仓库根目录本身就是 skill 包的情况。

```bash
git clone --depth 1 <repo-url> <tmp-dir>
# 检查 <tmp-dir>，将其与 .agents/skills/<skill-name> 比较，然后有意识地同步。
```

只有在确认来源布局与目标 skill 匹配后，才优先考虑 `rsync --delete`。排除仅本地文件，不复制 secrets 或生成输出。

### GitHub 子目录

适用于存放在较大仓库内部的 skills，例如 `skill-creator`。

```bash
git clone --depth 1 --filter=blob:none --sparse <repo-url> <tmp-dir>
cd <tmp-dir>
git sparse-checkout set <source-subdirectory>
# 检查 <source-subdirectory>，将其与本地 skill 比较，然后有意识地同步。
```

更新 `skill-creator` 后，确认它的说明仍包含 `skill-update` 的新 skill 后续处理规则。

### 提取型 Skill

适用于将来源仓库文档转换成 skill 的情况。

1. 在临时目录中克隆或更新远程仓库。
2. 阅读相关 docs 和来源文档入口。
3. 使用 `skill-extractor` 将 skill 重新生成到目标路径。
4. 验证生成的 skill 保留了重要来源文档，并遵循 progressive disclosure。
5. 接受重新生成的文件前，先审阅 diff。

### Reference 模块与嵌入式 Guidance

适用于远程 skill 内容作为 reference 模块存放在另一个本地 skill 下，且其通用规则也直接嵌入父 skill 的情况，例如 `code-spec` 内部的 `references/vite-plus`、`references/shadcn`、`references/antd`、`references/hono`、`references/drizzle-orm`、`references/react-query` 和 `references/zod`。

1. 先按照登记方式更新或重新生成 reference 模块。
2. 检查 `.agents/skills/code-spec/SKILL.md` 中的嵌入式 guidance 章节。
3. 保持嵌入式 guidance 简洁：它应使用直接语言说明通用工作流，并且只在详细命令、配置或组件 API 问题上链接到 reference 模块。
4. 保留本地集成说明，尤其是 shadcn 的 Vite+ 命令包装方式，以及 `kxh-awesome` 的验证边界。
5. 不要把整个上游 skill 正文复制到 `code-spec/SKILL.md`；保持其可读性，把深入细节留在 reference 模块中。
