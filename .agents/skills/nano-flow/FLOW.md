# Flow 运行协议

`/nano-flow` 驱动 `scripts/flow.mjs`；各 skill 拥有产物和完成标准。首次调用前从工作区根目录运行 `node <nano-flow-skill-root-dir>/scripts/flow.mjs --help`，以现场帮助查询参数。

## 打开、执行、报告

1. 新 Flow 用 `acquire --plan <path>` 创建并取得租约；已有 Flow 用 `status --plan <path>` 查看，再用 `acquire` 恢复。模式在创建时通过 `--mode manual|auto` 设置，默认 manual，创建后固定；新模式使用新 Flow 标识。
2. 仅在返回 `state=owned` 时，完整读取并执行 `next.skill`，原样传递 `next.message` 与 Flow context。
3. skill 完成标准成立后，用 `report --session <id> --step </skill> --result <result> --evidence <ref>` 登记，result 取自 `next.results`；只执行新返回的下一步。

所有命令携带稳定的 `--plan`；Issue 操作另带 `--issue <NN>`。后续原样复用返回的 plan、issue、session。Plan 标识必须位于工作区内；采用 Issue 图时，它必须指向实际 Plan 目录。

主流程由已登记证据推导：

```text
/questing → /to-issues
               ├─ skipped   → /dev-gate=ready → /code-delivery → completed
               └─ completed → /dev-gate=ready → 逐个 Issue 的 /code-delivery → 全部 completed
```

`/to-issues` 判断是否需要可恢复的 Issue 图，允许报告 `completed` 或 `skipped`，两者均须证据。`/dev-gate` 只接受 `ready`，证据引用已确认的执行基线；`not ready` 时继续澄清，需暂停则报告 `paused`。其他 skill 只接受 `completed`。

`/dev-gate` 在 Plan 级确认工作环境、执行契约和质量门禁，准入后才进入直接交付或领取 Issue。`/code-delivery` 内部完成实现、测试、验证、审查和提交，提交成功后才报告 `completed`；证据引用本轮实际提交、交付物与验证结果。交付中重新准入由 `/code-delivery` 调用 `/dev-gate`，更新后的基线计入交付证据。Flow 不执行 Git 提交，也不证明证据真实性。

## 统一快照

三个命令均返回 `{ plan, issue, session, mode, state, next, lease, issues, receipts }`。`next` 为 null 或 `{ skill, results, message? }`；`issues` 含 `{ id, status, lease, ready }`；receipts 始终为整个 Plan 的证据链，通过每项的 issue 区分 Plan 和 Issue 登记。

| state     | 调用方动作                                 |
| --------- | ------------------------------------------ |
| available | acquire 取得租约后执行                     |
| owned     | 执行 next；长操作用 acquire 续租           |
| busy      | 等持有人释放或租约过期                     |
| blocked   | 解除障碍并提供证据后 acquire               |
| issues    | 按已确认优先级选择 ready Issue，再 acquire |
| completed | 本目标结束                                 |

`status --session <id>` 仅用于识别该 session 已有的有效租约，既不领取也不续租；显示 next 不代表取得执行权。`state`、下一步和 Issue readiness 均为派生信息，不另存运行状态副本。

## Issue 与租约

`/to-issues=completed` 且 `/dev-gate=ready` 后，Plan 返回 Issue 集合；显式选择 Issue，脚本不自动挑选。领取要求直接依赖全部 completed。同一 session 在一个 Plan 内最多持有一个 Issue；不同 session 可并行领取互不阻塞的 Issue，每个目标只有一个有效租约。

`acquire` 首次生成 session；同一持有人携带 session 再次调用即续租，租约过期后可接管。默认租期 30 分钟，可用 `--lease-seconds` 调整。租约过期只影响执行权，保留已登记证据与文档执行状态。

暂停用 `report --session <id> --result paused` 释放租约，恢复仍用 acquire。真实阻塞仅用于 Issue：`report --session <id> --result blocked --reason <text> --release-condition <condition>` 写入障碍与解除条件并释放租约。暂停与阻塞无需 step 或 evidence。

恢复 blocked Issue 须用 `acquire --evidence <ref>` 提供解除证据；不会因再次领取自动视为障碍已解决。交付完成前，Issue 的「交付记录」须包含交付物与验证证据。

Issue frontmatter 的 status 是执行状态事实源：

```text
pending → in_progress → completed
              ↕
           blocked
```

所有涉及 Issue 的写操作自动刷新 spec 派生状态与 Issue 表。全部 Issue completed 后，Plan 返回 completed；已有完成目标不会被重新初始化。后续修正创建新 Issue，新一轮 Flow 使用新 Plan 标识。

完成后按 [DOMAIN.md](references/DOMAIN.md) 判断参考价值，将 Plan 移入 reference/ 或 archived/ 并重新运行领域校验；文档生命周期与执行状态正交。

## Hooks

[extensions/hooks.json](extensions/hooks.json) 拥有确认与推进提示：`match` 为 all 或主流程 skill 名称数组，mode 为 all、manual 或 auto，message 为非空单行文字。脚本将匹配当前 skill 和模式的消息按配置顺序拼入 next.message。

携带 Flow context 的 skill 及其内部调用按该消息执行确认；复用已有有效授权，产物与证据仍须达到各 skill 的完成标准。

## 存储与失败恢复

schema 8 使用固定 `.flow/state.json`，保存 `plans[plan] = { mode, receipts, leases }`。Plan 短证据链和 Issue 文档共同决定当前位置；没有 phase、cursor 或 Issue status 副本。跨日继续读取同一文件；旧日文件保留但不读取，不迁移旧 schema。

写入前验证参数、租约、顺序、依赖、证据与文档更新。多文件写入通过 pending journal 恢复：中断后，下一次 acquire 先恢复未完成写入。status 遇到 pending 时明确提示先 acquire，不返回可执行快照。

恢复在预检和逐文件写入前比对内容，发现外部修改时保留现场并报冲突，核对并解决冲突后重试。外部编辑器不参与 Flow 写锁，检查与替换也不是原子操作；恢复期间暂停编辑同批文件。文档中的完成状态不会补造 receipt。完成登记必须同时保留本次证据与文档状态，校验失败不能留下部分更新。
