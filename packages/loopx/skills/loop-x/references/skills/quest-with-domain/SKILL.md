---
name: quest-with-domain
description: 维护领域模型：拷问设计并同步已确认的领域术语、跨域关系与 ADR；当讨论需要改变领域 context 文档或领域决策记录时使用。
---

完整读取 `<loop-x-skill-dir>/references/FLOW.md`。顶层直接调用时, 在执行 skill 前直接执行 `enter-plan` 进入主流程；收到 Flow context 时直接复用。

# Quest with Domain

使用 `/questing` 的 rounds 与 frontier 打磨 domain model，并在结论成立的同一轮写入其权威位置。读取领域语言供其他任务使用不触发本 skill。

## 1. 进入并定域

完整读取 `<loop-x-skill-dir>/references/DOMAIN.md`。从工作区根 `CONTEXT-MAP.md` 定位所有相关业务域，再读取对应 `CONTEXT.md` 与相关 ADR；归属仍是用户决策时提出带推荐答案的问题。

相关业务域、跨域关系和当前 Flow 位置均已确定时，本步骤完成。

## 2. 清空设计 frontier

以现有 glossary 和 ADR 为约束运行 `/questing`：

- 术语冲突或 overloaded 时，要求在现有 canonical term 与新概念之间作出明确区分。
- 关系或规则含糊时，用具体 scenario 与 edge case 暴露边界。
- 用户对现状的描述可由代码验证时，检查实际实现并把矛盾作为 frontier 问题。
- 环境事实由 agent 检索；trade-off 与领域选择由用户决定。

frontier 为空、代码与口头模型的矛盾已解决或明确记录、用户确认共同理解时，本步骤完成。

## 3. 就地维护语言

出现已确认的新业务域、术语或跨域关系时，读取 [`CONTEXT-FORMAT.md`](CONTEXT-FORMAT.md) 并在当轮更新：

- 各产物的归属规则以 CONTEXT-FORMAT.md 为权威。

每项确认内容恰好有一个权威位置，map 链接可解析，glossary 中的 canonical term 与 `_Avoid_` 词互不冲突时，本步骤完成。

## 4. 记录有价值的 ADR

出现架构形态、跨域集成、技术锁定、scope owner 或其他长期 trade-off 时，完整读取 [`ADR-FORMAT.md`](ADR-FORMAT.md)。按其中的资格门槛逐项判断；达标的决策写入唯一 owner 的 ADR，未达标的候选不创建文档。

每个候选均有判断结果，所有达标决策只记录一次且理由与已确认 trade-off 一致时，本步骤完成。

## 5. 验证并返回

修改领域文档后，从工作区根执行：

```powershell
node <loop-x-skill-dir>/script/check-domain.mjs .
```

校验通过后，本步骤完成。
