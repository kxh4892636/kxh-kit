# worktree 派工与 worker 自行 rebase

并行 worker 改同一批文件时，“文件不重叠”只是自觉，所以 `orchestrator_dispatch` 支持 `worktree: true | <名字>`：worker 的 cwd 变成 `.worktrees/<名字>`（分支 `wt/<名字>`），Plan 仍锚定主工作区绝对路径，`notes.json` 只有一份在变。合并策略选 **worker 自己 rebase、主工作区只 `--ff-only`**：rebase 冲突发生在隔离目录里，由知情者自己解，主分支永远线性、不需要编排方在合并时解决冲突；代价是 worker 多一步 rebase 义务，且合并前后要人工/派工驱动回收（abort 与超时都不删 worktree）。

## Considered Options

- **主工作区里直接并行**（沿用“文件不重叠”软建议）：零成本，但两组碰到同一文件时没有隔离，冲突只在合并那刻暴露。
- **编排方合并时解冲突**（`git merge` 不用 `--ff-only`）：worker 省一步，但冲突上下文在编排方手里、它不读实现，等于把最难的一步交给信息最少的一方。
- **worker 自行 rebase（选定）**：冲突由写代码的人解，主分支保持线性；回收由编排方显式派工，失败保留现场。

## Consequences

- 每个 worktree 各自 `pnpm install`（实测 Windows、热 store：建 worktree ≈1.5s / 98 MB；install ≈13.5s，真实增量磁盘 ≈183 MB，因为 pnpm 硬链接 store；装完 `pnpm test` 3.8s 通过 372 项）。装不上就中止派工，worker 不许跳过测试。
- Windows 上 `git worktree remove` 会因 `node_modules` 长路径报 `Filename too long`；加 `-c core.longpaths=true` 后仍可能留几 MB 残留，所以回收实现总要检查目录是否真消失，必要时 `rm -rf` 补删再 `worktree prune`。
- worktree 不用于临时 worker（它们没有 Plan 可锚定），也不改变“一条 note 只允许一个 worker”的组语义。

## 后续

- ADR-0014 把 worktree 从“可选”改成 **Plan worker 默认**（临时 worker 默认不建），并把合并 / 回收从“编排方另派一条指令”改成**代码在 worker 终态后自动执行**。本 ADR 的核心结论不变：worker 自己 rebase、主工作区分支只做 `--ff-only`、冲突保留现场。

## 后续（取代）

- ADR-0017 把现场单位从「某一代 worker」改成**组**：`worktree: true | <名字>` 覆盖删除，键固定为组键，现场整组共用、组完成即回收。本 ADR 仍然成立的部分：worker 自己 rebase、主分支只做 `--ff-only`、合并失败保留现场。
