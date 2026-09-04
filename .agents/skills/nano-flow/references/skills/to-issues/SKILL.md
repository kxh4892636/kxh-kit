---
name: to-issues
description: 长程任务的可恢复状态：持续维护 spec、设计 frontier 与 tracer-bullet issue 图；当工作需要跨会话推进，或单会话内仍需持久化检查点时使用。
argument-hint: "要持久化并推进什么长任务?"
---

# To Issues

完整读取 `<nano-flow-skill-root-dir>/references/DOMAIN.md`，以其中的领域布局与 Plan 生命周期为权威约束。

## 判断是否跳过

提供 FLOW 上下文时，如果工作是需持久化推进的长程任务，向用户推荐继续执行，反之推荐跳过，等待用户确认。
未提供 FLOW 上下文时，直接执行。

## 建立或维护

写入 spec 或 issue 前完整读取 [`TEMPLATE.md`](TEMPLATE.md), 以其中的模板和扩展规则为单一真源.

1. **定域与查明事实**——从 `CONTEXT-MAP.md` 定位业务域, 工作落在**一个**域内; 跨域工作先在 map 中确认关系并选定主域, 或按域拆成多次拆分. 读取该域 `CONTEXT.md`, 相关 ADR / Workflow, 已有 story, spec, issue, commit 或 diff 等工作涉及产物.
2. **就地落盘**: 根据事实就地创建或更新 `spec.md` 与 `issue.md`;
   - 落盘内容是确认后的结论, 不是对话记录; 无对应小节的按模板扩展处理;
   - 使用**tracer-bullet 规则**创建 issue 文件;
3. **用户确认**：反复确认并迭代，直至通过；
4. **校验并交接**：从工作区根运行 `node <nano-flow-skill-root-dir>/scripts/check-domain.mjs .`。

tracer-bullet 规则:

- 以一个完整的用户结果或业务能力为边界, 只贯穿实现该能力所需的层级;
- 在直接依赖成立后, 可以独立实现, 交付和验收，每条直接依赖都说明原因和本 issue 消费的产物或契约;
- 用一个可独立判定的结果定义最小验收信号;
- 让每个 issue 更容易实现的 prefactoring 排最前——"Make the change easy, then make the easy change";
- 大范围机械重构是唯一例外: expand-contract 序列——expand → 按影响面分批 migrate, 每批一个 issue → contract 删除旧形态.

**完成标准:** 工作范围无遗漏, 每项交付责任只有一个归属 issue; 依赖图至少有一个根 issue, 无环; 用户确认边界和依赖图正确；校验通过，全部 issue 为 `pending`；仅凭领域文档、Plan 与 Flow 运行态即可恢复工作

## 推进 Plan

1. 从 `plans/active/` 的 spec 派生表定位 `pending` 且直接依赖全部 `completed` 的 frontier；有多个候选时使用用户已确认的优先级。
2. 领取一个 issue，在同一 session 内交付或形成真实 blocked 结果；当前 issue 结束后才领取下一个。
3. 新发现的事实更新 spec；新发现的工作建立新 issue，尚不能精确表述的设计 frontier 进入 spec「待定」。当前 issue 的边界保持不变，符合 ADR 资格的长期 trade-off 由 `/quest-with-domain` 写入领域文档。
4. 每次暂停前同步 issue 状态、spec 派生视图与证据；恢复时只信任文件与运行态，不依赖先前对话。
5. 全部 issue 完成后与用户确认参考价值，把整个 Plan 移入 `reference/` 或 `archived/`，并重新运行领域校验。

**完成标准:** 一个领取结果有且只有一个终态、状态与 spec 派生视图一致、证据链可复核时，本轮推进完成。
