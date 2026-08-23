---
name: loop-x
description: 把想法沿 Loop Kit 路由为领域设计、用户故事、tracer-bullet issues 和经门禁验证的交付；当需要从想法推进到实现、拆分大型工作、判断下一步 skill 或检查流程状态时使用。
---

# /loop-x

`/loop-x` 是从想法到交付的路由图。选择路径后，完整读取并执行该路径指向的 skill；各子 skill 是具体行为的单一事实源。

工作依附于当前 workspace 时，先读取本 skill 同目录的 [`DOMAIN.md`](DOMAIN.md)，再按其中的定位顺序读取工作区根 `CONTEXT-MAP.md`、相关业务域的 `CONTEXT.md` 和 ADR。路径只在当前卡点的完成标准成立后向前推进。

创建或修改领域文档、spec 或 issue 后，在工作区根目录执行：

```powershell
node .agents/skills/loop-x/script/check-domain.mjs .
```

`/loop-x` 安装在其他位置时，将命令中的 `.agents/skills/loop-x` 替换为当前 `SKILL.md` 所在目录。脚本只依赖 Node.js 标准库，不依赖工作区的 package scripts 或第三方包。

## 可执行流程协议

进入任一路径时，必须在工作区根目录使用 `flow.mjs`。它把运行状态写入根目录的 `.loop` 文件；`.loop.lock` 只在一次状态及 Plan 视图更新事务内短暂持有。二者都不是领域文档，也不参与版本控制。

```powershell
node .agents/skills/loop-x/script/flow.mjs enter-plan --skill /<entry-skill> --plan <plan-path> --session <session-id>
```

- 不要求先调用 `/loop-x`：直接执行 `/grill-with-docs`、`/to-story` 或 `/to-issues` 时，由该入口 skill 自行执行 `enter-plan`。`enter-plan` 在没有状态时分别推断 `main`、`story`、`issues` 路径；已有状态时只允许接入当前期待的 skill。
- `/grill-with-docs` 的主路径可省略 `--plan`，运行键默认为 `.`；另外两个入口使用实际 Plan 路径。首次进入可省略 `--session`，脚本生成并返回会话 ID；后续步骤必须复用返回的 `plan` 和 `session`。
- 由 `/loop-x` 路由时也使用同一入口：选择第一项 skill，将已有的 `plan`、`session` 传给它；该 skill 的 `enter-plan` 调用是幂等校验，不会建立第二条流程。
- 命令成功返回的 `next_skill` 是唯一允许调用的下一项。完整读取并执行该 skill 后，用 `record-plan` 或 `record-issue` 记录其结果与至少一项证据；记录成功后才执行新返回的 `next_skill`。`next_action` 是普通交付动作，不伪装成 skill。
- `record-plan` 按所选路径拒绝缺项、乱序或错误结果。主路径在 `/dev-gate=ready` 后继续用 `record-plan` 登记完整交付序列，最终成为 `completed`；它不虚构 issue。
- `story` 或 `issues` 接入路径在 `/dev-gate=ready` 后返回 `status: ready`。此时使用 `claim-issue` 原子领取 issue；领取成功会将 issue 及 spec 派生视图同步为 `in_progress`，并返回 `/implement`。
- 进入 `/implement` 后立即记录 `/implement=started`，再严格按返回值调用并记录 `/tdd=completed|skipped`、`/verifying=passed`、`/code-review=reviewed`。即使 `/tdd` 不适用也必须调用它，由该步骤给出 `skipped` 并提供 `--reason`。随后脚本返回 `next_action: commit`；完成提交后以 `--action commit --result committed` 登记。最后一步还要求 issue 的「交付记录」包含交付物与验证证据。
- 每次运行较长操作前以 `heartbeat-plan` 或 `heartbeat-issue` 续租。主动暂停使用 `release-*`；租约过期后其他会话可以 `claim-plan` 或 `resume-issue` 接管。
- 真实障碍使用 `block-issue --reason <原因> --release-condition <解除条件>`，它会写入阻塞记录、同步状态并释放租约。异常退出后执行 `sync-plan --plan <plan-path>` 可由 issue frontmatter 重建 spec 派生视图。

Issue 执行允许的最小命令序列如下；每条 `record-issue` 都携带相同的 `--plan`、`--issue`、`--session`，并至少提供一次 `--evidence <path-or-result>`：

```text
claim-issue
  -> /implement -> record-issue(/implement, started)
  -> /tdd -> record-issue(/tdd, completed|skipped)
  -> /verifying -> record-issue(/verifying, passed)
  -> /code-review -> record-issue(--skill /code-review, --result reviewed)
  -> commit action -> record-issue(--action commit, --result committed)
```

实际登记统一使用完整 Node 命令。主路径的 skill 使用第一条命令，最终 commit 动作把 `--skill /<skill>` 换为 `--action commit`：

```powershell
node .agents/skills/loop-x/script/flow.mjs record-plan --plan <plan-path> --session <session-id> --skill /<skill> --result <result> --evidence <path-or-result>
node .agents/skills/loop-x/script/flow.mjs claim-issue --plan <plan-path> --issue <NN> --session <session-id>
node .agents/skills/loop-x/script/flow.mjs record-issue --plan <plan-path> --issue <NN> --session <session-id> --skill /<skill> --result <result> --evidence <path-or-result>
node .agents/skills/loop-x/script/flow.mjs record-issue --plan <plan-path> --issue <NN> --session <session-id> --action commit --result committed --evidence <commit-id>
```

`flow.mjs` 是流程门禁而非安全沙箱：它能原子拒绝乱序、漏记、重复领取和未满足依赖的领取，但不能证明某个 agent 没有伪造证据。因此 `/loop-x` 的强制规则是：只执行脚本返回的 `next_skill` 或 `next_action`，且只在该步骤实际完成后登记 receipt。

### Plan 内并发

- 并发边界只到 issue：同一 Plan 中，直接依赖均已 `completed` 的不同 issue 可以由不同会话同时领取并执行。
- 同一 issue 同时只有一个有效租约；领取、续租、阻塞、完成以及 spec 状态同步均经过短事务锁，避免 lost update 与重复领取。
- `.loop` 保存租约、游标和 receipt；issue frontmatter 保存可持久化执行状态；spec 状态与 Issue 表是派生视图。脚本在同一事务中协调三者，崩溃后的视图漂移由 `sync-plan` 修复。
- 不为 `CONTEXT-MAP.md`、`CONTEXT.md`、ADR 或其他全局领域文件提供并发锁；并行会话不得借此协议推断那些文件可并发编辑。

## 主路径：想法到交付

```text
/grill-with-docs
  └─ 设计卡点通过 ─> /dev-gate
                         └─ ready ─> /implement
                                       ├─ /tdd
                                       ├─ /verifying
                                       ├─ /code-review
                                       └─ commit
```

1. 使用 [`/grill-with-docs`](references/grill-with-docs/SKILL.md) 打磨设计，并就地维护已确认的领域术语与 ADR。
2. 使用 [`/dev-gate`](references/dev-gate/SKILL.md) 检查准入条件，确认工作环境、单一交付终点和验收门禁。结论为 `ready` 后进入实现。
3. 使用 [`/implement`](references/implement/SKILL.md) 在确认的边界内交付。实现默认在合适 seam 上运行 [`/tdd`](references/tdd/SKILL.md)，随后由 [`/verifying`](references/verifying/SKILL.md) 建立证据链，再由 [`/code-review`](references/code-review/SKILL.md) 分别审查 Standards 与 Spec，最后提交。

实现中的范围、环境、交付终点或验收门禁发生实质漂移时，返回 `/dev-gate` 重新确认。

## 接入路径

### 模糊想法：先形成用户故事

```text
/to-story ──故事卡点通过──> /to-issues ──Issue 图卡点通过──> /dev-gate
```

当角色、需求或收益仍不清楚时，使用 [`/to-story`](references/to-story/SKILL.md)。它通过 `/grilling` 推进讨论与后台调研，把已确认内容就地写入 `story.md`。故事集完成后进入 `/to-issues`，再汇入主路径的 `/dev-gate`。

### 超大工作：直接拆为 tracer bullets

```text
/to-issues ──Issue 图卡点通过──> /dev-gate
```

当工作大到单次上下文无法安全完成，但问题、用户和目标已足够明确时，使用 [`/to-issues`](references/to-issues/SKILL.md)。它通过 `/grill-with-docs` 将确认内容维护为一份 spec 和一张可独立实现、交付、验收的 tracer-bullet issue 图，再汇入主路径。

## 路径卡点

| 卡点         | 通过条件                                                                                                                                                  | 未通过时                                           |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| 设计卡点     | `/grilling` 的 frontier 为空；领域术语与符合条件的 ADR 已同步；用户确认共同理解                                                                           | 继续 `/grill-with-docs`                            |
| 故事卡点     | 每条故事有唯一有序编号和可判定验收；迷雾已清空或经用户接受；用户确认覆盖原始想法                                                                          | 继续 `/to-story`                                   |
| Issue 图卡点 | 范围无遗漏且责任单一归属；直接依赖说明消费契约；图有根、无自环、无环；全部决策已澄清；下一步均为 `/implement`；issue 均为 `pending`；用户确认边界与依赖图 | 继续 `/to-issues`，语义决策回到 `/grill-with-docs` |
| 执行准入卡点 | `/dev-gate` 的路径准入和三项基线均获用户确认，结论为 `ready`                                                                                              | 修正文档或基线，重新执行 `/dev-gate`               |
| 交付卡点     | `/verifying` 对约定门禁给出 `passed`；Standards 与 Spec 两轴的阻断发现已处理或明确接受；交付已提交至当前分支                                              | 门禁失败进入最小修复循环；基线漂移返回 `/dev-gate` |

## To Issues 的文档形状

新 Plan 创建在 `active/`。精确模板、tracer-bullet 规则与维护步骤以 [`/to-issues`](references/to-issues/SKILL.md) 为准。

```text
docs/{domain-name}/plans/active/YYYY-MM-DD-中文工作名/
├── story.md              可选，由 /to-story 维护
├── spec.md               聚合状态、问题、方案、边界、环境与 Issue 表
├── 01-中文标题.md         status + blocked_by + 交付/范围/依赖/验收/上下文/下一步
└── 02-中文标题.md
```

- `spec.md` 的 `status` 是 issue frontmatter 的聚合视图；Issue 表也是派生视图。
- issue frontmatter 的 `status` 是持久化执行状态的来源；`.loop` 只保存运行租约、skill 游标与 receipt；`blocked_by` 只列直接依赖的稳定 ID。
- 编号从 `01` 开始，按依赖顺序连续递增；至少一个根 issue 的 `blocked_by` 为空。

## 状态流转

```text
pending ──领取──> in_progress ──交付物与验证证据齐备──> completed
                         │
                         └─真实障碍──> blocked ──障碍解除并恢复工作──> in_progress
```

- `pending` 只因实际领取进入 `in_progress`；依赖完成只改变可执行性。
- `blocked` 记录障碍和解除条件；解除后先回到 `in_progress`。
- `completed` 内容冻结；后续修正创建新 issue 并交叉链接。
- spec 聚合状态是全函数：全部 issue 为 `pending` 时是 `pending`；全部为 `completed` 时是 `completed`；其余组合，包括 `blocked`，都是 `in_progress`。
- Plan 的 `active → reference | archived` 生命周期与执行状态正交，按同目录 [`DOMAIN.md`](DOMAIN.md) 流转。

## 独立能力

- 不依附工作区的思考打磨使用 [`/grilling`](references/grilling/SKILL.md)。
- 模块边界与 deep-module vocabulary 使用 [`/codebase-design`](references/codebase-design/SKILL.md)。
- 编写、修改或审查代码使用 [`/code-spec`](references/code-spec/SKILL.md)。
- 编写 skill、`AGENTS.md` 或 agent context pointer 使用 [`/writing-for-agents`](references/writing-for-agents/SKILL.md)。
