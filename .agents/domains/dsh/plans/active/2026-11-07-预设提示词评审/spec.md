# 预设提示词评审

## 目标

评审固定提示词的优化空间并落地定案修订；把 `ready` 改成按依赖关系分组的 todo 列表，补并行执行论述，在会话输入框上方提供可折叠的 ready 面板，并按策略收口 `notes.json` 的访问。

## 取证口径

- 目标：`packages/dsh-toolkit/src/nano-flow/prompt.md`（210 行 / 12,956 B；`dist/nano-flow/prompt.md` 同名同大小；作为固定系统提示按字面量注入，无变量）。
- 对照：`src/nano-flow/tools/read.ts`、`write.ts`、`check.ts`、`src/contract.ts` 默认上限、`src/nano-flow/scripts/check-domain.mjs`、随包 `skills/ask`、`do`、`kaizen`、`README.md`、`docs/dsh/CONTEXT.md`。
- 结论：有优化空间，重点在「触发条件缺失」与「重复」，不是细节密度。

## 结论摘要

详见 note 01（29 条评审）、note 04（`ready` 分组）与 note 05（GUI 面板）。P0 是 Plan 初始化触发、模式优先级、story/spec 契约、域根对齐、ask 护栏位置，以及删除工具清单与空节；P1 是其余重复与模糊表述；P2 是结构与体量。

## 当前进度

- note 01 完成（评审 29 条）。
- note 03 完成：`prompt.md` 按定案改写；ask / do skill、README、`runtime.test`、`assets.lock.json` 同步；9 个 markdown 改为 ASCII 标点；209 测试、构建、安装与新会话验证通过。
- note 04 完成：`dag.ts` 的 `todoGroups` 按 blocked_by 连通分量分组、组内拓扑排序；`ready` 输出未完成 notes 的组列表；`prompt.md` 新增「并行执行」小节；211 测试与构建通过。首版按依赖层分组已按用户口径纠正为「有依赖关系的 note 在同一组」。
- note 05 完成：宿主路由 `/api/toolkit/nano-flow-ready`、`readNanoFlowReady` 读取器、客户端 `conversation.input.dock` 的 `ReadyPanel`（默认折叠、3s 轮询、focus 刷新）；用户已确认真机显示。首次诊断出宿主 live session header 的 `agentPreset` 不可靠，已改为宿主只解析工作区/Plan、客户端按 projection 的 `agentPreset` 判断。219 测试与构建通过。
- note 06 完成（决策 A）：`notes.json` 访问收口采用 `tools.guard` + 包装 `ctx.fs`，保留 shell 等旁路并写明不是安全边界。
- note 08 实施完成（待真机验证）：轮转的 `rotated.add` 从事件回调移到压力检查通过后；`used` 改用 `projectedTokens ?? pressureTokens`；222 测试与构建通过；已安装，待重启验证 67% 会话在下一次 completed turn 轮转。
- 已打包并安装到 desktop profile：安装目录的 `dist/index.mjs` 与 `dist/nano-flow/prompt.md` 均与仓库 dist 同哈希；重启宿主后新会话生效。
- 未完成：note 02（迁移 dsh 域文档与旧 Plan）、note 07（`notes.json` 访问收口实施）、note 08 的真机轮转验证。
- 域根：dsh 已切到 `.agents/domains`，其 `CONTEXT.md` 与 `QUESTIONS.md` 目前是指向 `docs/dsh` 的迁移指针；旧 Plan 与 ADR 仍在原位，迁移见 note 02。

## 恢复入口

1. 读本 spec、note 01 的评审清单、note 04 的 `ready` 设计与 note 05 的面板设计。
2. 要收口 `notes.json`：按 note 07 实现 `tools.guard` + `ctx.fs` 包装并验证；边界见 note 06。
3. 要清账：按 note 02 选策略，把 `docs/dsh` 的域文档与旧 Plan 迁到新布局，处理相对链接。
4. 迁移后跑 `nano_flow_check` 的 `workspace`。

## 开放问题

- `docs/dsh` 的旧 Plan 保留为 Markdown 历史，还是迁到新布局（需处理相对链接）？
