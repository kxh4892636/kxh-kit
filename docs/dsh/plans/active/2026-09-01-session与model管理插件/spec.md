---
status: pending
---

# Session 与 Model 管理插件

## 问题

DSH Web 的会话内 agent 无法读取、搜索、派生、投递其他 session，也无法列出与设置模型——这些能力只存在于 Host 内部服务与 GUI。用户需要以「模型工具」面提供对 session 与 model 的 CRUD：读取其他 session 内容、创建新 session（携带默认系统消息=预置指令）并选择指定模型、列出全部 session 与模型、向其他 session 发送消息。

## 方案

工作区独立插件包 `@kxh4892636/dsh-session-manager`（`packages/dsh-session-manager`），以 DSH bundle 插件形态交付（`dsh.bundle.patch` + `cordis.patch.yml`），进程内直调 Host 服务：

- **自有工具（9 个）**：`session_list` / `session_read` / `session_spawn` / `session_prompt` / `session_model_list` / `session_model_select` / `session_rename` / `session_archive` / `session_wait`，均经 `ctx.tools.register(defineTool(...))` 注册，执行体直调 `ctx.sessionController`（Host 服务）与 `ctx.workspaceRegistry`。
- **内容搜索（挂载上游）**：依赖并挂载 `@deepseek-ai/dsh-tool-session-query@0.1.2-alpha.2`（5 个只读工具），并在同一 patch 中把 `session-query-sqlite` 行覆盖为 `openAt: first-search` + 持久化 path（启用部署级内容搜索索引；ADR-0003）。
- **工作区归属**：`session_list` 结果经 `workspace.json`（workspace registry）附加 workspace 归属；归档状态取自 `archivedSessionIds`（`includeArchived` 可恢复显示）。
- **安装形态**：经 `dsh plugin --profile web add file:<工作区包路径>` 安装，与 `dsh-nested-skill` 同构；上游工具包作为 npm 依赖装入 profile（聚合安装未随附）。

## 已排除的备选

- **CLI 子命令 / HTTP 路由面**：launcher 无插件级子命令 seam、无官方非浏览器 client 路径、`/api` 三重鉴权；仅模型工具面（ADR-0002）。
- **自研扫描式搜索**：重复实现且成本随会话量线性上升；上游 opt-in 工具已实现工作区授权与限流（ADR-0003）。
- **硬删除 session**：日志 append-only、`session-persistence-jsonl` 无 delete API；归档即删除（story 非范围）。
- **seed 首条用户消息 / agentPreset / preset_list 工具**：预置指令 = 新 session 默认携带的系统消息，创建即生效，无注入参数（quest Q2 最终裁决）。
- **`session_fork` / `session_cancel` / `session_children` / `session_status` / `session_unarchive`**：低频、属 subagent 路由或上游缺口；非范围。
- **image 消息内容**：文本足够；非范围。

## 实施决策

- **包布局**：`src/main.ts` 入口（`apply(ctx)` 注册工具），`vp pack` 产出 `dist/main.mjs` + `dist/main.d.mts`；vitest 单测（fake `ctx` 驱动）；沿用 `dsh-nested-skill`/`herdr-limit-resume` 约定（`vp check`、`vp test src`、覆盖阈值 80%）。
- **依赖**：
  - dependencies：`@deepseek-ai/dsh-tool-session-query`（exact `0.1.2-alpha.2`，与 DSH 安装同版本，npm 已核实存在）。
  - peerDependencies：`@deepseek-ai/cordis`、`@deepseek-ai/dsh-tools`、`@deepseek-ai/dsh-api-session-controller`、`@deepseek-ai/dsh-api-workspace-controller`、`@deepseek-ai/dsh-session`、`@deepseek-ai/dsh-llm`、`@deepseek-ai/schemastery`（经 profile 聚合安装/fallback 解析）。
- **插件声明**：`export const name = 'session-manager'`；`inject = ['tools', 'sessionController', 'workspaceRegistry', 'systemPrompt']`；`ctx.tools.register(defineTool({...}))` 逐一注册 9 个工具，`systemPrompt.section` 提供精简指引章节（工具集非空、指引不随会话变）。
- **工具契约（defineTool 参数/输出，均为扁平 snake_case schema）**：
  - `session_list`: 参数 `{ includeArchived?: boolean, workspaceId?: string, parentSessionId?: string }`；输出 JSON 文本：排序后的摘要数组（sessionId、title、updatedAt、running、blank、cwd、workspaceId/title、origin/parentSessionId、modelSelection(如投影可得)）。
  - `session_read`: 参数 `{ sessionId, parentSessionId?: string, beforeSeq?: number, maxMessages?: number }`；普通会话寻址 `session`，子会话寻址 `subagent`（`mode` 由 subagent 投影 `identity.mode` 自动解析，解析失败返回明确错误）；实现：优先 `follow` opening snapshot 取当前 cut 与 records 文本化，`hasMore` 后用 `page(beforeSeq)` 继续向前翻页；输出为消息文本（user/assistant，含角色与时间）。
  - `session_spawn`: 参数 `{ workspaceId?, cwd?, sessionId?, provider?, model?, reasoningEffort? }`；顺序执行 `create` → （若给了模型）`selectModel`；预置指令（默认系统消息）由部署默认预置装配，不传任何注入参数；返回 `{ sessionId, accepted }`。
  - `session_prompt`: 参数 `{ sessionId, text, mode?: 'queue'|'steer' }`；`requestId` 由插件 mint（UUID），`content` 为单文本块；返回 `{ accepted }`。
  - `session_model_list`: 无参数；输出 `modelCatalog()` 压缩视图（各组 id/name/模型 id/名称/描述/reasoning efforts/defaultEffort、default、routableProviders、failures）。
  - `session_model_select`: 参数 `{ sessionId, provider, model, reasoningEffort? }`；返回 Host 归一化 selection。
  - `session_rename`: 参数 `{ sessionId, title }`；返回归一化标题与 seq。
  - `session_archive`: 参数 `{ sessionId }`；调用 Host `archiveSession`；返回 accepted。
  - `session_wait`: 参数 `{ sessionId, timeoutMs?（默认 300000）, pollIntervalMs?（默认 5000） }`；轮询 `list()` 的 running 状态直至 false/超时；返回最终摘要。
- **错误映射**：`RemoteError`（`session/*`、`workspace/*`、`subagent/*` 码）→ 用户可读消息（保留 code 与 details JSON）；非预期异常 → 固定 `SESSION_MANAGER_TOOL_FAILED` 文本（日志保留完整链）。
- **`presentCall`**：每个工具提供调用摘要呈现（参照 tool-cordis present 约定）。
- **cordis.patch.yml**（插件 patch 层，装配顺序在 base/web-app 之后）：

  ```yaml
  - id: session-query-sqlite
    config:
      path: !!js dshHomePath('storages/session-query.sqlite')
      openAt: first-search
  - insert:
      - id: session-query-tool
        name: '@deepseek-ai/dsh-tool-session-query'
  - insert:
      - id: session-manager
        name: '@kxh4892636/dsh-session-manager'
  ```

  loader 的 id-targeted `config` 覆盖为整块替换语义（以 config-reload.spec 行为为准），故 `path`+`openAt` 同时给出；其余 schema 字段用默认值。
- **测试**：每工具参数校验/正常路径/错误映射；patch YAML 结构断言（含索引覆盖行、上游工具行、插件行）；列表归档过滤与 workspace 归属（fake registry fixture）；子会话寻址失败路径。真实 Host 行为由 Issue 03 冒烟覆盖。

## 工作环境

- DSH 安装：`C:\Users\kxh\AppData\Local\nvm\v24.19.0\node_modules\@deepseek-ai\dsh`（0.1.2-alpha.2，聚合包；`dsh` CLI 在 PATH）。
- DSH 参考仓库：`C:\Users\kxh\kxh-awesome\projects\deepseek-harness`（session-controller/workspace-controller/tool-session-query 源码与行号来源）。
- web profile：`C:\Users\kxh\.dsh\profiles\web`（`patchReload: live`；bundles `dsh-base`+`dsh-web-app`+`dsh-nested-skill`）；验证 GUI `http://127.0.0.1:3080`；运行中 Host 进程 `node ...\dsh\lib\bin.js web`（PID 32992，重启验证时需重启该进程）。
- 工作区：kxh-kit pnpm workspace（pnpm 11.22.0，node 24；`vp pack`/`vp check`/vitest）。
- 安装命令：`dsh plugin --profile web add file:<工作区包路径>`。
- 执行方式（基线卡确认后变更）：全部 issue 自动推进；实现以 git worktree 进行（自 `main`，`worktree/dsh-session-manager-<时间戳>`），规划产物先在 `main` 提交，实现完成后以 `--no-ff` 合入 `main` 并清理 worktree。

## 范围

- `packages/dsh-session-manager` 包实现、单元测试、README，构建产物。
- 上游 `dsh-tool-session-query` 挂载与 `session-query-sqlite` 索引启用（patch + 依赖）。
- 安装到本机 web profile；重启后工具可见性 + 端到端冒烟（一次性测试 session，完成后归档）。
- `docs/dsh` 域文档与 ADR-0002/0003（已在 `/quest-with-domain` 完成）。

## 非范围

- CLI/HTTP 交付面（ADR-0002）；硬删除；`fork/cancel/children/status/unarchive`；image 消息；GUI 或上游 DSH 改动；npm 发布。

## 待定

无；全部决策已收敛（story 与 quest 审阅文件）。

## 上下文

- [story](story.md)
- [quest 审阅](../../../../.flow/quest/2026-09-01-session与model管理插件.md)
- [ADR-0002](../../adr/0002-会话管理能力以模型工具面交付.md)
- [ADR-0003](../../adr/0003-内容搜索经上游opt-in工具与索引启用交付.md)
- [CONTEXT](../../CONTEXT.md)
- [CONTEXT-MAP](../../../CONTEXT-MAP.md)
- 前例插件：`../../../packages/dsh-nested-skill`（同构交付；参考 spec `plans/reference/2026-08-31-dsh嵌套skill发现插件/spec.md`）

## Issue

| #   | Issue                                          | 状态    | 阻塞于 | 下一步         |
| --- | ---------------------------------------------- | ------- | ------ | -------------- |
| 01  | [会话管理工具实现与单元测试](01-会话管理工具实现与单元测试.md) | pending | —      | /code-delivery |
| 02  | [挂载上游内容搜索并启用索引](02-挂载上游内容搜索并启用索引.md) | pending | 01     | /code-delivery |
| 03  | [安装到 web profile 并端到端冒烟](03-安装到web-profile并端到端冒烟.md) | pending | 01, 02 | /code-delivery |
