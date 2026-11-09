---
name: 'session与model管理插件'
description: '为会话内 agent 补齐 session 与 model 的工具面：读取、搜索、派生其他会话，创建带预置指令的会话，列模型并投递消息。'
status: completed
---

# session与model管理插件

> 迁移自旧 notes.json / story.md / spec.md；正文保留历史记录，旧工具、状态名与路径不再适用。

## 旧 story

## 原始想法

> 创建一个 dsh 插件, 支持读取其他session的内容, 支持在一个 session 里面创建其他的 session 发送预置指令并选择指定模型, 支持获得现在所有的 session list, model list, 支持向其他 session 里面发送消息.
> 总而言之就是支持对 session 和 model 的 crud

## 角色

- **会话内 agent**：在 DSH Web 的某个 session 中工作的编码代理，需要并行/读取/编排其他 session，且只能通过模型可调用工具完成。
- **用户**：使用 DSH Web GUI、管理多个 session 与模型选择的开发者；通过会话内 agent 间接操作，也可在 GUI 中直接观察到插件行为。

## 故事

### US-001 会话列表

作为会话内 agent，我想要列出当前 Host 上所有 workspace 的全部 session 摘要，以便找到要读取或编排的目标。

- [ ] `session_list` 返回与 Host `sessionController.list()` 一致的 session 摘要（sessionId、updatedAt、running、blank、cwd、subagent 归属 origin/parentSessionId），并附 workspace 归属信息（workspaceId/title）。
- [ ] 默认显示全部 workspace；默认隐藏已归档 session（提供 `includeArchived` 参数恢复显示）。
- [ ] 列表按 updatedAt 降序；subagent 子会话可见但可被 `parentSessionId` 过滤。

### US-002 读取会话内容

作为会话内 agent，我想要分页读取任意 session 的消息文本历史，以便了解其他 session 说了什么。

- [ ] `session_read` 按消息对齐返回文本历史（user/assistant 消息），含游标（beforeSeq/throughSeq）与 `hasMore`。
- [ ] 普通 session 用 `sessionId` 寻址；subagent 子会话可用 `parentSessionId + mode` 寻址读取（与 Host `page` 的 `SessionAddress` 语义一致）。
- [ ] 不激活目标 Agent（冷读，与 Host `page` 相同语义）。

### US-003 创建新会话并选择模型（预置指令默认携带）

作为会话内 agent，我想要一次创建新 session 并为其选择指定模型，以便派生一个执行特定任务的并行会话。

- [ ] `session_spawn` 复合工具 = `create`（可选 workspaceId/cwd/sessionId）+ `selectModel`（provider/model/reasoningEffort，省略时用部署默认）。
- [ ] 返回新 sessionId；新 session 出现在 `session_list` 中。
- [ ] 新 session 与 GUI「新会话」一致：**预置指令即其默认携带的系统消息/上下文，创建即生效，不提供注入或选择参数**（无 agentPreset、无 seed、无 preset_list 工具）。
- [ ] 向新 session 投递指令一律走 `session_prompt`。

### US-004 向其他 session 发送消息

作为会话内 agent，我想要向指定 session 发送消息，以便把后续指令或反馈投递给它。

- [ ] `session_prompt` 参数含 `mode`（默认 `queue`；`steer` 用于运行中 turn）。
- [ ] 返回 `accepted`；消息出现在目标 session 历史中（queue 模式在当前 turn 结束后处理，steer 模式直接注入运行中 turn）。

### US-005 模型列表

作为会话内 agent，我想要获得当前 Host 可路由的全部模型目录，以便为新 session 选择模型。

- [ ] `session_model_list` 与 Host `modelCatalog()` 语义一致：provider 分组、模型（含 reasoning efforts）、部署默认、routableProviders 与隔离的 provider 失败。

### US-006 为会话选择模型

作为会话内 agent，我想要为指定 session 设置模型，以便该 session 后续请求使用所选模型。

- [ ] `session_model_select` 接受 provider/model/reasoningEffort，经 Host 解析校验；成功后再发送的消息使用该选择。

### US-007 重命名会话

作为会话内 agent，我想要重命名指定 session，以保持会话列表可读。

- [ ] `session_rename` 接受 sessionId + title；返回 Host 归一化后的标题与其持久化 seq。

### US-008 归档会话（删除）

作为会话内 agent，我想要归档（隐藏）指定 session，以清理列表。

- [ ] `session_archive` 调用 Host `archiveSession`；归档后默认列表中不再出现，`includeArchived` 可见。
- [ ] 不提供硬删除（日志 append-only、非范围）。

### US-009 会话内容搜索（上游工具）

作为会话内 agent，我想要搜索既往 session 的内容，以便定位相关历史工作。

- [ ] 挂载上游 `@deepseek-ai/dsh-tool-session-query`（npm `0.1.2-alpha.2`，与安装版本一致），模型获得其五个只读工具：`session_search`、`session_event_search`、`session_trace`、`session_event_trace`、`session_event_read`。
- [ ] 同一插件 patch 将 `session-query-sqlite` 配置改为 `openAt: first-search` + 持久化 path（启用部署级内容搜索索引；GUI 内容搜索框随之可用——部署 opt-in 行为变更，经用户确认）。
- [ ] `session_search` 能命中真实会话内容（冒烟验证）。

## 非范围（已确认）

- CLI 子命令与 HTTP API 面（第 1 轮 Q1 = 仅模型工具；外部进程无法作为 client，launcher 也无插件级子命令 seam）。
- 硬删除 session（归档即可；全仓无删除/日志清理路径，日志 append-only）。
- `session_fork` / `session_cancel` / `session_children`（Host 已有对应能力或属 subagent 路由，本期不做；`dsh-tool-subagent-control` 等上游面留待后续）。
- GUI/上游 DSH 改动（挂载上游工具包与启用索引除外——经用户确认）。

## 迷雾

（所有轮次决策已确认并并入故事；无遗留空白。）

## 上下文

- DSH 安装：`C:\Users\kxh\AppData\Local\nvm\v24.19.0\node_modules\@deepseek-ai\dsh`（0.1.2-alpha.2）。
- DSH 参考仓库：`C:\Users\kxh\kxh-awesome\projects\deepseek-harness`。
- Host 侧 Session 能力（`packages/api/session-controller`，`ctx.sessionController`，Remote namespace `session`）：
  - `list(request, signal)` → `SessionListValue`（`items: SessionSummary[]`）
  - `search(query, signal)` → 内容检索
  - `create(request)` → `SessionCreateRequest` = `{ workspaceId?, cwd?, sessionId?, agentPreset? }`
  - `selectModel(request)` → `{ sessionId, provider, model, reasoningEffort? }`
  - `modelCatalog()` → provider 分组模型目录 + 部署默认 + 隔离的 provider 失败
  - `rename(request)` → `{ sessionId, title }`
  - `fork(request)` → `{ sessionId, atSeq? }`（冷读前缀 fork 为新 session）
  - `prompt(request, signal)` → `{ requestId, sessionId, mode: 'queue'|'steer', content: PromptContentPart[] }`
  - `cancel(request)`、`updateQueue(request)`
  - `page(request, signal)` → 冷安全、按消息对齐的分页历史
  - `follow(request, signal)`（stream）→ opening snapshot + 无缺口事件帧
  - `control(signal)`（stream）→ 活动队列/关闭态基线 + 替换帧
  - `inspect(sessionId)` → 附加态 header+events 或持久化 header+事件前缀（不激活 Agent）
- Workspace 能力（`packages/api/workspace-controller`）：`archiveSession`（从 workspace 分组隐藏会话）；`create/rename/delete`（workspace 本身）。
- 工具注册：`packages/extensions/tool-cordis` —— `defineTool({ name, description, parameters, output, execute, presentCall })` + `ctx.tools.register(...)`（模型可调用工具）。
- **上游已存在的同类工具**：`@deepseek-ai/dsh-tool-session-query` 提供 `session_search / session_event_search / session_trace / session_event_trace / session_event_read` 五个只读工具，但**默认不挂载**（`2026-08-02-session-search-not-shipped-default` 决策）——本期由本插件 patch 挂载它（用户已确认，见 US-009）；npm 存在 `0.1.2-alpha.2`（与安装版本一致），安装节点聚合包中**未随附**该包，需经 `dsh plugin add` 将其作为依赖装入 profile。前提：`session-query-sqlite` 全文索引当前 `openAt: never`（内容搜索 opt-in），插件 patch 需将其改为 `openAt: first-search` + 持久化 path。
- **无 CLI 子命令扩展点**：`dsh` launcher 模式硬编码（profile/web/plugin/dump-config）；插件只能经 `webServer.register/registerUpgrade` 扩展 HTTP 路由（webhook-github 为范例）、`commands.register` 注册 in-session 斜杠命令、`llm.registerAdapter`、`settings.installSection`、`typert`+`@Remote` 暴露 `/api/<ns>/<m>` 端点。
- 进程模型：唯一入口 `dsh`（`lib/bin.js`），无 `dsh serve`；实测运行 `node ...\dsh\lib\bin.js web`（PID 32992，监听 127.0.0.1:3080），CLI 交互与 Web GUI 共用同一 host 进程（session 由该进程内 session-controller 创建，Agent 启动时创建 / Web 端请求时创建）。
- 模型目录来源：`.credentials.yaml` 只提供按请求解析的密钥（`refs.*` 与 `records.*`），`settings.yaml` 只提供连接事实与目录覆盖；provider 注册只发生在 Host 进程内 cordis 插件 `apply()`（`ctx.llm.registerAdapter`），目录 = `listProviders × listModels` 实时投影。本机唯一活跃路由 `deepseek-official`（DEFAULT_MODELS：v4-flash / v4-pro / v4-flash-vision-exp，1M context）；`llm-pi-ai` 适配器休眠（settings 无分节）。
- 归档/删除语义闭合：GUI session 行菜单只有 rename/fork/archive；全仓无 session 删除/日志清理路径（workspace 删除也明确保留全部会话日志；`session-persistence-jsonl` 无 delete API）——归档 = `archivedSessionIds` 注册表可见性操作，不触碰日志；硬删除必须绕过 DSH 持久化层，非范围。
- 客户端/连接：`/api`（一元 JSON-RPC，endpoint 如 `session/list`、`session/prompt`）+ `/api/remote.mux`（WS 流）受 loopback/trustedHosts fence + HMAC 签名 cookie + 进程 launch token 三重保护；仓库无官方非浏览器 client（SDK 走 stdio 且自建 Host）——外部进程只能成为第二个 Host，不能作为 client。
- 会话持久化（权威日志）：`C:\Users\kxh\.dsh\sessions\<workspace-slug>\<session-id>\session.jsonl.zstd`（zstd 帧 JSONL，见 `packages/session/session-persistence-jsonl`）。
- 投影缓存（列表摘要）：`C:\Users\kxh\.dsh\storages\session_projcache\sessions\<id>.json`（`{ version, record: { identity, rows: { title, modelSelection, permissions, sessionStats, ... } } }`）。
- 工作区注册：`C:\Users\kxh\.dsh\storages\workspace.json`（workspace → sessionIds / archivedSessionIds）。
- 用户设置：`C:\Users\kxh\.dsh\settings.yaml`（agent-default-model、subagent-model-selection、agent-presets.default）。
- Agent preset：`C:\Users\kxh\.dsh\.agent-presets\<name>\{preset.yml, agent.cordis.yml}`。
- 前例插件：`packages/dsh-nested-skill`（`dsh.bundle.patch` + `cordis.patch.yml`，`dsh plugin --profile web add file:<path>` 安装；`vp pack` 构建；vitest 测试；peer deps 经 profile fallback 解析）。
- Web profile：`C:\Users\kxh\.dsh\profiles\web`（`patchReload: live`，bundle `dsh-base` + `dsh-web-app`）；验证 GUI `http://127.0.0.1:3080`。
- 采集：2026-09-01，`docs/dsh/CONTEXT.md`、`docs/dsh/adr/0001-嵌套skill任意深度发现.md`、`docs/dsh/plans/reference/2026-08-31-dsh嵌套skill发现插件/spec.md`。


## 旧 spec


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
        name: "@deepseek-ai/dsh-tool-session-query"
  - insert:
      - id: session-manager
        name: "@kxh4892636/dsh-session-manager"
  ```

  loader 的 id-targeted `config` 覆盖为整块替换语义（以 config-reload.spec 行为为准），故 `path`+`openAt` 同时给出；其余 schema 字段用默认值。

- **测试**：每工具参数校验/正常路径/错误映射；patch YAML 结构断言（含索引覆盖行、上游工具行、插件行）；列表归档过滤与 workspace 归属（fake registry fixture）；子会话寻址失败路径。真实 Host 行为由 Issue 03 冒烟覆盖。

## 工作环境

- DSH 安装：`C:\Users\kxh\AppData\Local\nvm\v24.19.0\node_modules\@deepseek-ai\dsh`（0.1.2-alpha.2，聚合包；`dsh` CLI 在 PATH）。
- DSH 参考仓库：`C:\Users\kxh\kxh-awesome\projects\deepseek-harness`（session-controller/workspace-controller/tool-session-query 源码与行号来源）。
- web profile：`C:\Users\kxh\.dsh\profiles\web`（`patchReload: live`；bundles `dsh-base`+`dsh-web-app`+`dsh-nested-skill`）；验证 GUI `http://127.0.0.1:3080`；运行中 Host 进程 `node ...\dsh\lib\bin.js web`（PID 32992，重启验证时需重启该进程）。
- 工作区：kxh-kit pnpm workspace（pnpm 11.22.0，node 24；`vp pack`/`vp check`/vitest）。
- 安装命令：`dsh plugin --profile web add file:<工作区包路径>`。
- 执行方式（基线卡确认后变更）：全部 issue 自动推进（无逐项确认）；实现以 git worktree 进行（自 `main` 分支 `worktree/dsh-session-manager-<时间戳>`，位于仓库外路径）；**执行 Issue 03 前停止任务，等待用户手动重启 web 进程**，重启确认后再继续其验证与冒烟；实现完成后以 `--no-ff` 合入 `main`，并 commit & push 到 origin。

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

- story
- quest 审阅
- ADR-0002
- ADR-0003
- [CONTEXT](../../../CONTEXT.md)
- [CONTEXT-MAP](../../../../CONTEXT-MAP.md)
- 前例插件：`../../../packages/dsh-nested-skill`（同构交付；参考 spec `plans/reference/2026-08-31-dsh嵌套skill发现插件/spec.md`）

## Issue

| #   | Issue                                                                  | 状态      | 阻塞于 | 下一步         |
| --- | ---------------------------------------------------------------------- | --------- | ------ | -------------- |
| 01  | note 01「会话管理工具实现与单元测试」         | completed | —      | /code-delivery |
| 02  | note 02「挂载上游内容搜索并启用索引」         | completed | 01     | /code-delivery |
| 03  | note 03「安装到web-profile并端到端冒烟」 | completed | 01, 02 | /code-delivery |

## 追踪 Note

<!-- 由 nano_flow_check 生成，请勿手改 -->

| Name | Description | Status | Reason | Next Step | Related Note |
| --- | --- | --- | --- | --- | --- |
