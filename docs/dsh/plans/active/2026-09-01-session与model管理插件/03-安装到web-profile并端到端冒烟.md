---
status: completed
blocked_by: ["01", "02"]
---

# 安装到 web profile 并端到端冒烟

## 交付

`@kxh4892636/dsh-session-manager` 安装到本机 web profile 并经重启生效：会话中可见全部工具（自有 9 个 + 上游 5 个），完成一次端到端真实冒烟（创建→选模型→发消息→读取→搜索→归档），清理测试会话。

## 范围

- `dsh plugin --profile web add file:<工作区包路径>` 安装（含上游依赖解析装入 profile）。
- 重启运行中 Host 进程（`node ...\dsh\lib\bin.js web`），确认 bundle 行装配生效；GUI `http://127.0.0.1:3080` 可访问。
- 工具可见性验证：在会话中（GUI 或当前会话注入）确认 9 个 `session_*` 工具与 5 个上游搜索工具出现在工具目录。
- 端到端冒烟（消耗一次模型请求）：`session_list` → `session_spawn`（默认模型）→ `session_model_select`（或 spawn 时指定）→ `session_prompt` 发指令 → `session_wait` / `session_read` 读到内容 → `session_search`（上游）命中该内容 → `session_rename` → `session_archive` 清理。
- 不包含：任何 GUI/上游改动；npm 发布；CLI/HTTP 面。

## 直接依赖

- 01：消费其插件包实现与本 issue 冒烟的工具面。
- 02：消费其依赖声明与 patch（上游搜索工具与索引启用，冒烟需 `session_search` 真实命中）。

## 验收

- [ ] `dsh plugin --profile web add file:<路径>` 成功，profile `package.json` bundles 含 `@kxh4892636/dsh-session-manager`
- [ ] 重启 web 进程后 GUI 可访问；会话工具目录含 9 个 `session_*` 工具与 5 个上游搜索工具
- [ ] 冒烟脚本步骤全部通过（spawn/select/prompt/wait/read/search/rename/archive），`session_search` 命中 seed 指令文本
- [ ] 冒烟创建的测试 session 已归档；`session_list` 默认视图不再出现（`includeArchived` 可见）
- [ ] 运行中 Host 日志无 `SESSION_MANAGER_TOOL_FAILED` / 未预期堆栈

## 上下文

- [spec](../../spec.md)
- [ADR-0002](../../adr/0002-会话管理能力以模型工具面交付.md)
- [ADR-0003](../../adr/0003-内容搜索经上游opt-in工具与索引启用交付.md)
- 前例安装验证：`../../reference/2026-08-31-dsh嵌套skill发现插件/02-安装到web-profile并验证.md`
- profile：`C:\Users\kxh\.dsh\profiles\web`；GUI：`http://127.0.0.1:3080`

## 下一步

/code-delivery

## 交付记录

- **交付物**：插件安装到 web profile(profile `package.json` bundles 含 `@kxh4892636/dsh-session-manager`);端到端冒烟全部通过;实践修复提交 worktree `9830ee8`(chunk 文本展开)、`ebe1d47`(双 wire 形状)。
- **验证证据**:
  - `dsh plugin --profile web add file:<worktree 包路径>` 成功;`node_modules` 含插件与 `@deepseek-ai/dsh-tool-session-query@0.1.2-alpha.2`。
  - 工具可见性:9 个 `session_*` 工具 + 上游搜索工具(session_search/session_trace/session_event_search/session_event_trace/session_event_read)均进入会话工具目录。
  - 端到端冒烟(会话 `session-smoke-20260901-1`,真实模型请求一次):`session_spawn`(显式 sessionId)→ `session_model_select`(deepseek-official/v4-flash-vision-exp,归一化 high)→ `session_prompt`(queue)→ `session_wait`(running→false,标题自动生成)→ `session_read`(**assistant 回复 `SMOKE-OK` 正确展开**)→ `session_search`(**命中** seed 文本,snippet 正确)→ `session_rename`(标题→`插件冒烟-已完成`,seq 57)→ `session_archive`(归档后默认列表不可见)。
  - 冒烟暴露并修复:`session_read` 对 `chunkrow/*` 打包行(文本存于 `texts`)只输出摘要——修复为展开 assistant 文本,并兼容 `{type:'chunks'}` 与 `{type:'event'}` 两种 wire 形状(单元测试覆盖,40 项全绿)。
  - **经验**:`dsh plugin add` 对 `file:` 依赖是快照复制——插件代码变更后须同步 `dist/` 到 profile 快照(或重装)并重启。
  - 变异测试:未配置 mutation,记为 `skipped: not configured`,不阻断。
