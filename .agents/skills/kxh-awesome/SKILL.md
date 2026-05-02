---
name: kxh-awesome
description: kxh-awesome 仓库操作规范。在本仓库中做任何操作（依赖管理、Node.js 版本管理、开发构建测试、格式化检查、workspace 子包操作、git hook 管理）都必须触发该 skill。本仓库是 pnpm workspaces + Vite+ monorepo，一切通过 vp 管理。关键词：pnpm、node、依赖、workspace、monorepo、vp、vite-plus、kxh、install、build、dev、test、lint、fmt、check、git hook、pre-commit、commit-msg
---

# kxh-awesome

本仓库是 pnpm workspaces + Vite+ 的 monorepo，一切操作通过 `vp` 管理。

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

## 命名规范

- **所有子包的 `package.json` 中 `name` 字段必须为 `@kxh-awesome/xxx` 格式**，其中 `xxx` 为项目名称，一般与项目文件夹名称相同
  - 示例：`apps/react-template` → `"name": "@kxh-awesome/react-template"`
  - 示例：`packages/utils` → `"name": "@kxh-awesome/utils"`

## 核心原则

- **一切用 vp**，不要直接调用 pnpm / npm / yarn
- **添加依赖时优先使用 `catalog:` 引用 `pnpm-workspace.yaml` 中的共享版本**，例如 `"react": "catalog:"`。若用户未明确要求，**禁止新增 catalog 条目**，但可提醒用户可将依赖加入共享版本
- **修改 catalog 后执行 `vp install`** 使变更生效
- **提交前通过 `vp check`**（只检查 git change 中的代码，禁止检查其他代码），或依赖 pre-commit hook
- **遵守 `.node-version` 和 `engines` 的 Node 版本约束**
- **`vp build` 始终执行内置 Vite 构建**，执行 package.json 脚本用 `vp run build`
