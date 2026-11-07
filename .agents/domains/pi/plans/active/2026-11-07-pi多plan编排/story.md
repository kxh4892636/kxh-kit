# pi 多 plan 编排

## 原始想法

> 阅读 dsh-superagent-prototype, 判断其思路能否与 Nano Flow 融合; 预期 orchestrator 维护一个 plan, worker 也各有 plan, worker 完成后结束其 plan。
> 最终定案: 移除 ticket; orchestration 有运行时 plan; worker:plan 同时 1:1; 用 SDK 起 worker session; 并行不设上限。

（用户输入, 2026-11-07, 共 12 轮设计讨论）

## 角色

- **pi 使用者**: 在 pi TUI 里边工作边并行推进多个 plan, 希望 worker 干活时不占自己的上下文, 并能在关闭 pi 后从磁盘接着来。
- **pi 工具包维护者**: 维护 `packages/pi-toolkit`, 需要把 Nano Flow 从"单会话串行"扩展成"编排 + 多执行会话", 且不破坏既有 Plan/story/spec/notes 契约。

## 故事

### 授权与分工

#### US-001 orchestrator 与 worker 的分工

作为 pi 使用者, 我给出一个需求, orchestrator 判断它归已有 plan 还是新建 plan, 界面上只跟它打交道。

- [ ] orchestrator 是当前 TUI 会话; worker 是它创建的独立 session, 不占用我的上下文
- [ ] 一切需要我确认的事 (提问、验收、扩范围) 只在 orchestrator 出现, worker 擅自决定不了
- [ ] worker 只能把 note 推到 `waiting`, 不能自己写 `completed`

#### US-002 plan 归属

作为 pi 使用者, 同一件事的后续输入自动并进同一个 plan, 不相干的事各开一个 plan。

- [ ] 与某 plan 的 note 存在 `blocked_by` 依赖 → 同一 plan
- [ ] 无依赖但共享同一验收物 → 同一 plan (由 orchestrator 判断)
- [ ] 相差很大的工作 → 各自新 plan, 即使同域

### 状态与恢复

#### US-003 preparing unit 的等待语义

作为 pi 使用者, 我能一眼看出某条 note 是在等我的回答, 还是等验收。

- [ ] note 状态从 `awaiting_verification` 改为 `waiting`
- [ ] `waiting` 必带 `needs: "answer" | "review"`
- [ ] 旧 plan 的 `awaiting_verification` 自动按 `needs: "review"` 迁移

#### US-004 关闭 pi 之后能接着来

作为 pi 使用者, 我关掉 pi 再打开, 能在我选中的那个 plan 上接着来。

- [ ] 进入会话**不**自动播报、不自动跑一轮模型
- [ ] `resume <plan>` 是选中 + 恢复的唯一入口: 状态行、可推进队列、待回答/待验证、阻塞
- [ ] 崩溃凭据在该 plan 命中时随 `resume` 出现, 展示后只移除该 plan 的条目; `/orchestrator status` 看全量并清整档
- [ ] 恢复只提示不行动; 清理孤儿 plan 由我手动决定

### 执行

#### US-005 worker 并行

作为 pi 使用者, 一个 plan 里没有依赖的 note 由 worker 并行推进。

- [ ] worker 可用 subagent 并行; 并行不设上限
- [ ] 写回仍由 worker 串行 (`status` / `update` / `complete`)
- [ ] 并行判据: 无依赖边且"触及范围"不重叠

## 约束与澄清

- 移除 Ticket: 授权由我的输入天然给出, 无多来源、无多人、无策略版本。
- `worker:plan` 是**同时 1:1**: 同一时刻一个 plan 只有一个 worker, 但会话可重建接管同一 plan。
- 不设 daemon、不做无人值守、不做文件 outbox; orchestrator 就是我的 TUI 会话。
- 不设并发上限, 但需要 live 清单与一键中止。
- 参考 dsh-superagent 而不照搬: 取授权边界、结构化报告、`waiting`/`needs`、push; 丢 Source/Thread/Subscription/Policy version/面板。

## 迷雾

无。六项交付 (探针、两处 nano-flow 改动、两套工厂、bridge、按 Plan 恢复、orchestration 域) 与错误处理七条均由 2026-11-07 讨论定案。

## 上下文

- [spec](spec.md)
- [pi 业务域 CONTEXT](../../../CONTEXT.md)、[QUESTIONS](../../../QUESTIONS.md)、[ADR-0005](../../../adr/0005-NanoFlow迁移到pi-toolkit.md)
- 参考: dsh-superagent-prototype 的 `docs/001-domain.md`、`docs/007-architecture.md`
