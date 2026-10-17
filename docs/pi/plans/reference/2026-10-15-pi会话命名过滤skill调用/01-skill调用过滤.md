---
status: completed
blocked_by: []
---

# skill 调用过滤

## 交付

关联 US-001 / US-002：`packages/pi-session-name` 自动命名前剥离首句中的 skill 调用（`<skill>` 块与 `/skill:` 命令），用户请求成为命名依据；纯 skill 调用以 skill 名为名。交付物为源码、测试、README 与真机证据。

## 范围

- `src/name.ts` 新增纯函数 `namingInput` 与正则常量。
- `src/index.ts` 命名输入接入过滤结果（模型提示与降级一致）。
- `src/name.test.ts`、`src/index.test.ts` 补用例；`README.md` 补行为说明。
- 不包含：pi 上游修改、`pi-nested-skill` 修改、配置项、长度调整。

## 直接依赖

- 无（根 note）。

## 验收

- [x] `pnpm --filter @kxh4892636/pi-session-name test` 全绿
- [x] `run test:coverage` 增量覆盖率 ≥ 80%，`run check` 通过
- [x] 单测覆盖：块+请求（块在前/中间/多块）、纯块、`/skill:` 带参与无参、普通文本、`$` 文本不误伤
- [x] 真机：首句 `<skill …>…</skill> <请求>` 的会话名来自 `<请求>`，不再是 `<skill name="`
- [x] 真机：纯 skill 调用首句的会话名为该 skill 名
- [x] code review（Spec + Standards）发现项均有结论

## 上下文

- [story](story.md)、[spec](spec.md)
- 代码：`packages/pi-session-name/src/name.ts`、`src/index.ts`、`src/name.test.ts`、`src/index.test.ts`
- 宿主实现证据：`@earendil-works/pi-coding-agent@1.2.0` 的 `dist/core/agent-session.js`、`dist/core/extensions/runner.js`
- 同包参考：`packages/pi-nested-skill/src/reference.ts`（同一 `<skill>` 块形态）

## 决策与证据

### 失效现场

- 2026-10-15 本工作区会话（`2026-10-15T12-24-40-901Z_01a13f85-…jsonl`）首句为 `<skill name="ecom-x-flow" location="…">…</skill> pi-session-name 进行升级…`；`session_info` 写入 `name: "<skill name=\""`（13 码点截断）。证明命名输入是未过滤的 skill 块原文。

### 结构与顺序取证

- `<skill name="…" location="…">\nReferences are relative to …\n\n<body>\n</skill>` 是宿主展开形态：pi 核心 `AgentSession._expandSkillCommand`（处理 `/skill:name args`）与 `packages/pi-nested-skill/src/reference.ts`（处理 `$name`）产出相同包装。
- `input` 事件先于 skill 展开：`AgentSession.prompt()` 先 `_runInputHandlers()`，后 `_expandSkillCommand()`。因此 `/skill:name args` 到达扩展时仍是命令原文，需在扩展内解析。
- input handler 按扩展加载顺序链式执行（`runner.js` `emitInput` 顺序遍历并传递 `transform` 结果）；`~/.pi/agent/settings.json` 中 `pi-nested-skill` 排在 `pi-session-name` 之前，故 `$name` 已被展开为 `<skill>` 块，`pi-session-name` 看到的是块形态。
- 宿主 `parseSkillBlock` 只匹配「整段文本 = 块 + `\n\n` + 可选请求」，遇到本现场 `</skill> ` 单空格分隔会失配；因此过滤不做同样假设，按全局替换剥块并以空白折叠收尾。

### 选定方案

- 纯函数 `namingInput(raw)`：先全局剥 `<skill>` 块，再匹配整段 `/skill:name args`；剩余空白折叠后非空则用剩余文本，否则用第一个 skill 名，再否则 `""`。
- 接入点唯一：`src/index.ts` 的 `input` handler，结果同时喂 `fallbackName` 与 `buildNamePrompt`。
- 纯 skill 调用兜底取 skill 名（如 `ecom-x-flow`），不落入永久无名路径。

### 拷问记录

#### 第 1 轮

##### Q1 — 过滤哪些 skill 调用形态

- 问题：命名输入要剥离哪些形态：(a) 仅 `<skill>` 块；(b) 块 + 起始 `/skill:name args`；(c) 再加未展开的 `$name`？
- 前置问题：无。
- 下游边界：决定解析函数与用例；决定「无剩余文本」的兜底来源。
- 推荐答案及理由：(b)。区块与命令的产出形态、到达时机均有实现证据；`$name` 在当前加载顺序下已被展开为块，额外匹配会误伤普通文本（如 `$HOME`、代码片段）且无收益，排除。
- 修改意见：auto 模式，无用户反馈。
- 处理结论：已确认（2026-10-15，auto，依据「失效现场」「结构与顺序取证」）。

##### Q2 — 纯 skill 调用的名称来源

- 问题：剥离后无用户文本时取什么：(a) 第一个被调用 skill 名；(b) 跳过命名；(c) skill 描述；(d) 保持空？
- 前置问题：Q1。
- 下游边界：决定是否改动既有「装饰性输入跳过」语义与会话是否有名。
- 推荐答案及理由：(a)。首句已进入分支后，后续输入命中 `hasUserMessage` 跳过条件（`src/index.ts`），(b) 会导致会话永久无名；(c) 需读 SKILL.md 或额外改名轮次，超出诉求；(d) 同 (b)。
- 修改意见：auto 模式，无用户反馈。
- 处理结论：已确认（2026-10-15，auto）。多块且无剩余文本时取第一个 skill 名。

##### Q3 — 用户文本与 skill 名共存时的取舍

- 问题：拆出用户文本时，是否把 skill 名一并拼入命名输入：(a) 只用用户文本；(b) 用户文本 + skill 名？
- 前置问题：Q1。
- 下游边界：决定提示词内容与最终名称形态。
- 推荐答案及理由：(a)。升级目的就是让名称反映真实请求；skill 名只作无文本兜底，混入会污染标题。
- 修改意见：auto 模式，无用户反馈。
- 处理结论：已确认（2026-10-15，auto）。

### 补充说明

- `/skill:name` 的 `args` 与 `<skill>` 块后的追加文本同等对待，均视为用户请求。
- 用户原话只要求「过滤调用的 skill」，未要求改动长度、模型或配置；本轮不扩散。

### 代码审查与修复

两路 subagent（Spec、Standards）均完成审查，采纳项：

- 块正则改为锚定宿主形态（`>\n…\n</skill>`）：保留对块体内联 `</skill>` 文本的容忍（避免惰性匹配提前截断）；补 `ignores a closing tag inside a skill body` 用例。
- `/skill:main $helper` 形态下，被强制调用的 `main` 取优先级提到参数内展开的 skill 之前（`unshift`）；补对应用例。
- 补「多块 + 剩余请求」用例。
- README 修正两处不准确：块的来源（`$name`/扩展展开）与降级输入已是过滤后文本。
- 删除既有重复用例（`index.test.ts` 原「swallows a naming failure…」与「falls back when the model request throws」等价且无法检出 unhandled rejection）。

未采纳项（记录理由）：

- 正文用引号引用完整 `<skill>` 块会被误当调用而过滤：文本层面无法区分引用与真实调用，命名本身为 best-effort；接受该误报。
- 未闭合/空 name 的畸形块不处理：宿主只产出闭合且非空的块；畸形输入退化为既有「装饰性输入跳过」路径。
- `<skill>` 语法被本包复刻一份，存在宿主格式漂移风险：插件形态下不可避免，靠本 note 记录的宿主证据与测试夹具监控。
- `/skill:name\nargs` 比宿主（只按空格切分）更宽松：多识别的形态不会被宿主展开，仅影响命名，无实际副作用。

## 执行检查点

更新时间 2026-10-17，交付完成，Plan 已归档到 reference（用户确认）。

- 实现：`src/name.ts`（`SKILL_BLOCK`/`SKILL_COMMAND` + `namingInput`）、`src/index.ts`（`input` handler 接入）、测试与 README。
- 门禁：`test` 46/46 通过；`test:coverage` statements 98.98% / branches 95.31% / functions 95% / lines 100%（阈值 80）；`check` 通过。
- 真机：修复后 case1（块+请求）名称 `修复登录超时问题`；case2（纯块）重复 3 次为 `演示流程`、`demo-flow`、`demo-flow`；均无 skill 正文泄漏。
- 失败尝试：`pi -p` 首轮极短时，fire-and-forget 命名请求可能先于进程退出而未写入；重复运行可稳定复现名称，单测确定性覆盖降级路径。
- 基线：`repos/kxh-kit main @ a8351e4`，工作区干净；提交后见交付记录。

## 下一步

无待办；Plan 已归档到 `reference`。

## 交付记录

完成登记 2026-10-15；归档 2026-10-17（用户确认）。

- **交付物**：`packages/pi-session-name/src/name.ts`（`SKILL_BLOCK`、`SKILL_COMMAND`、`namingInput`）、`src/index.ts`（命名输入接入）、`src/name.test.ts`、`src/index.test.ts`、`README.md`。
- **验证命令与结果**：
  - `pnpm --filter @kxh4892636/pi-session-name test`：2 个文件 46 项全部通过（基线 35 项 + 新增/调整）。
  - `pnpm --filter @kxh4892636/pi-session-name run test:coverage`：statements 98.98 / branches 95.31 / functions 95 / lines 100，均 ≥ 80。
  - `pnpm --filter @kxh4892636/pi-session-name run check`：格式化、lint、类型全部通过。
  - 真机（修复后）：`pi -p '<skill …>…</skill> 修复登录超时' --session-dir <tmp> --no-approve --no-tools` → `session_info.name = "修复登录超时问题"`；`pi -p '<skill name="demo-flow" …>…</skill>'` 重复 3 次 → `演示流程` / `demo-flow` / `demo-flow`。
  - 安装复验（2026-10-17）：`pi install ./packages/pi-session-name` 成功，`pi list` 列出该包；`pi -p "帮我修复登录超时的问题" --session-dir <tmp> --no-tools` → `session_info.name = "登录超时问题修复"`；`pnpm --filter @kxh4892636/pi-session-name test` 46/46 通过。
- **证据链接**：本 note「决策与证据 · 失效现场 / 结构与顺序取证」「代码审查与修复」「执行检查点」。
- **遗留限制**：`pi -p` 极短首轮存在命名请求与进程退出的竞态（fire-and-forget），可能观察不到 `session_info`；命名标签仍可能被引号引用的完整块误触发过滤；宿主 `<skill>` 语法变化时需同步本包正则。
