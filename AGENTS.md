# kxh-awesome Agent Instructions

## 仓库性质

本仓库同时包含工程项目、项目模板、本地工具包、Codex skills、文档和草稿内容。Agent 规则只分两层：根层 `AGENTS.md` 和独立项目目录内的项目层 `AGENTS.md`；

## Git

- Remote: `git@github.com:kxh4892636/kxh-awesome.git`
- Git commit message 遵循 commitlint 规范；
- Git commit message 使用中文。
- Git commit message 少于 13 个字。

## 任务分流

- 工程任务：代码、依赖、Node/workspace、构建、测试、lint、format、RPC/proto、生成代码、git hook、package script 或工程配置变更。先读取最近的 `AGENTS.md`、相关 `package.json`、`tsconfig.json`、`vite.config.ts`、协议文件和入口文件，再做最小必要验证。
- 内容任务：笔记、周报、调研、文档润色、资料整理、非构建产物的 Markdown/文本输出。优先读取用户材料和目标内容文件，不要因为文件在本仓库内就默认读取 Node/Vite+ 配置或运行工程检查。
- 混合任务：如果内容变更会影响站点构建、导航、配置、可执行示例、生成文档、package metadata 或发布产物，先完成内容主体，再只读取受影响工程配置并做贴近影响面的验证。

## 统一工具链

- Node、workspace、前端、构建、测试、lint、format、依赖和 package script 相关操作统一使用 `vp`。
- 不要直接调用 `pnpm`、`npm`、`yarn`、`vite`、`vitest`、`oxlint` 或 `oxfmt`。
- 运行 package script 使用 `vp run <script>`；需要递归或过滤时使用 `vp run` 的 workspace 能力。
- 生成物默认只读。不要手写 `dist/`、`build/`、`gen/`、`src/api/gen/`、`.docusaurus/`、`pnpm-lock.yaml` 或 `*.tsbuildinfo`。

## 顶层目录

- `apps/`：真实应用。每个独立应用目录维护自己的项目层 `AGENTS.md`。
- `packages/`：可复用包、Codex plugin 和浏览器扩展。每个独立 package 或扩展目录维护自己的项目层 `AGENTS.md`。
- `templates/`：可复制的项目模板。模板规则写在各模板目录的项目层 `AGENTS.md`。
- `.agents/`：本仓库维护的本地 skills。按具体 skill 文件和用户任务处理，不默认运行工程检查。
- `docs/`：仓库文档和 handoff 文档。更新 handoff TaskList 时保持事实、假设、决策和状态分开。
- `inbox/`：临时资料、草稿和迁移内容。默认按内容任务处理。
- `scripts/`：仓库维护脚本。保持脚本小而确定，修改后只运行相关验证。
- `output/`：工具输出和临时产物。默认视为可再生成内容，清理或依赖其中结果前先确认用途。
