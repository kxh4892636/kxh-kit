---
status: in_progress
---

# dsh 插件适配 0.1.5-rc.1

## 问题

`packages/dsh-nested-skill` 与 `packages/dsh-session-manager` 按 DSH `0.1.2-rc.1` 写成；宿主 `latest` 发布通道已跳到 `0.1.5-rc.1`（`dsh.log` `2026-09-10T14:24:58Z`）。逐包比对 0.1.2-rc.1 tarball 与运行中 0.1.5-rc.1 安装树的 `lib/types/*.d.ts` 后确认：**没有任何导致插件加载失败或工具注册失败的破坏性变更**（`dsh-skill` 零差异；`dsh-fs`/`dsh-tools`/`dsh-llm`/`dsh-session-query` 均为增量；`dsh-session-projection.stateOf(session, key)`、`systemPrompt.section(section: PromptSection)`、`TOOL_RALPH 2700`/`TOOL_SUBAGENT 2800`、`session-query-sqlite` 的 `Config.path`/`openAt` 均未变）。9 个自有 `session_*` 工具、5 个上游搜索工具与任意深度 skill 发现在 0.1.5-rc.1 上仍工作。

真正需要处理的是四件事：

1. **`session_read` 的 assistant 正文恒为空（真实缺陷，本次真机复现）**：`session-eccb15ed…` 5 条 assistant 全为 `""`，`session-538619f2…` 14 条全为 `""`，窗口里只剩 `[event tool/call]` 一类占位行。根因叠加两条：① `src/host.ts` 的 `eventTextOf` 只读 `data.content[].text` 与 `data.texts`，而 `assistant/message` 的数据形状（0.1.2 与 0.1.5 相同）是 `{ turn, step, message: AssistantMessage, usage?, interrupted? }`，正文在 `data.message.content[].text`；② 0.1.2 上靠 `chunkrow/*` 打包行兜底显示正文，而 0.1.5 **移除了 `@deepseek-ai/dsh-session/chunk-rows`**，该兜底路径变成不可达死代码。
2. **唯一的破坏点即 chunk 行移除**：`SessionHistoryRecord` 的 `chunks` 变体消失，只剩 `{ type: "event", event }`；`HistoryRecordVariantLike` 的 `{ type: "chunks" }` 分支与 `ChunkRowEventLike`/`chunkEventOf`/`isChunkRowEvent` 成为死代码（前序 Plan 明确把该适配列为「待定」，恢复条件是「`latest` 跳到含该变更的版本」——已发生）。
3. **依赖声明漂移**：两个包 peer 仍是 `^0.1.2-rc.1`，而按 semver 预发布规则 `0.1.5-rc.1` **不满足**该范围（预发布可比性只限同 `major.minor.patch` 元组）；`dsh-session-manager` 的 `@deepseek-ai/dsh-tool-session-query` 也是 `^0.1.2-rc.1`，profile 实装 `0.1.2-rc.1`（该包 `0.1.5-rc.1` 已发布）。`file:` 安装不校验 peer，因此现在不阻断加载，但下一次 `dsh plugin --profile web add` 会按旧范围把旧版工具包装回。
4. **文档与声明自相矛盾**：两个 README 仍写「兼容 DSH 0.1.2-rc.1」；`docs/dsh/adr/0003` 正文与 Consequences 的版本字面量仍是 `0.1.2-rc.1`/`^0.1.2-rc.1`，而该 ADR 自身要求「通道跳版后需人工复核并显式决策」。

约束：只承诺 `latest` 发布通道（当前 `0.1.5-rc.1`）正确；不引入新领域术语、不新增 ADR；生效需要同步 profile 快照并重启 3080 实例，会中断当时正在执行的会话（放在交付最后一步）。

## 方案

- **按上游语义取正文**：在本包内扩展 `eventTextOf`，按 `@deepseek-ai/dsh-session-query` 的 `extractSessionEventText` 语义读块级正文，assistant 正文从 `data.message.content` 取；不新增运行时依赖，不读 `data.stream`。
- **删除 chunk 行死代码**：`HistoryRecordVariantLike` 收敛为纯 event 记录，删掉 `ChunkRowEventLike`/`chunkEventOf`/`isChunkRowEvent` 与 `{ type: "chunks" }` 分支；修复 ① 后即为「同时修好旧宿主与 0.1.5」——旧宿主上 `data.message.content` 同样存在，不再依赖任何 chunk 行兜底。
- **窗口呈现按事件语义**：消息类事件正文可见，`tool/call` 补工具名与有界参数摘要，其余事件保留 `[event …]` 单行；reasoning 不呈现。
- **声明对齐 `^0.1.5-rc.1`**：两个包的 DSH 相关 peer 与 `dsh-tool-session-query` 统一到该范围，工具包留在 `dependencies`（ADR-0003 的交付形态不变），并保留「通道跳版后人工复核」这一记录点。
- **用真实 wire 形状的假数据把缺陷变成可拦截的回归**：`test-support.ts` 的假 `assistant/message` 从 `data: { content }` 改为 `data: { turn, step, message: { content } }`（与真实宿主一致），并补 `tool/call`/`tool/result` 用例。
- **交付末段重装并重启**：`vp pack` 重建两个包的 dist → 同步 profile 快照（`file:` 是硬链接，重建会换 inode）→ 重启 3080 → 真机冒烟（既有子会话读取 + 一次端到端）。

## 已排除的备选

- **复用 `@deepseek-ai/dsh-session-query` 的 `extractSessionEventText`**：会给 session-manager 增加一个只为取文本的运行时依赖，并把它的 peer 面绑到 `dsh-session-query`；`session_read` 是 Host 内部文本化，语义自持即可。
- **从 `assistant/message` 的新 `data.stream`（`AssistantStreamRecord`）拼文本**：正文真相在 `message.content`，stream 是模型流派生记录（compact delta），还需另做 reasoning/tool-call 归并；上游 `extractSessionEventText` 同样不读它。
- **保留 chunk 行分支作为旧版本兼容**：0.1.5 的 `SessionHistoryRecord` 只有 event 变体，分支不可达；前序 Plan 保留它的唯一理由是 0.1.2 仍需兜底，而该兜底正是本次缺陷的成因。
- **只改 README、peer 保持 `^0.1.2-rc.1`**：`0.1.5-rc.1` 不满足该范围，下一次重装会把 `0.1.2-rc.1` 版上游工具包装回，与宿主混装。
- **peer 放宽为 `>=0.1.5-rc.1 <0.2.0`**：违背 ADR-0003 已确立的「声明等于已在本机验证过的通道版本」口径，并让重装在未验证的 `0.1.9` 上静默装入。
- **只做单测与静态比对、不重启**：文本缺陷由假数据的错形状造成，62 项单测全绿却漏掉了它；修复效果必须用「读同一批旧会话能读出正文」证明。`patchReload: live` 不能替代重建+重装+重启（bundle 包是主动加载）。
- **为 reasoning 或 live `assistant-stream` 帧增加呈现**：超出「版本适配」范围，且与上游「reasoning 不计入语义文本」的口径相悖，还会放大 `session_read` 输出体积。
- **重跑前序 Plan 的 9 工具全量实调矩阵**：工具面本身未变，边际价值低于成本；只做零成本的子会话读取回归与一次端到端。

## 实施决策

- **`eventTextOf` 语义（按上游 `extractSessionEventText` 逐条对齐）**：

  | 事件类型            | 文本来源                                                                                             |
  | ------------------- | ---------------------------------------------------------------------------------------------------- |
  | `user/message`      | `data.content[].text`                                                                                |
  | `assistant/message` | `data.message.content[].text`（现有顶层 `data.content`/`data.texts` 回退保留，兼容假数据与历史形态） |
  | `tool/call`         | `[data.name, data.arguments]`                                                                        |
  | `tool/result`       | `data.message.content[].text` + `data.error.name`/`data.error.code`                                  |
  | `reasoning` 块      | 不计入                                                                                               |

- **`entryOf` 分类**：`user/message` → `kind: "user"`；`assistant/message` → `kind: "assistant"`；`tool/call` 与 `tool/result` → `kind: "event"`，文本为 `[tool/call] <name>(<参数摘要>)` / `[tool/result] <正文首行或 error 码>`；其余事件 → `[event <type>]`。`HistoryEntry` 的三值 `kind` 与形状不变。
- **Host wire 形状**：`HistoryRecordLike` 只保留 `{ type: "event", event: { type, seq, time, data } }`；`HistoryRecordVariantLike` 删除 `{ type: "chunks" }` 成员（不引入 `@deepseek-ai/dsh-session` 的 peer 依赖）。
- **假数据契约**：`test-support.ts` 的 `messageRecordOf` 产出 `data: { turn, step, message: { role, content } }`（与 0.1.5 真实 wire 形状一致）；`host.test.ts` 覆盖 assistant 正文、`tool/call` 摘要、`tool/result` 正文与 error 码，并断言不再存在 chunk 行分支。
- **版本范围**：`dsh-nested-skill` peer `dsh-fs`/`dsh-skill` 与 `dsh-session-manager` peer `dsh-llm`/`dsh-tools`、其 `dependencies` 的 `@deepseek-ai/dsh-tool-session-query` 全部改 `^0.1.5-rc.1`；`@deepseek-ai/cordis`（`^4.0.2`）与 `@deepseek-ai/schemastery`（`^3.18.2`）范围不变。README 的兼容段落与 ADR-0003 的版本字面量同步为 `0.1.5-rc.1`/`^0.1.5-rc.1`（决策本身不变）。
- **生效路径**：`vp check` + `vp test src` → `vp pack` 重建两个包 dist → `dsh plugin --profile web add file:<包路径>` 重装或逐文件同步快照（`file:` 是硬链接，重建会换 inode，必须显式同步 `dist/` 与 `package.json`）→ `dsh-alive start --port 3080` 重启 → 会话内冒烟。`host.ts` 当前 829 行已超 610 行上限（存量债务），本轮只做净减法。
- **文档口径**：两个 README 写「兼容 DSH `0.1.5-rc.1`（`latest` 发布通道）」；ADR-0003 的版本字面量与 Consequences 同步；不新增 ADR、不新增领域术语、`docs/dsh/CONTEXT.md` 不变。
- **执行契约（2026-09-10 用户追加）**：本轮在 `.worktrees/dsh-plugin-0.1.5`（分支 `feat/dsh-plugin-0.1.5`，基线 `main`）执行，Issue 01–03 串行推进、每 Issue 一次提交；完成后推送分支到 `origin`，再快进合入本地 `main` 并推送。
- **交付形态（2026-09-10 用户追加）**：合入 push 后，两个插件与 `dsh-keep-alive` 各以 `vp pack` 产出本地 tarball（`.temp/pack/`），插件经 `dsh plugin --profile web add <tarball>` 安装（与 `file:` 硬链接不同，tarball 安装与工作区解耦，重建不再需要手动同步快照），`dsh-alive` 经 `npm install -g <tarball>` 本地安装；版本号保持 `0.1.0`/`0.0.1`（`file:`→tarball 是安装形态变更，无消费者读版本号，bump 不产生可验证价值）。
- **推送授权**：用户在本轮显式要求「push」，授权范围限于本轮分支与 `main` 的推送。

## 工作环境

- 宿主：`dsh-alive` 受管的 3080 实例，当前 `0.1.5-rc.1`（tag `latest`）；状态见 `%LOCALAPPDATA%\dsh-keep-alive\3080\{state.json,control.json,dsh.log}`。
- profile：`~/.dsh/profiles/web`，bundles 含 `@deepseek-ai/dsh-base`、`@deepseek-ai/dsh-web-app` 与 `@kxh4892636/dsh-nested-skill`、`@kxh4892636/dsh-session-manager`、`@kxh4892636/dsh-opencode-session`；插件以 `file:` 依赖安装（硬链接语义）。
- 会话日志：`~/.dsh/sessions/--C-Users-kxh-...-kxh-kit--/<sessionId>/session.jsonl.zstd`（zstd 压缩，读取须经宿主服务）。
- 工具链：`vp pack` / `vp check` / `vp test src`（vitest）；Node ≥ 22.12。
- 单测基线：nested-skill 37 项、session-manager 62 项全绿（本轮实测）。
- 领域文档校验：`node .agents/skills/nano-flow/scripts/check-domain.mjs .`（存量违例见「待定」）。
- 取证材料：`.flow/dsh-plugin-0.1.5-audit/{report.md,type-diff.txt}`；0.1.2-rc.1 tarball 解包于 `.temp/dsh-old/`，0.1.5-rc.1 类型树于 `.temp/dsh-new/`。
- git：`origin git@github.com:kxh4892636/kxh-kit.git`，主分支 `main`（本轮起点 `48713cca`）；worktree 统一在 `.worktrees/` 创建（项目规则）；`gh` CLI 未安装，合并走本地 `git merge --ff-only`。
- 安装入口：`dsh plugin --profile web <args>` 是 profile 目录内的 pnpm 代理（`~/.dsh/profiles/web`）；`dsh-alive` 为全局 npm 包 `dsh-keep-alive@0.0.1`，入口 `C:\nvm4w\nodejs\dsh-alive.ps1`。

## 范围

- `dsh-session-manager/src/host.ts` 的正文取法修复、chunk 行死代码删除与 `tool/call`/`tool/result` 可读化；`test-support.ts` 与 `host.test.ts` 的假数据/用例对齐真实 wire 形状。
- 两个包的 DSH 相关 peer 与 `@deepseek-ai/dsh-tool-session-query` 对齐 `^0.1.5-rc.1`；两个 README 与 ADR-0003 的版本字面量同步。
- 在 `.worktrees/dsh-plugin-0.1.5` 串行执行 Issue 01–03，每 Issue 一次提交；推送分支、快进合入 `main` 并推送。
- `vp pack` 产出三个本地 tarball；两个插件经 tarball 装回 web profile，`dsh-alive` 全局本地更新；重启 3080 并做真机冒烟（含既有子会话读取与一次端到端）。
- 领域文档：本 Plan 的 spec 与 Issue 图（本轮为交付契约的权威输入）。

## 非范围

- `0.1.3-alpha.*`/`0.1.5-alpha.*` 等其他发布通道的兼容；`alpha` 通道的 chunk 行形态不再支持。
- 工具参数与输出 schema 变更、新工具、插件功能扩展、`session_read` 的分页/排序语义变更。
- `inject`/`ctx.get` 服务装配方式、`stateOf` 调用、投影形状（前序 Plan 已修，本轮只做回归确认）。
- GUI 与上游仓库改动、npm 发布、版本号 bump、tarball 交付物。
- 其他包（`dsh-keep-alive`、`dsh-opencode-session`、`nano-flow`、`nano-mem` 等）的版本策略。

## 待定

- **`docs/dsh/CONTEXT.md` 的「发布通道」表述**：ADR-0003 与本 Plan 使用「对齐当前通道版本 `^0.1.5-rc.1`」的说法，而 CONTEXT 的 `发布通道` 词条只讲 dsh-alive 的 `--tag` 记忆，不含插件声明口径。恢复条件：口径需要进入领域语言时，由 `/questing` 维护 glossary。
- **`host.ts` 文件超限（存量债务）**：829 行（上限 610 行）。本轮只做净减法；恢复条件：按职责拆分（子会话寻址、投影归一化、历史文本化可各自独立）时另起 issue。
- **`docs/dsh/plans/active/2026-09-09-skill菜单模糊搜索` 领域校验失败（存量违例，非本 Plan 资产）**：该 Plan 目录在 `active/` 下且缺 `spec.md`/`story.md`（校验报 1 项），另在 `.flow/state.json` 中仍持有 `01` 的租约（`owner_session ca9f5ac4-…`，已于 2026-09-09 过期）。恢复条件：该工作恢复推进或归档时处理。
- **`latest` 通道继续跳版**：本轮把声明对齐到 `0.1.5` 序列；`latest` 跳到 `0.1.6+` 时仍按 ADR-0003「人工复核并显式决策」处理，不做自动跟踪机制。
- **`session_read` 的 reasoning 可见性**：本轮明确不呈现；若后续需要，以新 Plan 处理（需同时决定输出体积与 `HistoryEntry.kind` 扩展）。

## 上下文

- [取证：0.1.2-rc.1 → 0.1.5-rc.1 兼容性](../../../../../.flow/dsh-plugin-0.1.5-audit/report.md)（逐包类型比对与真机复现全文）
- [审阅文件](../../../../../.flow/quest/2026-09-10-dsh插件适配新版本.md)
- [ADR-0003 内容搜索经上游 opt-in 工具与索引启用交付](../../../adr/0003-内容搜索经上游opt-in工具与索引启用交付.md)（版本对齐口径与 Consequences）
- [ADR-0002 会话管理能力以模型工具面交付](../../../adr/0002-会话管理能力以模型工具面交付.md)
- [ADR-0004 会话初始化上下文以系统消息注入](../../../adr/0004-会话初始化上下文以系统消息注入.md)
- [前序 Plan：dsh 插件适配新版本（0.1.2-rc.1 基线，含「待定：chunk 行移除」）](../../reference/2026-09-09-dsh插件适配新版本/spec.md)
- [前序 Plan 03：重装重启与真机冒烟（`file:` 硬链接经验）](../../reference/2026-09-09-dsh插件适配新版本/03-重装重启与真机冒烟.md)
- [上游语义文本抽取契约](../../../../../.temp/dsh-new/dsh-session-query/lib/types/extraction.d.ts)（`extractSessionEventText`）
- [领域语言](../../../CONTEXT.md)

## Issue

| #   | Issue                                                  | 状态        | 阻塞于 | 下一步         |
| --- | ------------------------------------------------------ | ----------- | ------ | -------------- |
| 01  | [历史文本化修复与 chunk 行去除](01-历史文本化修复.md)  | completed   | —      | /code-delivery |
| 02  | [依赖声明与文档对齐](02-依赖声明与文档对齐.md)         | completed   | —      | /code-delivery |
| 03  | [合入主分支并推送](03-合入主分支并推送.md)             | in_progress | 01, 02 | /code-delivery |
| 04  | [本地打包安装与真机冒烟](04-本地打包安装与真机冒烟.md) | pending     | 03     | /code-delivery |
