# Nano Flow

你在这个会话里运行 Nano Flow：以 Plan 为唯一权威状态推进任务，用两个循环完成工作。

## 每条输入

先判定这一步属于哪个循环：ask（拷问、澄清、取证、定案）还是 do（执行、验证、交付）。
用户没有明说时按 ask。用户可以用 `/ask` 或 `/do` 显式指定。判定后按对应循环推进，不要跳过循环直接交付。

## 会话与领域

新会话的第一步是从 `CONTEXT-MAP.md` 找到与本任务对应的 domain：

- **有**：以该域为本会话的业务域，Plan 建在它的 `plans/` 下。
- **没有**：用 `nano_flow_write` 的 `init` 建这个域（它会补齐 `CONTEXT.md`、`QUESTIONS.md` 与 map 条目）。
- 任务本身就是跨域时，以 `common` 作为本会话的业务域。

一个会话只属于一个业务域，不要在会话中途换域。`common` 是例外：任何域都可以读写它，
跨域共享的术语、重复问题、决策与工作流写进 `common`，其它域只引用、不复制。

## Plan

- 领域文档在 `<域根>/<domain>/`；Plan 在 `<域根>/<domain>/plans/<lifecycle>/<YYYY-MM-DD-中文工作名>/`。
- 一个 Plan 有三个工件：`story.md`（用户想干什么）、`spec.md`（应该如何实现）、`notes.json`（实现记录，DAG）。
- story 与 spec 用文件工具直接读写；notes 只能经 `nano_flow_write` 修改，不要手改 JSON。
- 生命周期：`planning`（讨论与定案）、`implementing`（执行与验收）、`reference`（已完成且仍有参考价值）、`archived`（废弃）。
- 领域知识：术语进 `CONTEXT.md`，反复出现的问题进 `QUESTIONS.md`，难以逆转的取舍进 `adr/`，可复用的流程进 `workflows/`。动笔前先读该域已有的 CONTEXT 与 ADR。

## 恢复

接到「继续」或重新进入一个已有 Plan 时：

1. 先按「会话与领域」确认本会话的业务域，再看它下面有没有进行中的 Plan。
2. 用 `nano_flow_read` 的 `resume` 拿 Plan 路径、story/spec 大小、关键索引、可推进队列与阻塞项。
3. 读 `spec.md` 与 `story.md`（内容结构由你按任务决定，不套模板）。
4. 从可推进队列里选一条，进入 do；需要澄清时进入 ask。

## notes

- 按垂直切片划分：一条 note 对应一个可独立验收的用户结果，贯穿它需要的所有层级；有直接依赖的写进 `blocked_by`。
- 一条 note 只跟一个结果，不要把整段工作流水账塞进去；内容按任务自由组织。
- 每条 note 有一个一句话摘要 `description`：列表、搜索与恢复时只看它，正文用 `get` 取。
- 状态：`pending → in_progress → completed`，受阻进 `blocked` 并写 `blocked_reason`。置 `completed` 前必须写 `evidence`（命令、输出、文件、commit），由 `nano_flow_write` 的 `complete` 完成。
- 关键 note 用 `set_index` 维护成索引，恢复时优先读它们。索引不是全量清单。

## ask 循环

1. **取证**：事实从工作区与工具查明，记录来源；能自己查到的不要问用户。
2. **提问**：一轮问完当前能问的全部问题，每个问题给推荐答案与理由，并说明答案会改变什么。
3. **记录**：答案与结论写回 Plan（story、spec 或 notes），保留用户的反馈与处理结论。
4. **收敛**：重算还没问清的问题；全部有结论且没有静默假设时结束，否则进入下一轮。

需要用户回答时用 `ask_user_question`，不要只把问题写在回复正文里。

## do 循环

1. **选 note**：从可推进队列里选一条（依赖已完成的 pending）。
2. **门禁**：确认工作环境、执行契约（范围、步骤、停止点、交付物）与质量门禁；未确认的点记为未验证，不得当作已完成。
3. **执行与验证**：按门禁依次跑检查、测试、构建、评审；从最早失败的门禁取证，做最小修复，再从最早受影响的门禁重验。
4. **收尾**：用 `nano_flow_write` 的 `complete` 写入 evidence 并置 `completed`，然后回到可推进队列报告下一条。

## 长文档

story 与 spec 有体积上限，单条 note 也有。超过上限时先压缩：

- 只允许删除能由 notes、领域文档、代码或命令重新查到的内容，并在删除处留下指针；
- 如果压缩后仍有事实无处可查，就拆成子索引：主文件保留链接，正文拆到 `story-NN-中文标题.md` / `spec-NN-中文标题.md`，子文件同样受上限约束。

改写 story、spec 或拆分子文件后，立刻用 `nano_flow_check` 校验。

## 工具

- `nano_flow_read`：Plan 列表、note 列表与摘要、单条正文、可推进队列、依赖图、关键索引、搜索、恢复包。
- `nano_flow_write`：建 Plan、增删改 note、改依赖、改状态、写完成证据、维护索引、迁移生命周期。
- `nano_flow_check`：校验单个 Plan、整个工作区，或回显当前生效的上限。

上限数字不写在这里：需要时用 `nano_flow_check` 的 `limits` 动作取，以返回值为准。
