---
status: in_progress
---

# DSH 嵌套 skill 发现插件

## 问题

DSH 内建 provider 只发现 `.agents/skills/<skill>/SKILL.md` 的一层形态；LoopX 等技能把主流程 skill 嵌套在 `references/skills/` 下（如 `.agents/skills/loop-x/references/skills/*/SKILL.md`），DSH 目录完全不可见。用户需要 DSH 在 `.agents` 目录内任意深度发现嵌套 skill，并以独立插件交付、安装到本机 profile。

## 方案

工作区独立插件包 `@kxh4892636/dsh-nested-skill`（`packages/dsh-nested-skill`），以 DSH bundle 插件形态注册第二个 skill provider `nested-agents`：

- **扫描根**：项目 `<gitRoot>/.agents`（按 lookup cwd 上溯 `.git` 定位，与内建一致）与用户 `$DSH_AGENTS_HOME`（缺省 `~/.agents`）；不扫 `.dsh/skills`、bundled 与其它根。
- **发现规则**：根内任意深度 `**/SKILL.md`；排除内建一层形态（`skills/<skill>/SKILL.md` 与根下平铺 `.md`），排除隐藏目录及默认目录清单（`node_modules`、`.git`、`dist`、`build`、`coverage`、`out`、`.turbo`，可配置）。
- **解析**：与内建一致的 YAML frontmatter 规则——必含 `name` 与 `description`，支持 `whenToUse`、`invocation`（`disable-model-invocation`/`user-invocable`）与 `metadata`；`name` 必须匹配 kebab-case 语法。
- **注册**：注册名取 frontmatter `name` 原样；`source` 按根 origin 映射 `project-agents`/`user-agents`；`rank=250`（内建一层形态 200 在同名师冲突时声明优先，嵌套压过 custom 300 与用户级）；`resourceBase` 为嵌套 skill 自身目录；`path` 为 SKILL.md 路径。
- **读取**：`ctx.fs` 存在时经文件系统服务读取，否则 node fs（镜像内建行为）。
- **失效**：订阅 `fs/observed`（写/编辑命中 `.agents` 树即失效）；chokidar 递归 watch 各根（`watch` 默认开、`watchUsePolling` 可配）覆盖外部变更；候选按路径排序保证同 provider 同名冲突确定性。
- **交付形态**：`package.json` 声明 `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`，patch 以 insert 一行挂载插件；经 `dsh plugin --profile web add file:<工作区包路径>` 安装。

## 已排除的备选

- **约定子目录（references/skills）递归**：只覆盖单一容器名，未来新布局需再次改插件；被拒绝。
- **父级前缀命名空间（loop-x-to-story）**：改变稳定标识与用户感知名，与 frontmatter 文档不一致；被拒绝。
- **修改 DSH 上游 skill-filesystem**：受上游发布节奏约束，无法立即作用于本机已安装 profile；被拒绝。
- **配置 customSkillDirs 指向固定目录**：只覆盖手工维护的目录列表，非任意深度；被拒绝。

## 实施决策

- **包布局**：`src/main.ts` 为入口，`vp pack` 产出 `dist/main.mjs` 与 `dist/main.d.mts`（沿用 `packages/herdr-limit-resume` 约定）；测试用 vitest（`vp test src`）。
- **依赖**：运行时依赖 `yaml`、`chokidar`；peer 依赖 `@deepseek-ai/cordis`、`@deepseek-ai/dsh-skill`、`@deepseek-ai/dsh-fs`、`@deepseek-ai/schemastery`（经 profile 的 bundled-installation fallback 解析）。
- **provider 契约**：实现 `SkillProvider { name: 'nested-agents'; list(options); get(candidate, options) }`，在 `apply(ctx, config)` 内经 `ctx.skills.registerProvider()` 注册，注册生命周期走 `ctx.effect`。
- **配置 schema**（schemastery，全部可选）：`watch: boolean = true`、`watchUsePolling: boolean = false`、`includeUserRoots: boolean = true`、`excludedDirs: string[] = 默认清单`、`extraRoots: string[] = []`。
- **常量**：`NESTED_SKILL_RANK = 250`、`provider 名 = 'nested-agents'`。
- **cordis.patch.yml**：

  ```yaml
  - insert:
      - id: nested-skill
        name: "@kxh4892636/dsh-nested-skill"
  ```

## 工作环境

- DSH 安装：`C:\Users\kxh\AppData\Local\nvm\v24.19.0\node_modules\@deepseek-ai\dsh`（0.1.2-alpha.2）；`dsh` CLI 在 PATH（`C:\nvm4w\nodejs\dsh.ps1`）。
- DSH 参考仓库：`C:\Users\kxh\kxh-awesome\projects\deepseek-harness`（`docs/architecture.md`、`apps/cli/reference/README.zh.md`、`packages/skill/skill/src/index.ts`、`packages/skill/skill-filesystem/src/index.ts`、`packages/bundle/base/package.json`）。
- web profile：`C:\Users\kxh\.dsh\profiles\web`（`patchReload: live`；`package.json` bundles `dsh-base` + `dsh-web-app`；`cordis.patch.yml` 为用户层）。
- 工作区：kxh-kit pnpm workspace（`packages/*`，pnpm 11.22.0，node 24）。
- 安装命令：`dsh plugin --profile web add file:<工作区包路径>`（pnpm 在 PATH，已满足）。
- 验证目标 GUI：`http://127.0.0.1:3080`。
- **执行方式**（基线卡确认后变更）：全部 issue 自动推进；实现以 git worktree 进行（自 `main` 分支 `worktree/dsh-nested-skill-<时间戳>`，位于仓库外路径），规划产物先在 `main` 提交，实现完成后以 `--no-ff` 合入 `main` 并清理 worktree；commit 含于本次交付。

## 范围

- 插件包实现、单元测试、README；安装到本机 web profile；验证嵌套 skill 进入目录。
- `dsh` 域文档与 ADR（已在 `/quest-with-domain` 完成）。

## 非范围

- 修改或 fork DSH 上游仓库。
- 发现 `.dsh/skills`、bundled skill 或非 `.agents` 根。
- 改变内建 provider 行为、loop-x 本体或现有顶层 skill。
- 命名空间化注册名（已排除）。
- npm 发布。

## 待定

无；全部决策已收敛（见 quest 审阅文件）。

## 上下文

- `.flow/quest/2026-08-31-dsh嵌套skill发现插件.md`
- [ADR](../../adr/0001-嵌套skill任意深度发现.md)
- [CONTEXT](../../CONTEXT.md)
- [CONTEXT-MAP](../../../CONTEXT-MAP.md)

## Issue

| #   | Issue                                                      | 状态        | 阻塞于 | 下一步         |
| --- | ---------------------------------------------------------- | ----------- | ------ | -------------- |
| 01  | [插件包实现与测试](01-插件包实现与测试.md)                 | in_progress | —      | /code-delivery |
| 02  | [安装到 web profile 并验证](02-安装到web-profile并验证.md) | pending     | 01     | /code-delivery |
