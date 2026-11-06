# 预设提示词评审

## 目标

评审固定提示词的优化空间并落地定案修订；同时把 `ready` 改成按依赖关系分组的 todo 列表，补并行执行论述。

## 取证口径

- 目标：`packages/dsh-toolkit/src/nano-flow/prompt.md`（210 行 / 12,956 B；`dist/nano-flow/prompt.md` 同名同大小；作为固定系统提示按字面量注入，无变量）。
- 对照：`src/nano-flow/tools/read.ts`、`write.ts`、`check.ts`、`src/contract.ts` 默认上限、`src/nano-flow/scripts/check-domain.mjs`、随包 `skills/ask`、`do`、`kaizen`、`README.md`、`docs/dsh/CONTEXT.md`。
- 结论：有优化空间，重点在「触发条件缺失」与「重复」，不是细节密度。

## 结论摘要

详见 note 01（29 条评审）与 note 04（`ready` 分组）。P0 是 Plan 初始化触发、模式优先级、story/spec 契约、域根对齐、ask 护栏位置，以及删除工具清单与空节；P1 是其余重复与模糊表述；P2 是结构与体量。

## 当前进度

- note 01 完成（评审 29 条）。
- note 03 完成：`prompt.md` 按定案改写；ask / do skill、README、`runtime.test`、`assets.lock.json` 同步；9 个 markdown 改为 ASCII 标点；209 测试、构建、安装与新会话验证通过。
- note 04 完成：`dag.ts` 的 `todoGroups` 按 blocked_by 连通分量分组、组内拓扑排序；`ready` 输出未完成 notes 的组列表；`prompt.md` 新增「并行执行」小节；211 测试与构建通过。首版按依赖层分组已按用户口径纠正为「有依赖关系的 note 在同一组」。
- 未完成：note 02（迁移 dsh 域文档与旧 Plan）。
- 域根：dsh 已切到 `.agents/domains`，其 `CONTEXT.md` 与 `QUESTIONS.md` 目前是指向 `docs/dsh` 的迁移指针；旧 Plan 与 ADR 仍在原位，迁移见 note 02。

## 恢复入口

1. 读本 spec、note 01 的评审清单与 note 04 的 `ready` 设计。
2. 要清账：按 note 02 选策略，把 `docs/dsh` 的域文档与旧 Plan 迁到新布局，处理相对链接。
3. 迁移后跑 `nano_flow_check` 的 `workspace`。

## 开放问题

- `docs/dsh` 的旧 Plan 保留为 Markdown 历史，还是迁到新布局（需处理相对链接）？
