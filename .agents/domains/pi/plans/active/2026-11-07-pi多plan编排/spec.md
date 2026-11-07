# pi 多 plan 编排

## 目标

**Nano Flow 与 orchestration 合并为一个能力，统一命名为 `orchestrator`**：目录 `src/orchestrator/`、开关 `tools.orchestrator`、命令 `/orchestrator`、配置节 `orchestrator`、提示词 section `orchestrator`、工具全部 `orchestrator_*`（`read` / `write` / `check` / `report` / `dispatch` / `workers`）。旧 `nanoFlow` / `nano-flow` 名称在配置加载时迁移。

在此之上实现「一个 TUI 会话做编排 + 多个 SDK 会话做执行」：orchestrator 判断输入归属哪个 plan，用 in-process `createAgentSession` 起 worker 推进该 plan 的 notes DAG，worker 通过结构化 report 回报，orchestrator 汇总后向人确认并在获得放行后驱动 `completed`。同时把 Nano Flow 的等待语义从 `awaiting_verification` 收敛为 `waiting + needs`，并新增 `orchestration` 域与其运行时 plan。

## 概念与权限

### 角色

| 角色 | 是什么 | 归属域 |
| --- | --- | --- |
| orchestrator | 用户正在用的 TUI 会话 | `orchestration` |
| worker | orchestrator 用 SDK 创建的 in-process session，`worker:plan` **同时** 1:1 | 该 plan 所属业务域 |

不设 ticket：授权由用户输入天然给出，无多来源、无多人、无策略版本。会话可被重建接管同一 plan，故 1:1 是"同时"而非"一生"。

### 权限矩阵

| 读 | worker 读本域 + common；orchestrator 读所有域 |
| 写 | worker 写本域 plan；orchestrator 只写 `orchestration` 域 |

| 动作 | worker | orchestrator |
| --- | --- | --- |
| `orchestrator_read` 全部 op | ✅ | ✅ |
| `orchestrator_write`：`create`/`update`/`link`/`merge`/`delete`/`set_index`/`repair` | ✅ | ✅ |
| `status` → `in_progress` / `waiting` / `blocked` | ✅ | ✅ |
| `status` → `completed` | 仅收到 `pass` 后 | ❌ |
| `orchestrator_check`：`plan` / `limits` | ✅ | ✅ |
| `orchestrator_check`：`workspace` | ❌（要跨域扫描，只留给编排方） | ✅ |
| `init` / `move` | ❌ | ✅ |
| UI 提问 | ❌（结构化登记） | ✅ |
| spawn / abort worker | ❌ | ✅ |

原则：**plan 级（工作集合边界）归编排，note 级（plan 内结构）归执行，结束判定归放行**。worker 有笔没印。

## 数据模型

### note 状态

`pending` / `in_progress` / `waiting` / `blocked` / `completed`，另有：

- `needs?: "answer" | "review"`，`status = waiting` 时必填
- 迁移：`awaiting_verification` → `waiting` + `needs: "review"`（旧文档解析时自动映射，写回时落新值）

### orchestration 运行时 plan

```
.agents/domains/orchestration/plans/{lifecycle}/YYYY-MM-DD-编排期/
```

note 粒度 = 一个需要 orchestrator 记住的未结事项：待归属输入 / 待用户回答 / 追踪中的 plan。全部 `completed` 后由 orchestrator 自行 `move` 到 `archived`（**不需要用户确认**，它是运行时索引而非工作）。

### orchestration 域

```
.agents/domains/orchestration/{CONTEXT.md,QUESTIONS.md,adr/,plans/}
```

## 协议

### 归属判定

1. 与某 plan 的 note 有 `blocked_by` 依赖 → 同一 plan（可代码判定）
2. 无依赖但共享同一验收物 → 同一 plan（orchestrator 判断，写进 skill 准则）
3. 相差很大 → 各自新 plan，即使同域

### report（worker → orchestrator）

worker 工具 `orchestrator_report`：

```ts
{ outcome: "done" | "needs_answer" | "needs_review" | "blocked" | "failed",
  note: string, summary: string, question?: string, evidence?: string[] }
```

`execute()` 直接回调 orchestrator（in-process 闭包），orchestrator 用 `pi.sendMessage(..., { triggerTurn: true })` 注入一条消息给自己。**report 是通知，磁盘是事实**：orchestrator 收到后重新 `orchestrator_read get` 该 note。

### Input（orchestrator → worker）

| 消息 | 前置 | worker 动作 |
| --- | --- | --- |
| `pass` | 人确认通过 | `status → completed` + evidence |
| `rework: <原因>` | 人要求返工 | `waiting → in_progress` |
| `answer: <内容>` | 人的回答 | `waiting → in_progress` |
| `fact: <内容>` | 跨 plan 事实 | 记录，不改状态 |

投递：`session.isIdle ? prompt(text) : followUp(text)`。

### 验收闭环

worker 推到 `waiting(needs=review)` → report → orchestrator 问人 → 人通过 → orchestrator 发 `pass` → worker 自己写 `completed`。放行是消息，不是共享状态。

### plan 归档

用户决定；工具复核：该 plan 无未完成 note。orchestrator 对业务域 plan 无写权限——归档由 worker 收到 `close` 后执行；孤儿 plan 由用户手动处理。

## 实现

### 模块

```
packages/pi-toolkit/src/orchestrator/          # 由 src/nano-flow/ 重命名而来
├── dag.ts plan.ts store.ts check-runner.ts    # 既有纯逻辑（状态枚举按 note 04 改）
├── assets.ts prompt.md skills/ scripts/       # 既有资产（工具名与提示词按本 note 改）
├── ask.ts                                     # ask_questions（无 UI 时结构化登记）
├── mode.ts selector.ts register.ts            # 模式、选择器、orchestrator 侧接线
├── tools/{read,write,check,shared}.ts         # orchestrator_* 工具（role / lockedPlan / released 门禁）
├── types.ts      # WorkerReport / InputMessage / WorkerHandle / ReconcileItem
├── errors.ts     # interrupted.json、installCrashGuard、withTimeout
├── handles.ts    # 句柄表（闭包持有，键 = plan 绝对路径）+ deliver / renderInput / disposeAll
├── worker.ts     # workerExtension：受限 orchestrator_read/write + orchestrator_report + worker.md
├── spawn.ts      # createAgentSession + DefaultResourceLoader(extensionFactories, noExtensions)
├── reconcile.ts  # 纯函数：业务域 plan 快照 + 中断凭据 → 对账项
└── *.test.ts
```

### 两套扩展工厂

| | orchestrator（`src/index.ts`） | worker（`workerExtension`） |
| --- | --- | --- |
| 工厂 | `piToolkit`（既有入口） | `createWorkerExtension({ plan, report })` |
| 工具 | `orchestrator_read` / `orchestrator_write` / `orchestrator_check`（全 op）、`orchestrator_dispatch`、`orchestrator_workers`、`ask_questions` | `orchestrator_read`、`orchestrator_write`（无 `init`、无 `completed`）、`orchestrator_report` |
| 桥接 | 句柄表、reconcile、report 注入 | 无（只回调） |
| 提示词 | `orchestrator` section | `orchestrator` section + worker 角色段 |

worker session 用 `new DefaultResourceLoader({ cwd, agentDir, extensionFactories: [{ name: "pi-toolkit-worker", factory }], noExtensions: true, noSkills: false })`，避免递归加载 orchestrator 的扩展。

### 开关

**不新增开关**：既有 `tools.nanoFlow` 更名为 `tools.orchestrator`，仍是 `/toolkit` 面板的第四行、默认关闭。能力生效条件 = `tools.orchestrator && 模式开`。旧配置键 `tools.nanoFlow` / `nanoFlow` 在 `loadSettings` 时迁移。

### 对账的数据来源

对账从**业务域 plan 的 note** 派生 + `interrupted.json` 补充，不依赖编排方自己维护一份状态。`orchestration` 域的运行时"编排待办" plan 由模型在需要时用 `orchestrator_write init` 建立，代码不自动创建 —— 代码只负责把磁盘事实摆到人面前。

### 错误处理（七条）

1. 幂等：spawn 前查句柄表，已存在则复用
2. 超时：`prompt` 包 `AbortController`；`waitForIdle` 超 `workerTimeoutMs`（默认 30 min）→ `abort()` + note 标 `blocked(reason=timeout)`
3. 异常隔离：所有 handler / 工具 `execute` 过 `safe()`，捕获后记录并标记 plan `failed`，不外抛
4. 进程兜底：`uncaughtException` / `unhandledRejection` → 写 `interrupted.json` → `process.exit(1)`
5. 状态真相在磁盘：plan 运行态落 `interrupted.json` / 由 notes 派生，不从 session 存在推断
6. reconcile：`session_start` 对账四步（中断 / 等人 / 可归档 / 未知），只提示不行动
7. 退出收尾：`session_shutdown` 时 abort 并 dispose 全部 session

不设并发上限；用 `/orchestration status` 的 live 清单与 `/orchestration abort [plan|all]` 替代限额。

## 已排除的备选

- **保留 Ticket**：授权、幂等、归属、状态机等六项职能在单用户场景四项退化，两项被 plan/note 承担
- **worker 独立 plan 文件（一 ticket 一 plan）**：plan 是"一次工作"的单位而非"一次执行"，按 Assignment 划分会产生碎片
- **orchestration 拥有 `move` 例外**：与"对业务域只读"冲突；改为人工处理孤儿 plan
- **子进程 + RPC 起 worker**：TUI 会话内嵌 session 已由 SDK 支持，省掉协议层与事件解析；崩溃由「退出 + reconcile」接管
- **文件 outbox**：TUI 形态下 orchestrator 必然在场，report 用 in-process 回调即可
- **并发上限**：改为清单 + 刹车

## 实施决策

- **不新增第 5 个开关**：spawn session 有副作用，但既有 `tools.orchestrator` 默认关闭已足够 opt-in，多一个开关只增加认知成本
- 全面改名为 `orchestrator`，与 dsh-superagent 的 `orchestrator_*` 命名一致；旧名在配置加载时迁移，session entry 名一并改（旧会话的 mode 状态回落到默认值）
- worker 工具复用 `createReadTool` / `createWriteTool`，用 `role` 参数门禁，不复制实现
- `needs` 只做分类，具体问题留在 note 正文固定小节（"待回答" / "待验证"）
- `check-domain.mjs` 与 `dag.ts` 的枚举是两份副本，必须同步改
- 旧 `awaiting_verification` 在 `parseDocument` 内映射为 `waiting + needs=review`，不报错

## 工作环境

- 宿主：pi 1.5.0；`@earendil-works/pi-coding-agent` 为 peer 依赖
- 包由 jiti 直接加载 TS，无构建步骤
- 仓库：`kxh-kit`（`main`），Node v24.21.0、pnpm 11.22.0
- 验证：`pnpm --filter @kxh4892636/pi-toolkit test`、`check`、`orchestrator_check workspace`
