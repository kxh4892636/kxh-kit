---
name: to-issues
description: 把一次上下文无法安全完成的工作维护为领域 plan——一份 spec 加一张 tracer-bullet issue 图, 落在 docs/{domain-name}/plans/.
argument-hint: "要拆分或推进什么工作?"
---

# To Issues

先完整读取 `/loop-x` 根目录的 `DOMAIN.md`, 以其中的领域布局和 Plan 生命周期为权威约束. 下文的「校验」均指在工作区根目录执行 `node <loop-x-skill-dir>/script/check-domain.mjs .`.

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

## 建立与维护

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

单个会话串行推进自己领取的 issue; 多个会话可以并行推进同一 Plan 中彼此独立且已满足直接依赖的不同 issue. 所有领取与状态流转必须经过 `/loop-x` 的 `script/flow.mjs`, 不直接手改运行中的 `status` 或 spec Issue 表.

1. **定位 frontier**——读该域 `plans/active/` 下各 spec.md 的 issue 表, 找到 `pending` 且直接依赖全部 `completed` 的 issue; 多个可选时按用户已确认的优先级选择.
2. **原子领取**——执行 `flow.mjs claim-issue --plan <plan-path> --issue <NN> --session <session-id>`. 成功后脚本同步 issue frontmatter 与 spec 视图并返回 `/implement`; 同一 issue 已被其他有效租约持有时领取失败.
3. **按 receipt 推进**——只执行脚本返回的 `next_skill` 或 `next_action`, 完成后使用 `record-issue` 登记结果和证据. 长任务用 `heartbeat-issue` 续租; 主动暂停用 `release-issue`; 租约失效后的接管用 `resume-issue`.
4. **完成或阻塞**——提交前先在 issue 的「交付记录」写入交付物和验证证据, 执行 `next_action: commit`, 再以 `--action commit --result committed` 登记; 脚本将 issue 标为 `completed` 并同步 spec. 真实障碍使用 `block-issue`, 记录原因与解除条件并释放租约. 当前 issue 完成或阻塞后, 本会话才领取下一项.
5. **全部完成**——与用户确认参考价值, 按 `/loop-x` 根目录 `DOMAIN.md` 的生命周期约束将整个工作目录移入 `reference/` 或 `archived/`, 运行 `flow.mjs sync-plan`, 再运行领域文档校验.
6. **新发现的工作**——开新 issue 或记入 spec 的 `待定` 节, 不在本 issue 内扩张范围; 需澄清的新工作回到建立与维护的 rounds 批量询问.

## 状态协议

持久化执行状态的来源是 issue frontmatter 的 `status:`; `.loop` 只保存运行租约, skill 游标和 receipt; spec.md 的 issue 表是从 frontmatter 推导的视图. `flow.mjs` 负责同步三者. spec 自身的 `status:` 是全函数聚合视图: 所有 issue 均为 `pending` 时是 `pending`; 所有 issue 均为 `completed` 时是 `completed`; 其余组合, 包括存在 `blocked`, 均为 `in_progress`.

### 流转

```text
pending ──领取──> in_progress ──交付物与验证证据齐备──> completed
                         │
                         └─真实障碍──> blocked ──障碍解除并恢复工作──> in_progress
```

每次流转由 `flow.mjs` 同时更新 issue frontmatter 和 spec Issue 表; spec 聚合状态随即重算. `completed` 是终态, 后续修正创建新 issue 并交叉链接.

### 状态

- `pending`: 尚未开始. 直接依赖全部完成时, 该 issue 可开始, 状态仍保持 `pending`, 直到实际领取.
- `in_progress`: 已经领取并开始工作.
- `blocked`: 存在阻止继续工作的真实障碍; 同时记录障碍和解除条件.
- `completed`: 交付物已经产生, 验收已有证据; 同时记录产物与证据链接.

### 不变量

- 可执行性由直接依赖的状态推导, 依赖完成只改变可执行性.
- 同一 issue 同时至多有一个有效租约; 不同可执行 issue 的租约彼此独立.
- 每个 issue 只使用一个上述状态.
- `blocked` issue 带有障碍和解除条件.
- `completed` issue 带有交付物和验证证据, 且内容冻结: 不原地修改, 后续修正开新 issue 并交叉链接.
- spec 的决策不原地反转: 难逆转的决策按 `/grill-with-docs` 的标准写入该域 `adr/`, spec 中标注被取代链接; 事实性更新可直接修改.
- 移动 plan 目录(生命周期转换)时不动 `status:`——两条生命周期相互独立, 约束见 `/loop-x` 根目录的 `DOMAIN.md`.
- 本协议只处理 Plan 内 issue 竞争, 不锁定或协调全局领域文件.

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

{执行该工作所需的环境信息: 例如项目管理工具, 本地开发环境, CI/CD 流水线, 运行时环境, 三方服务等}

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

## 阻塞记录

{仅 status 为 blocked 时保留: 障碍与解除条件}

## 交付记录

{仅 status 为 completed 时保留: 交付物与验证证据链接}
```

## 模板扩展

模板章节是最小集合, 不是封闭集合. 允许根据工作的性质添加模板未固定的章节, 但新增章节必须**真正独特且必要**:

- **独特**——内容无法归入任何现有章节, 语义不重叠;
- **必要**——缺少它, 该工作的执行或验收会缺失关键信息.

两条同时满足才添加, 章节标题使用中文; 否则归入现有章节或省略.
