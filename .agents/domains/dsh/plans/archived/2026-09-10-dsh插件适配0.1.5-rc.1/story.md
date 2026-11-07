# dsh插件适配0.1.5-rc.1

> 由 spec 迁移生成（2026-11-07）；原 Plan 无独立 story。

## US-001 dsh插件适配0.1.5-rc.1

`packages/dsh-nested-skill` 与 `packages/dsh-session-manager` 按 DSH `0.1.2-rc.1` 写成；宿主 `latest` 发布通道已跳到 `0.1.5-rc.1`（`dsh.log` `2026-09-10T14:24:58Z`）。逐包比对 0.1.2-rc.1 tarball 与运行中 0.1.5-rc.1 安装树的 `lib/types/*.d.ts` 后确认：**没有任何导致插件加载失败或工具注册失败的破坏性变更**（`dsh-skill` 零差异；`dsh-fs`/`dsh-tools`/`dsh-llm`/`dsh-session-query` 均为增量；`dsh-session-projection.stateOf(session, key)`、`systemPrompt.section(section: PromptSection)`、`TOOL_RALPH 2700`/`TOOL_SUBAGENT 2800`、`session-query-sqlite` 的 `Config.path`/`openAt` 均未变）。9 个自有 `session_*` 工具、5 个上游搜索工具与任意深度 skill 发现在 0.1.5-rc.1 上仍工作。

真正需要处理的是四件事：

1. **`session_read` 的 assistant 正文恒为空（真实缺陷，本次真机复现）**：`session-eccb15ed…` 5 条 assistant 全为 `""`，`session-538619f2…` 14 条全为 `""`，窗口里只剩 `[event tool/call]` 一类占位行。根因叠加两条：① `src/host.ts` 的 `eventTextOf` 只读 `data.content[].text` 与 `data.texts`，而 `assistant/message` 的数据形状（0.1.2 与 0.1.5 相同）是 `{ turn, step, message: AssistantMessage, usage?, interrupted? }`，正文在 `data.message.content[].text`；② 0.1.2 上靠 `chunkrow/*` 打包行兜底显示正文，而 0.1.5 **移除了 `@deepseek-ai/dsh-session/chunk-rows`**，该兜底路径变成不可达死代码。
2. **唯一的破坏点即 chunk 行移除**：`SessionHistoryRecord` 的 `chunks` 变体消失，只剩 `{ type: "event", event }`；`HistoryRecordVariantLike` 的 `{ type: "chunks" }` 分支与 `ChunkRowEventLike`/`chunkEventOf`/`isChunkRowEvent` 成为死代码（前序 Plan 明确把该适配列为「待定」，恢复条件是「`latest` 跳到含该变更的版本」——已发生）。
3. **依赖声明漂移**：两个包 peer 仍是 `^0.1.2-rc.1`，而按 semver 预发布规则 `0.1.5-rc.1` **不满足**该范围（预发布可比性只限同 `major.minor.patch` 元组）；`dsh-session-manager` 的 `@deepseek-ai/dsh-tool-session-query` 也是 `^0.1.2-rc.1`，profile 实装 `0.1.2-rc.1`（该包 `0.1.5-rc.1` 已发布）。`file:` 安装不校验 peer，因此现在不阻断加载，但下一次 `dsh plugin --profile web add` 会按旧范围把旧版工具包装回。
4. **文档与声明自相矛盾**：两个 README 仍写「兼容 DSH 0.1.2-rc.1」；`docs/dsh/adr/0003` 正文与 Consequences 的版本字面量仍是 `0.1.2-rc.1`/`^0.1.2-rc.1`，而该 ADR 自身要求「通道跳版后需人工复核并显式决策」。

约束：只承诺 `latest` 发布通道（当前 `0.1.5-rc.1`）正确；不引入新领域术语、不新增 ADR；生效需要同步 profile 快照并重启 3080 实例，会中断当时正在执行的会话（放在交付最后一步）。
