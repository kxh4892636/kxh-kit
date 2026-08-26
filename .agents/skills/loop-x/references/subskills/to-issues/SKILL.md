---
name: to-issues
description: 把一次上下文无法安全完成的工作维护为领域 plan——一份 spec 加一张 tracer-bullet issue 图, 落在 docs/{domain-name}/plans/.
argument-hint: "要拆分或推进什么工作?"
---

# To Issues

先完整读取 `/loop-x` 的 [`DOMAIN.md`](../../DOMAIN.md), 以其中的领域布局和 Plan 生命周期为权威约束. 下文的「校验」均指在工作区根目录执行 `node <loop-x-skill-dir>/script/check-domain.mjs .`.

两种调用方式:

- **建立与维护**——由 `/grill-with-docs` skill 驱动, 访谈中确认的内容就地落为 spec 和 issue;
- **推进**——领取可开始的 issue, 进入实现.

文档布局(`YYYY-MM-DD` 取 plan 创建日期):

```text
docs/{domain-name}/plans/{lifecycle}/YYYY-MM-DD-中文工作名/
├── story.md
├── spec.md
├── 01-中文标题.md
└── 02-中文标题.md
```

lifecycle 为 `active/`(进行中), `reference/`(可参考)或 `archived/`(已归档); 新 plan 一律落在 `active/`. story.md 是可选的用户故事集, 由 `/to-story` 维护; 不存在则忽略.

spec 承载问题, 方案, 状态和依赖图; 决策细节在 issue 和 ADR 中.

## 进入 Flow

完整读取 [`FLOW.md`](../../FLOW.md). 建立或维护时, 作为顶层 skill 直接调用便在确定 Plan 路径后、运行访谈或写入 spec/issue 前按共享协议自动进入固定的 `issues` 路径; 从 `/loop-x` 或 `/to-story` 接收到 flow context 时直接复用. 进入 Plan setup 步骤后先登记 `/to-issues=started`, 再只调用脚本返回的 `/grill-with-docs`; 子 skill 登记完成并返回本 skill 后, 复用同一 context 恢复工作. 达到下文完成标准后, 以 `spec.md` 为证据登记 `/to-issues=completed`, 再只执行脚本返回的下一步.

调用 `/grill-with-docs` 时传递当前 flow context 并标明它是 `/to-issues` 的 required child, 使其登记子步骤 receipt 而不另建主路径. 推进已通过 `/dev-gate` 的 Plan 时按共享协议领取 issue; `claim-issue` 与 `resume-issue` 直接进入 `ISSUE_FLOW`, 不触发 required child.

## 建立与维护

写入 spec 或 issue 前完整读取 [`TEMPLATE.md`](TEMPLATE.md), 以其中的模板和扩展规则为单一真源.

运行 `/grill-with-docs`, 每轮访谈确认的内容**就地**创建或更新文档:

1. **定域与查明事实**——从 `CONTEXT-MAP.md` 定位业务域, 工作落在**一个**域内; 跨域工作先在 map 中确认关系并选定主域, 或按域拆成多次拆分. 读取该域 `CONTEXT.md`, 相关 ADR / Workflow, 已有 story, spec, issue, commit 或 diff 等工作涉及产物.
2. **逐轮澄清, 就地落盘**: 按 rounds 批量询问 frontier;
   - 落盘的是确认后的结论, 不是对话记录; 每条结论当轮归入 spec.md 对应小节, 无对应小节的按模板扩展处理;
   - 可精确表述且可独立验收的工作 → 新 issue 文件(tracer-bullet 规则);
   - 固定明确 `/verifying` 针对 issue 使用哪些验收门禁;
3. **每轮结束校验不变量**(见状态协议), 继续 rounds 批量询问, 迭代到达成完成标准.

tracer-bullet 规则:

- 以一个完整的用户结果或业务能力为边界, 只贯穿实现该能力所需的层级;
- 在直接依赖成立后, 可以独立实现, 交付和验收;
- 从 `01` 按依赖序编号, 编号即稳定 ID;
- 每条直接依赖都说明原因和本 issue 消费的产物或契约;
- 用一个可独立判定的结果定义最小验收信号;
- 让每个 issue 更容易实现的 prefactoring 排最前——"Make the change easy, then make the easy change";
- 大范围机械重构是唯一例外: expand-contract 序列——expand → 按影响面分批 migrate, 每批一个 issue → contract 删除旧形态.

**完成标准:** 工作范围无遗漏, 每项交付责任只有一个归属 issue; 依赖只记录直接依赖且写明消费的产物或契约; 依赖图至少有一个根 issue, 无自环, 无环; 所有 issue 决策已澄清, 下一步均为 `/implement`, 状态均为 `pending`; 校验通过; 用户确认边界和依赖图.

## 推进

单个会话串行推进自己领取的 issue; 并发领取、状态流转、receipt、租约与恢复全部按 [`FLOW.md`](../../FLOW.md) 执行.

1. **定位 frontier**——读该域 `plans/active/` 下各 spec.md 的 issue 表, 找到 `pending` 且直接依赖全部 `completed` 的 issue; 多个可选时按用户已确认的优先级选择.
2. **交付或阻塞**——按共享协议领取并推进一个 issue. 当前 issue 完成或阻塞后, 本会话才领取下一项.
3. **全部完成**——与用户确认参考价值, 按 [`DOMAIN.md`](../../DOMAIN.md) 的生命周期约束将整个工作目录移入 `reference/` 或 `archived/`, 按共享协议同步 Plan, 再运行领域文档校验.
4. **新发现的工作**——开新 issue 或记入 spec 的 `待定` 节, 不在本 issue 内扩张范围; 需澄清的新工作回到建立与维护的 rounds 批量询问.

spec 的决策不原地反转: 难逆转的决策按 `/grill-with-docs` 的标准写入该域 `adr/`, spec 中标注被取代链接; 事实性更新可直接修改.
