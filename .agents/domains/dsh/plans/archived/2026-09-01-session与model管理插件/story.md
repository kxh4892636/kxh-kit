# Session 与 Model 管理插件

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
