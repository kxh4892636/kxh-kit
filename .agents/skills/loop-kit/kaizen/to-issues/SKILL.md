---
name: to-issues
description: 把一次上下文无法安全完成的工作维护为领域 plan——一份 spec 加一张 tracer-bullet issue 图, 落在 docs/{domain-name}/plans/.
argument-hint: "要拆分或推进什么工作?"
disable-model-invocation: true
---

# To Issues

两种调用方式:

- **建立与维护**——由 `/grill-with-docs` skill 驱动, 访谈中确认的内容就地落为 spec 和 issue;
- **推进**——领取可开始的 issue, 进入实现或继续澄清.

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

## 建立与维护

运行 `/grill-with-docs`, 每轮访谈确认的内容**就地**创建或更新文档, 不攒批:

1. **定域与查明事实**——从 `CONTEXT-MAP.md` 定位业务域, 工作落在**一个**域内; 跨域工作先在 map 中确认关系并选定主域, 或按域拆成多次拆分. 读取该域 `CONTEXT.md`, 相关 ADR / Workflow, 已有 story, spec, issue, commit 或 diff 等工作涉及产物.
2. **逐轮澄清, 就地落盘**:
   - 落盘的是确认后的结论, 不是对话记录; 每条结论当轮归入 spec.md 对应小节, 无对应小节的按模板扩展处理;
   - 可精确表述且可独立验收的工作 → 新 issue 文件(tracer-bullet 规则);
   - 固定明确 `/verifying` 针对 issue 使用哪些验收门禁;
3. **每轮结束校验不变量**(见状态协议), 迭代到用户批准整体边界和依赖图.

tracer-bullet 规则:

- 以一个完整的用户结果或业务能力为边界, 只贯穿实现该能力所需的层级;
- 在直接依赖成立后, 可以独立实现, 交付和验收;
- 从 `01` 按依赖序编号, 编号即稳定 ID;
- 每条直接依赖都说明原因和本 issue 消费的产物或契约;
- 用一个可独立判定的结果定义最小验收信号;
- 让每个 issue 更容易实现的 prefactoring 排最前——"Make the change easy, then make the easy change";
- 大范围机械重构是唯一例外: expand-contract 序列——expand → 按影响面分批 migrate, 每批一个 issue → contract 删除旧形态.

**完成标准:** 工作范围无遗漏, 每项交付责任只有一个归属 issue; 依赖只记录直接依赖且写明消费的产物或契约; 依赖图至少有一个根 issue, 无自环, 无环; 用户确认边界和依赖图.

## 推进

一个会话可以推进多个 issue, 但**串行执行**——完成或阻塞当前 issue 后才回到第 1 步领取下一个.

1. **定位 frontier**——读该域 `plans/active/` 下各 spec.md 的 issue 表, 找到 `pending` 且直接依赖全部 `completed` 的 issue; 多个可选时与用户确认优先级.
2. **领取**——frontmatter `status` 改为 `in_progress`, 同步 spec 的 issue 表.
3. **按就绪度分流**——决策已澄清, 可直接构建的进入 `/implement`; 仍需澄清的进入 `/grill-with-docs`, 澄清结果就地更新该 issue(及 spec).
4. **完成**——`status` 改为 `completed`, 记录交付物和验证证据链接, 同步 spec 的 issue 表. 全部 issue 完成后与用户确认参考价值, 按 `DOMAIN.md` 的生命周期约束将整个工作目录移入 `reference/` 或 `archived/`.
5. **新发现的工作**——开新 issue 或记入 spec 的 `待定` 节, 不在本 issue 内扩张范围.

## 状态协议

状态的唯一来源是 issue frontmatter 的 `status:`; spec.md 的 issue 表是从 frontmatter 推导的视图, 状态变更时同步更新. spec 自身的 `status:` 是聚合视图: 任一 issue 进行中即 `in_progress`, 全部 `completed` 即 `completed`.

### 状态

- `pending`: 尚未开始. 直接依赖全部完成时, 该 issue 可开始, 状态仍保持 `pending`, 直到实际领取.
- `in_progress`: 已经领取并开始工作.
- `blocked`: 存在阻止继续工作的真实障碍; 同时记录障碍和解除条件.
- `completed`: 交付物已经产生, 验收已有证据; 同时记录产物与证据链接.

### 不变量

- 可执行性由直接依赖的状态推导, 依赖完成只改变可执行性.
- 每个 issue 只使用一个上述状态.
- `blocked` issue 带有障碍和解除条件.
- `completed` issue 带有交付物和验证证据, 且内容冻结: 不原地修改, 后续修正开新 issue 并交叉链接.
- spec 的决策不原地反转: 难逆转的决策按 `/domain-modeling` 的标准写入该域 `adr/`, spec 中标注被取代链接; 事实性更新可直接修改.
- 移动 plan 目录(生命周期转换)时不动 `status:`——两条生命周期相互独立, 约束见根 `DOMAIN.md`.

## spec.md 模板

```markdown
---
status: pending
---

# {工作名}

## 问题

{用户要得到的结果, 已知约束}

## 方案

{保持在设计层级}

## 已排除的备选

- {方案}: {拒绝理由}

## 实施决策

{模块, 接口, schema, 契约等设计层级内容; 决策密度高的片段(state machine, schema, type shape)可内联并注明出处}

## 工作环境

{执行该工作所需的环境信息: 例如项目管理工具, 本地开发环境, CI/CD 流水线等}

## 范围

{做什么}

## 非范围

{不做什么}

## 待定

{尚不能精确表述为 issue 的部分; 澄清后 graduate 为 issue}

## 上下文

{通过路径或 URL 引用已有产物: PRD, story, spec, ADR, workflow, commit, diff 等; 域内文档使用 ../../ 相对路径}

## Issue

| #   | Issue                  | 状态    | 阻塞于 | 下一步     |
| --- | ---------------------- | ------- | ------ | ---------- |
| 01  | [{标题}](01-{标题}.md) | pending | —      | /implement |
```

## issue 模板

```markdown
---
status: pending
blocked_by: []
---

# {标题}

## 交付

{用户可感知的结果}

## 范围

{做什么, 不做什么}

## 直接依赖

- {NN}: {原因}; 消费其 {产物或契约}

## 验收

- [ ] {可独立判定的最小结果}

## 上下文

- {通过路径或 URL 引用相关产物: PRD, story, spec, ADR, workflow, commit, diff 等; 域内文档一律 ../../ 相对路径}

## 下一步

{决策已澄清: /implement; 仍需澄清: /grill-with-docs}
```

## 模板扩展

模板章节是最小集合, 不是封闭集合. 允许根据工作的性质添加模板未固定的章节, 但新增章节必须**真正独特且必要**:

- **独特**——内容无法归入任何现有章节, 语义不重叠;
- **必要**——缺少它, 该工作的执行或验收会缺失关键信息.

两条同时满足才添加, 章节标题使用中文; 否则归入现有章节或省略.
