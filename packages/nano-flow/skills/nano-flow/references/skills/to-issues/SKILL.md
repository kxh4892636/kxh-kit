---
name: to-issues
description: 跨会话推进或需要持久化检查点时，建立和维护可恢复的 spec、设计 frontier 与 tracer-bullet issue 图。
argument-hint: "要持久化什么长任务?"
---

# To Issues

## 建立或维护

1. **定域与取证**：定位业务域, 读取 CONTEXT、相关 ADR/Workflow 和已有 story、spec、issue、commit/diff。
2. **就地落盘**：创建/更新 spec 与 issue，按下方 tracer-bullet 规则拆分; 未明确事实纳入「待定」;
3. **确认**：按用户反馈反复迭代, 直至无反馈。
4. **校验**：从工作区根运行 `node <nano-flow-skill-root-dir>/scripts/check-domain.mjs .`.

## Tracer bullets

- 每个 issue 对应一个完整用户结果或业务能力，贯穿所需的所有层级。
- 直接依赖成立后可独立实现、交付和验收；每条依赖说明原因与消费的产物/契约。
- 降低后续实现难度的 prefactoring 排最前。
- 唯一例外是大范围机械重构：expand → 按影响面分批 migrate（每批一个 issue）→ contract 删除旧形态。

## 模板

### spec.md 模板

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

{尚不能精确表述为 issue 的未决问题、已知选项或证据、恢复条件; 澄清后 graduate 为 issue}

## 上下文

{通过路径或 URL 引用已有产物: PRD, story, spec, ADR, workflow, commit, diff 等; 域内引用使用从当前文件计算的相对路径}

## Issue

| #   | Issue                  | 状态    | 阻塞于 | 下一步         |
| --- | ---------------------- | ------- | ------ | -------------- |
| 01  | [{标题}](01-{标题}.md) | pending | —      | /code-delivery |
```

### issue 模板

```markdown
---
status: pending
blocked_by: ["\d\d"]
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

- {通过路径或 URL 引用相关产物: PRD, story, spec, ADR, workflow, commit, diff 等; 域内引用使用从当前文件计算的相对路径}

## 下一步

{决策已澄清: /code-delivery; 仍需澄清: /questing}

## 阻塞记录

{仅 status 为 blocked 时保留: 障碍与解除条件}

## 交付记录

{完成登记前填入并保留: 交付物与验证证据链接}
```

## 模板扩展

内容无法归入现有章节（**独特**），且缺少它会损失执行或验收信息（**必要**）时，根据内容新增拓展章节;
