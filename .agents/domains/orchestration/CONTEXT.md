# Orchestration

编排业务域：一个 pi TUI 会话（orchestrator）接住用户输入，判断它归已有 Plan 还是新 Plan，用 `orchestrator_dispatch` 交给对应 worker 推进，汇总 worker 的 `orchestrator_report`，并在用户明确决定后放行与归档。**它不产出业务交付物**，只承载"谁做、做到哪、谁放行"。

本域与各业务域的关系是单向只读：orchestrator 读取任何域的 Plan 与领域文档，但只写本域。业务域 Plan 的 note 由该域的 worker 写。

## Language

### 编排单位

**编排期**:
一段连续的编排工作，对应本域 `plans/` 下的一个运行时 Plan。一个编排期可以容纳多个业务域 Plan 的派工与回收。

**编排待办**:
编排期 Plan 里的 note，粒度是「需要编排方记住的未结事项」：待归属的输入、等用户回答的确认、追踪中的 Plan。结清即 `completed`，全部结清后本域自行 `move` 到 `archived`。
_Avoid_: 编排日志、审计流水

**归属判定**:
决定一条用户输入并入哪个 Plan 的判断：与该 Plan 的 note 有 `blocked_by` 依赖，或共享同一验收物（同一 PR、同一用户可见结果、同一 spec 章节）时为同一 Plan；相差很大的工作各自新 Plan，即使同域。
_Avoid_: 需求分类、意图识别

### 授权与放行

**放行**:
编排方把「某条 note 验证通过」作为一条 `pass` 输入下发给 worker，worker 收到后才可把该 note 置 `completed`。判断在编排方，落盘在 worker —— worker 有笔没印。
_Avoid_: 批准、通过审核

**派工**:
用 `orchestrator_dispatch` 把一个业务域 Plan 交给一个 worker session。同一 Plan 同一时刻只有一个 worker（`worker:plan` 同时 1:1），重复派工复用既有会话。
_Avoid_: 分配、ticket、工单

**刹车**:
不设并发上限时的替代手段：`orchestrator_workers` 列 live 清单、按 Plan 或全部中止、退出时自动收尾。
_Avoid_: 限流、配额

### 恢复

**启动对账**:
`session_start` 时把磁盘事实重新摆到编排方面前，分四类：被打断（`in_progress`）、在等人（`waiting` + `needs`）、可归档（全 `completed`）、未知（无 note 或只有 `pending`）。只提示，不采取行动。
_Avoid_: 自愈、自动恢复
