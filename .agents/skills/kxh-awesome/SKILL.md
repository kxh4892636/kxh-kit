---
name: kxh-awesome
description: kxh-awesome 仓库操作规范。在本仓库中做任何代码、文档、依赖、Node.js、workspace、构建、测试、格式化、RPC、生成代码、git hook 或提交相关操作时必须使用。本仓库是 pnpm workspaces + Vite+ monorepo，一切 Node/前端工具链操作通过 vp 管理；改动前先读最近的 AGENT.md、package.json、vite.config.ts、tsconfig.json 和协议/配置源头。关键词：pnpm、node、依赖、workspace、monorepo、vp、vite-plus、kxh、install、build、dev、test、lint、fmt、check、connectrpc、proto、codegen、git hook、pre-commit、commit-msg
---

# kxh-awesome

本仓库是 pnpm workspaces + Vite+ 的 monorepo。Node、前端、依赖、检查、构建、测试、workspace 脚本等操作统一通过 `vp` 管理。

## 工作原则

- **源头优先**：改动前读取最近的 `AGENT.md`、`package.json`、`vite.config.ts`、`tsconfig.json`、协议文件和相关配置，不凭记忆猜项目结构。
- **最小变更**：只修改用户请求需要的文件；保留无关变更、生成物、锁文件和用户已有改动。
- **统一工具链**：Node/workspace 操作使用 `vp`，不要直接调用 `pnpm` / `npm` / `yarn` / `vite` / `vitest` / `oxlint` / `oxfmt`。
- **生成物只读**：修改源定义后重新生成，不手写 `gen/`、`docs/index.html`、`src/api/gen/`、`dist/`、`pnpm-lock.yaml`。
- **契约先于调用方**：RPC 变更先改 `proto/`，再生成后端代码和文档，最后生成前端客户端并调整调用方。
- **验证贴近影响面**：先运行能证明本次改动的最小检查；共享行为变更再扩大到 `vp check`、`vp test` 或 `vp run ready`。

## 仓库元信息

- **包管理器**: pnpm（版本见 `package.json` 的 `packageManager`）
- **Node 版本**: 见 `.node-version`，最低要求见 `package.json` 的 `engines`
- **工具链**: Vite+ (`vp`)

## vp 能做什么

vp 涵盖了本仓库的全部操作，包括：

- **依赖管理**：安装、添加、删除、更新、查看、去重、重建原生模块、依赖分析
- **Node 版本管理**：安装、切换、固定、诊断、远程版本查询、按版本执行命令
- **命令执行**：运行 package.json 脚本、workspace 过滤（按名称/glob）、递归/传递性执行、并发控制
- **代码质量**：格式化（Oxfmt）、Lint（Oxlint，启用 typeAware + typeCheck）、一站式检查及自动修复
- **构建与打包**：Vite 应用构建（Rolldown）、库打包（tsdown）
- **临时工具**：运行本地/远程二进制而不添加依赖
- **Git hooks**：安装 pre-commit hook，提交前自动检查
- **升级维护**：升级 vp 自身、清除任务缓存、环境诊断

具体命令参见 **vite-plus** skill。

## 配置文件

| 文件 | 用途 |
|------|------|
| `package.json` | 根项目元信息、脚本、engines、packageManager |
| `pnpm-workspace.yaml` | workspace 布局、catalog 共享版本、overrides |
| `vite.config.ts` | Vite+ 统一配置（lint, fmt, run, staged） |
| `tsconfig.json` | 共享 TypeScript 配置 |
| `.node-version` | Node 版本固定 |
| `pnpm-lock.yaml` | 锁定依赖版本（自动生成，勿手动编辑） |

## 仓库地图

- `apps/wiki`：Docusaurus 知识库和 Markdown 内容。
- `apps/react-template`：React 19 SPA 模板，使用 TanStack Router/Query、Ant Design、Tailwind CSS、Zustand、ConnectRPC。
- `apps/go-template`：Go ConnectRPC 后端；`proto/` 是 API 契约，`internal/` 写业务逻辑，`gen/` 和 `docs/` 是生成物。
- `packages/connectrpc-gen`：从后端 proto 项目生成前端 ConnectRPC 客户端的 CLI。
- `packages/utils`：通过 Vite+ 构建和测试的 TypeScript 工具包。
- `scripts/`：仓库维护脚本，保持小而确定。

## 命名规范

- **所有子包的 `package.json` 中 `name` 字段必须为 `@kxh-awesome/xxx` 格式**，其中 `xxx` 为项目名称，一般与项目文件夹名称相同
  - 示例：`apps/react-template` → `"name": "@kxh-awesome/react-template"`
  - 示例：`packages/utils` → `"name": "@kxh-awesome/utils"`

## 核心原则

- **一切用 vp**，不要直接调用 pnpm / npm / yarn
- **添加依赖时优先使用 `catalog:` 引用 `pnpm-workspace.yaml` 中的共享版本**，例如 `"react": "catalog:"`。若用户未明确要求，**禁止新增 catalog 条目**，但可提醒用户可将依赖加入共享版本
- **修改 catalog 后执行 `vp install`** 使变更生效
- **提交前通过 `vp check --fix [path]`**（只检查 git change 中的代码，禁止检查其他代码），或依赖 pre-commit hook
- **遵守 `.node-version` 和 `engines` 的 Node 版本约束**
- **`vp build` 始终执行内置 Vite 构建**，执行 package.json 脚本用 `vp run build`

## 常用流程

- React 模板：在 `apps/react-template` 中使用 `vp dev`、`vp run build`、`vp run gen:api go-template`。
- Wiki：在 `apps/wiki` 中通过 `vp run <script>` 执行 Docusaurus 脚本。
- Go 后端：修改 `apps/go-template/proto/**` 后运行 `apps/go-template/generate.sh`，再补齐 `internal/` 实现。
- 前端 RPC 客户端：后端 proto 变化后，在 `apps/react-template` 运行 `vp run gen:api go-template`。
- TypeScript 包：通过 package 脚本或 workspace 过滤使用 `vp pack`、`vp test`、`vp check`。
