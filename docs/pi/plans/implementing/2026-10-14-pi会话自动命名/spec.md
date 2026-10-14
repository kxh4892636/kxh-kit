---
status: completed
---

# pi 会话自动命名

## 问题

pi 会话有显示名（`pi.setSessionName()`，等价内置 `/name`），但默认不自动设置：会话列表回落到首句原文，长且难扫读。用户要在 kxh-kit 交付一个 pi 插件，按每个会话的第一句用户输入自动命名，名称简短且 ≤ 8 个字，且不打断首轮对话。

关联 story 的 US-001、US-002、US-003。

## 方案

工作区包 `@kxh4892636/pi-session-name`（`packages/pi-session-name`），以 pi 扩展形态交付：

- **触发**：`pi.on("input")`。当来源非扩展、会话尚无名称、分支内尚无用户消息时，视作该会话的第一句用户输入。
- **生成**：把首句输入交给模型生成 ≤ 8 字标题；失败时降级为对首句的确定性截断。
- **写入**：`pi.setSessionName(name)`，即内置 `/name` 的同一 API。
- **异步**：命名在 `input` 处理器内以 fire-and-forget 方式发起，处理器立即返回 `{ action: "continue" }`，不阻塞首轮。

## 已排除的备选

- **在 `input` 处理器内同步 `await` 模型**：会串行阻塞首轮提交，违反 US-001；被拒绝。
- **`pi.sendUserMessage("/name x")` 触发内置命令**：会把命令当对话消息发送并触发额外 turn，且内置命令无扩展调用接缝；被拒绝。
- **`message_end` 作为触发点**：拿到的是已进入上下文的消息，且晚于首轮启动；无必要；被拒绝。
- **仅确定性截断**：零成本但名称常无意义；是否作为唯一方案待 Q1 确认。
- **引入配置文件**：诉求未提，可能过度设计；待 Q4 确认。

## 实施决策

### 包布局与形态

- `package.json`：`pi.extensions: ["./src/index.ts"]`；`type: module`；jiti 直载 TS；peer `@earendil-works/pi-coding-agent`；无运行时依赖。
- 模块划分：`src/index.ts`（扩展工厂、触发判定与异步编排）、`src/name.ts`（清洗/截断与提示词）。纯逻辑与 pi API 解耦以便单测。

### 触发与边界

- 判定「第一句」：`pi.getSessionName() === undefined` 且 `ctx.sessionManager.getBranch()` 中不存在 `type === "message" && message.role === "user"` 的条目。
- 跳过：`event.source === "extension"`；恢复/继续/派生的会话由上述判定天然覆盖。
- 防重：在处理器内同步置位「已发起」标志，避免并发输入重复命名。
- 会话代际：`session_start` 递增代际号；在途命名写回前校验代际未变，避免 reload/切会话后旧调用污染新会话。

### 名称生成与截断

- **混合生成**：优先调用模型（`ctx.modelRegistry.complete(ctx.model, ...)`）生成标题；无模型、无鉴权、调用失败或输出为空时，降级为对首句的确定性截断。
- **模型来源**：默认当前会话模型 `ctx.model`；本轮不引入配置文件或环境变量。
- **请求参数**：必须传 `sessionId: ctx.sessionManager.getSessionId()`（按会话路由的 provider 如 opencode 缺它即 400）；`maxTokens` 默认 256，因推理模型会先消耗 thinking 预算，32/64 会把预算耗尽而拿不到 text；`timeoutMs` 默认 5000。
- 清洗：去除首尾空白、换行折叠为空格、去掉成对引号、markdown 强调符（`**`/`__`/`*`/`~~`）与首行标题标签（`标题:`/`title:`）、尾部标点。
- 取文：只取模型回复的首个非空 text 块，多 text 块不拼接，避免把解释行混进标题。
- 截断：`Array.from(name).slice(0, 8).join("")`，按 Unicode 码点计，不加省略号。
- 提示词要求模型直接输出标题、中文优先、≤ 8 字、无标点与引号。

### 写入

- 命名前再次校验 `pi.getSessionName() === undefined`，避免覆盖用户期间的 `/name`。

## 工作环境

- pi 1.2.0（`@earendil-works/pi-coding-agent`，kxh-kit catalog 已锁定）；扩展面文档 `.../pi-coding-agent/docs/extensions.md`，类型 `dist/core/extensions/types.d.ts`。
- kxh-kit pnpm workspace（`packages/*`）；安装验证 `pi install <abs>/packages/pi-session-name`。
- 关键 API：`pi.on("input")`、`pi.setSessionName()`、`pi.getSessionName()`、`ctx.sessionManager.getBranch()`、`ctx.modelRegistry.complete()`、`ctx.model`。

## 范围

- 插件包实现、vitest 单测、README。
- 安装到本机 pi 的真机验证证据。

## 非范围

- 修改 pi 上游、发布 npm。
- 对非首句输入、助手回复的命名或改名。
- 交互式改写会话列表 UI。

## 执行约束

- 模式：manual；dev gate 由用户确认。
- 质量门禁：`pnpm --filter @kxh4892636/pi-session-name test` 全绿、增量覆盖率 ≥ 80%、`check` 通过。
- 交付终点：本机 commit（是否 push 待用户确认）。

## 待定

无。Q1–Q4 已于 2026-10-14 全部确认（见 [01 note](01-会话自动命名实现.md)「拷问记录」）。

## 上下文

- [story](story.md)
- [CONTEXT](../../../CONTEXT.md)
- [01-会话自动命名实现](01-会话自动命名实现.md)
- pi 扩展事件与 API：`.../pi-coding-agent/docs/extensions.md`
- `.../pi-coding-agent/dist/core/session-manager.js` 的 `appendSessionInfo`（仅折叠换行 + trim）、`getSessionName`

## 当前进度

截至 2026-10-14：实现、单测、静态检查与真机 e2e 均已完成。`packages/pi-session-name` 33/33 测试通过、覆盖率 statements 98.79% / branches 100% / functions 94.44% / lines 98.64%、`check` 通过；真机新会话命名为「修复登录超时」、`--continue` 不重命名。待提交 commit。详见 [01 note](01-会话自动命名实现.md)「执行检查点」与「交付记录」。

## 恢复入口

1. 读 [story](story.md) 与 [spec](spec.md)「实施决策」，读 [01 note](01-会话自动命名实现.md) 的「拷问记录」。
2. 核对现场：`packages/pi-session-name` 是否存在、pi 版本、`extensions/types.d.ts` 中 `input`/`setSessionName` 是否仍一致。
3. 交付已完成并真机验证；如需变更，从 `packages/pi-session-name/src/{name,index}.ts` 入手，同步测试与 README。
4. 前置：kxh-kit 依赖已安装（`pnpm install`）。停止条件：dev gate 前需用户确认。

## Notes

| #   | Notes                                      | 状态      | 阻塞于 | 下一步      |
| --- | ------------------------------------------ | --------- | ------ | ----------- |
| 01  | [会话自动命名实现](01-会话自动命名实现.md) | completed | —      | 提交 commit |
