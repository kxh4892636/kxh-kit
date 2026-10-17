---
status: completed
---

# pi 会话命名过滤 skill 调用

## 问题

`packages/pi-session-name` 在会话首句自动命名时，直接把 `input` 事件的原文当作命名依据。当首句是 skill 调用时，原文包含整段 skill 正文：

- 实测（2026-10-15，本工作区）：某会话首句为 `<skill name="ecom-x-flow" location="…">…SKILL.md 正文…</skill> pi-session-name 进行升级…`，自动命名写入 `session_info.name = "<skill name=\""`。
- 模型提示词与确定性降级都消费同一段原文，因此即使模型可用，标题也只会来自 skill 正文/包装标签，而不是用户请求。

用户要求：重命名时把调用的 skill 从用户输入中过滤掉。关联 story 的 US-001、US-002。

## 方案

在纯函数层新增 `namingInput(raw)`：把 skill 调用从命名输入中剥离，并且只影响自动命名，不改动真实消息。

- **剥离 `<skill>` 块**：全局匹配宿主形态 `<skill name="…" location="…">\n…\n</skill>`，替换为空白；多个块、块出现在文本任意位置均处理。
- **剥离 `/skill:` 命令**：`input` 事件早于 pi 的 skill 展开，纯命令形态需自行解析 `^/skill:<name>(\s+<args>)?$`，把 `args` 作为用户文本；被强制调用的 skill 名优先于参数内展开的 skill。
- **兜底**：剥离后剩余文本为空时，用第一个被调用 skill 的 `name` 作为命名输入（如 `ecom-x-flow`），避免落入既有「装饰性输入」跳过路径后永久无名。
- **消费点**：`src/index.ts` 的 `input` handler 里对 `event.text` 调一次 `namingInput()`，结果同时用于确定性降级 `fallbackName()` 与模型提示 `buildNamePrompt()`。普通文本路径行为不变。

## 已排除的备选

- **只过滤模型提示词、不过滤降级**：模型不可用时仍会得到 `<skill name="` 类名称，问题只解决一半；拒绝。
- **剥离 `$name` 引用**：当前安装顺序下 `pi-nested-skill` 先于 `pi-session-name` 执行 `input` 转换，`$name` 已被展开为 `<skill>` 块；再匹配 `$…` 会误伤普通文本（如代码片段），收益为零；拒绝。
- **纯 skill 调用时跳过命名**：首句已进入分支后，后续输入命中 `hasUserMessage` 跳过条件，会话将永久无名；拒绝。
- **用 skill 描述或模型为纯调用生成标题**：需要读取 SKILL.md 或额外改名轮次，超出诉求；拒绝。
- **在 pi 上游修改 `parseSkillBlock`/会话命名**：本域约定以插件形态交付，不改上游；拒绝。

## 实施决策

### 纯函数接口（`src/name.ts`）

- 新增导出 `namingInput(raw: string): string`，与既有 `fallbackName` / `buildNamePrompt` 同层、无 pi 依赖，便于单测。
- 正则（常量、非导出）：
  - 块：`/<skill name="([^"]*)"[^>]*>\n[\s\S]*?\n<\/skill>/gu`，锚定宿主形态（换行开头/结尾），回调收集 `name`；块体内联的 `</skill>` 文本不会提前截断；
  - 命令：`/^\/skill:([a-z0-9-]+)(?:\s+([\s\S]*))?\s*$/u`，匹配后将被强制调用的 skill 名 `unshift` 到收集列表首位。
- 返回值：`rest.replace(/\s+/gu, " ").trim()`；若为空则取收集到的第一个 skill 名；再无则为 `""`。
- 顺序：先剥块，再匹配 `/skill:` 命令（命令是与块互斥的另一种形态；块剥离可能给命令前后留下空白）。
- 已知限制：正文用引号引用完整块的会被当调用过滤；未闭合/空 name 的畸形块不处理（宿主不产出）；`<skill>` 语法为复刻，宿主格式漂移需同步正则。

### 扩展接入（`src/index.ts`）

- `input` handler 中：`const input = namingInput(event.text);`，随后 `fallbackName(input, …)`；`fallback` 为空仍走既有跳过路径。
- 传给 `nameSession()` 与 `buildNamePrompt()` 的均为此过滤结果，模型与降级输入一致。
- 其余触发/防重/代际逻辑不变。

### 文档与测试

- `src/name.test.ts`：块+请求、块在前/在后、多块、纯块、`/skill:` 带参/无参、普通文本、`$` 文本不受影响。
- `src/index.test.ts`：首句为 skill 块时提示词含真实请求且不含 skill 正文；纯 skill 调用降级为 skill 名。
- `README.md`「Behaviour」补一条：skill 调用会被过滤；无剩余文本时以 skill 名为名。

## 工作环境

- 宿主：pi 1.2.0（`@earendil-works/pi-coding-agent`，catalog 锁定）。
- 仓库：`repos/kxh-kit`（`main`），pnpm workspace；Node v24.19.0、pnpm 11.22.0。
- 包：`packages/pi-session-name`，jiti 直载 TS，`pi.extensions` 指向 `./src/index.ts`。
- 门禁命令（工作目录 `repos/kxh-kit`）：
  - 测试：`pnpm --filter @kxh4892636/pi-session-name test`
  - 覆盖率：`pnpm --filter @kxh4892636/pi-session-name run test:coverage`（阈值 80）
  - 静态：`pnpm --filter @kxh4892636/pi-session-name run check`
- 真机：settings.json 的包路径直接指向该 workspace 包，源码改动对下次 pi 启动生效；用 `pi -p "…" --session-dir <tmp>` 后检查会话文件 `session_info.name`。
- 关键 API/事件来源：`input` handler 链与 `/skill:` 展开顺序见 [01 note](01-skill调用过滤.md)「决策与证据」。

## 范围

- `packages/pi-session-name` 的 `src/name.ts`、`src/index.ts`、两个测试文件、`README.md`。
- 本 Plan 文档维护与提交。

## 非范围

- 修改 pi 上游、`pi-nested-skill` 或实际会话消息内容。
- 新增配置项、环境变量或命名长度调整。
- 非首句输入、助手回复的命名；会话列表 UI 改造。

## 执行约束

- 模式：auto（改动小、单包可自动推进）；但按流程在 dev gate 停止并等待用户手动确认。
- 质量门禁（最小集合）：`test` 全绿、增量覆盖率 ≥ 80%、`check` 通过、code review（Spec + Standards 两路 subagent）、真机验证（skill 块首句与纯 skill 调用各一例）。
- 交付终点：kxh-kit 本机 commit；是否 push 由用户确认。
- 提交前通过 `/domain skill` 更新本 Plan 并运行 check-domain 校验。

## 待定

无。Q1–Q3 已在 auto 模式按证据裁决（2026-10-15），见 [01 note](01-skill调用过滤.md)「拷问记录」。

## 上下文

- [story](story.md)
- [pi 业务域 CONTEXT](../../../CONTEXT.md)、[QUESTIONS](../../../QUESTIONS.md)
- [01-skill调用过滤](01-skill调用过滤.md)（含失效现场证据与拷问记录）
- 代码：`packages/pi-session-name/src/name.ts`、`src/index.ts`
- 变更前基线：`main @ a8351e4`，`pnpm --filter @kxh4892636/pi-session-name test` 35/35 通过。

## 当前进度

截至 2026-10-17，交付完成；Plan 已归档到 `reference`（用户确认）。基线 `main @ a8351e4`。

- 已完成：问题取证、方案与接口、实现、单测、README、门禁（test 46/46、覆盖率 statements 98.98 / branches 95.31 / functions 95 / lines 100、check 通过）、code review 与修复、真机验证（块+请求 → `修复登录超时问题`；纯块 ×3 → `演示流程` / `demo-flow` / `demo-flow`）、commit；2026-10-17 重新安装（`pi install`）并真机复验命名（`登录超时问题修复`）。
- 未验证：无（`pi -p` 的 fire-and-forget 竞态已作为遗留限制记录）。

## 恢复入口

1. 交付完成，无需继续；如需变更，读本文「实施决策」与 [01 note](01-skill调用过滤.md) 的「决策与证据」「代码审查与修复」。
2. 核对现场：`git -C repos/kxh-kit log --oneline -3`；`packages/pi-session-name/src/name.ts` 的 `namingInput` 是否与本文正则一致。
3. 变更时从 `src/name.ts` 与 `src/name.test.ts` 入手，同步 `src/index.ts`、`src/index.test.ts`、README。
4. 前置：kxh-kit 依赖已安装（`pnpm install`）。

## Notes

| #   | Notes                                | 状态      | 阻塞于 | 下一步 |
| --- | ------------------------------------ | --------- | ------ | ------ |
| 01  | [skill调用过滤](01-skill调用过滤.md) | completed | —      | 已归档 |
