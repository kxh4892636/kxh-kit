# Orchestration

编排业务域：一个 pi TUI 会话（orchestrator）接住用户输入，判断它归已有 Plan 还是新 Plan，用 `orchestrator_command` 交给对应 worker 推进，按需用 `orchestrator_state` 拉账本摘要，并在用户明确决定后放行与归档。**它不产出业务交付物**，只承载"谁做、做到哪、谁放行"。

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

**编排方职责**:
只做三件事：判定归属（并入 / 新建 Plan）、派工与转达（`orchestrator_command` 的 dispatch / pass / rework / answer / fact / abort）、呈现 worker 结论并收集用户确认；代码调研、方案对比、实现、跑测试、复核一律外移给 worker。白名单只有 `orchestrator_read` / `orchestrator_write` / `orchestrator_check` / `orchestrator_state` / `orchestrator_command` / `ask_questions`；这不是“靠自觉”的约定，而是启用时把活跃工具集收敛成这六个，宿主的 `read` / `bash` / `edit` / `write` / web 在编排方会话里不可调用（模式关后恢复到配置层默认集：`defaultTools` / `--tools` 语义与首次收敛前记下的活跃集的并集，不是运行时快照）。
_Avoid_: 编排方顺手调研、编排方代为验证

**提交**:
worker 完成一条 note、校验通过后立刻 `git commit` 一次（message 首行带 note id），commit hash 写进该 note 的 evidence。编排方没有 `bash`，不代办提交，只在复核时读 evidence 里的 hash。
_Avoid_: 攒一批再提、编排方代提

**派工判据**:
已有对口 Plan（同域、同一验收物、或与现有 note 有 `blocked_by` 关系）则派现有 worker，同一 Plan 复用同一会话；没有则先 `init` 新 Plan 再派新 worker。调研类输入同样适用，不因“只是查一下”而在编排方内做。
_Avoid_: 临时会话、绕过 Plan 直接问模型

### 授权与放行

**放行**:
编排方把「某条 note 验证通过」作为一条 `pass` 输入下发给 worker，worker 收到后才可把该 note 置 `completed`。判断在编排方，落盘在 worker —— worker 有笔没印。依据是 worker 的 report（账本里的 `report.filed`，用 `orchestrator_state` 拉）与 note evidence（命令与关键输出），编排方只摘录呈现，不重跑。授权本身是账本事件 `note.pass`，不是内存集合，重启后靠重放恢复。
_Avoid_: 批准、通过审核

**派工**:
用 `orchestrator_command`（`op: "dispatch"`，默认）把一个业务域 Plan 交给一个 worker session。`worker:plan` 是 **1:N**：一个 Plan 可同时挂多个 worker，一个 worker 领一**组** note；同一组重复派工复用既有会话，不同组各起一个。入队即返回（拒绝串行阻塞），投递落成 `input.sent` 事件；report 只落 `report.filed`，不推给模型。会话取用优先级：**live 句柄 → 磁盘恢复 → 新建**（会话 id 由工作键哈希得到，重启后同一组能续上；作废的键换一代会话，见「会话落盘」）。
_Avoid_: 分配、ticket、工单、一个 Plan 只能一个 worker

**会话落盘**:
两种 worker（Plan worker 与临时 worker）的会话都是磁盘上的 jsonl，会话 id 由工作键（`<plan 目录>::<组>` 或 `temp:<id>`）哈希得到，所以映射能从磁盘重建；状态目录的 `workers.json` 只是加速与作废登记，丢了也能靠会话 id 重扫回来。启动**不**自动挂回任何 worker，恢复只在 `dispatch` 命中同一个键时发生。`abort` 或超时登记作废：临时 id 再派报错（换一个 id），Plan/组的键换下一代会话 id（旧 jsonl 留作历史）。
_Avoid_: 内存会话、重启即失忆、启动自动恢复全部 worker

**组**:
一次派工覆盖的一批 note，组内互相无 `blocked_by` 依赖；组标识由 note id 排序串稳定生成，参与句柄键（`<plan 目录>::<组标识>`）。`blocked_by` 是硬判据，“触及文件不重叠”只是软建议，由 worker 自行遵守并上报冲突。侧栏把一个组展开成**派工种子 ∪ 双向依赖闭包**：种子是派工时给的 `notes`，闭包把“它依赖的 / 依赖它的”未完成 note 一并列入（不穿过已完成的 note），所以 `45` 在跑时依赖它的 `46` 也显示在同一组；同一个 note 落入多个闭包时只归组键排序最前的组、行尾标 `↔`，无派工且不在任何闭包里的落「未分组」。
_Avoid_: 把“组”理解成只能并行的同层 note、重合 note 在多个组里重复出现
_Avoid_: 批次、分片、一条 note 一个 worker

**插话**:
`orchestrator_command` 的 `delivery` 参数，与 `kind` 正交：`queue`（默认）追加成 `followUp`，worker 当前轮跑完再消化；`steer` 走 `session.steer()` 插入当前运行，worker 下一次 LLM 调用前就换方向；worker 空闲时没有可插入的运行，`steer` 退化为 `prompt()` 并在返回值里标成 `delivered: "prompt"`。不使用 `nextTurn`（不落盘、进程退出即丢）。每次投递都落成账本里的 `input.sent`（种类 / 方式 / 摘要 / 时刻），`orchestrator_state` 逐行展示；收到插话的 worker 必须把“谁说的 / 为什么改”写进对应 note 的执行检查点。要硬停整个 worker 用 `orchestrator_command` / `orchestrator_state` 的 `op: "abort"`，不把中止混进 dispatch。
_Avoid_: 打断、抢占、nextTurn

**临时 worker**:
没有 Plan 的一次性 worker：只在 `plan` 与 `lockedPlan` 都缺失时起，工具面 = 宿主工具 + 只读 `orchestrator_read` + `orchestrator_report`（无写工具、无 `orchestrator_check`），句柄键 `temp:<id>`，一轮 settle 后立即 `disposeEntry` + 摘除。**它就是一个普通的 pi 会话**：有 jsonl，用 `worker=temp:<id>` 再派能续上历史；被 `abort` / 超时后该 id 作废，再派直接报错。用于一次性/探索性提问，结论由编排方转呈；建 Plan 需用户明确同意。
_Avoid_: 聊天模式、无上下文会话、随手派个临时工

**子 worker**:
worker 自己用受限的 `orchestrator_dispatch` 派出的一层会话（`depth 1`）：有宿主文件工具、只读 `orchestrator_read` 与 `orchestrator_report`，**改不了 `notes.json`**（无 `orchestrator_write`），也没有 `dispatch`（不再往下派）。键 `<上级路由键>/sub:<n>`，一轮 settle 或超时就摘除；report 与超时只注入上级 worker 的会话，编排方看不到它的句柄。宿主子代理包已卸载，并行只留这条链路。
_Avoid_: subagent、子任务、第二层 worker、worktree 分身

**超时**:
两个判据都由**代码定时器扫投影**得出，不依赖模型回合：最老一条未消费输入超过 `inputStuckMs`（默认 10 分钟），或距最后进展（派工 / 输入 / report）超过 `workerTimeoutMs`（默认 30 分钟，report 即续期）。到点 `abort` → 摘除句柄 → `dispose` → 落 `timeout` 与 `worker.exit` 事件；不代写 note 状态，下次派工是干净的新会话。
_Avoid_: 前台等待、轮询 jobId、按任务总量计时的超时

**worktree 派工**:
**Plan worker 默认隔离**：派工时建 `.worktrees/<名字>`（自动命名 `note-<id>` / `grp-<id-id>` / `plan`）、分支 `wt/<名字>`，并先在该目录各自 `pnpm install`（建 worktree 或装依赖失败就**中止派工**，worker 不许跳过测试，也不降级回主工作区）。临时 worker 默认不建，需要时显式 `worktree: true`；`worktree: false | "<名字>"` 仍支持。Plan 仍锚定主工作区绝对路径，`notes.json` 只有主工作区一份。worker 完成前自己 rebase 到主分支最新提交并在 report 里写明可 `--ff-only` 合并。**合并与回收由代码做**（不经模型、不需编排方派工）：worker 终态后校验分支可 ff-only → `git merge --ff-only wt/<名字>` → 删 worktree 与分支 → 落 `worker.merged`；不可 ff-only → **不合并、保留现场**，落 `worker.merge_blocked`（含现场路径），`orchestrator_state` 里标 `✗` 等人工处理。合并串行化：主工作区同一时刻只允许一个 merge（进程内互斥 + 锁错误重试），避免两个 worktree 并发插队；abort / 超时**不删** worktree。
_Avoid_: 真左右分栏式隔离、共享 node_modules、worker 自行删 worktree、编排方手工跑合并、rebase 冲突时硬推

**刹车**:
不设并发上限时的替代手段：`orchestrator_state` 列 live 清单、按 Plan 或全部中止、退出时自动收尾。
_Avoid_: 限流、配额

**上报**:
worker 的 `orchestrator_report` 只落账本事件 `report.filed`（`worker` / `note` / `outcome` / `summary` / `question?` / `evidence?`，都截短），**不注入编排方会话**；编排方需要时调 `orchestrator_state`，读一次落 `state.pulled` 把未读清零，所以“未读 report”跨重启成立。旧的 outbox / `reports-pending.json` 重试机制随之删除：账本是记录，不需要重新投递。`orchestrator.wakeOnReport` 只留一个默认关闭的“叫醒”开关。report 只是通知，磁盘上的 notes 才是事实。
_Avoid_: 静默吞异常、把 report 当真相、重复投递阻塞编排方

### 恢复

**按 Plan 恢复**:
传入 `resume <plan>` 时才算"选中"这个 Plan，输出它的状态行、可推进队列、待回答/待验证与阻塞；会话启动不自动播报、不自动跑一轮模型。
_Avoid_: 启动对账、自愈、自动恢复

**崩溃凭据**:
由账本里的 `worker.exit`（带可能悬空的 `in_progress` note）投影成凭据，不再有 `interrupted.json`；`resume <plan>` 只在本 Plan 命中时展示并落 `interrupted.forgotten` 移除本条目，`status` 展示整档后落 `interrupted.cleared` 清空。
