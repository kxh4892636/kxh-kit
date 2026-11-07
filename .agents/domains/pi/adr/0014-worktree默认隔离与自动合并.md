# worktree 改为 Plan worker 默认，合并由代码自动执行

ADR-0012 把 worktree 定为“两个 worker 可能改同一批文件时”的**可选**开关，合并由编排方另派一条指令去做。实践里两头都靠自觉：不显式打开的并行会直接撞文件，而 worker 都报“可合并”之后合并那一步常常没人记得（编排方没有 `bash`，派回收指令又要一轮会话）。现在改成 **Plan worker 默认隔离**（临时 worker 默认不建）、**终态后代码自动 ff-only 合并并回收**：隔离变成默认而不是提醒，合并变成事件而不是任务。

## Considered Options

- **维持可选 worktree（ADR-0012）**：省那 ≈280 MB / ≈15s 的每 worktree 成本，但“文件不重叠”只是软建议，只能靠人判断；合并也多一次派工往返。
- **所有 worker 都默认建 worktree**：语义最一致，但临时 worker 只读、几十秒就结束，付不起这个成本，且它没有 Plan 可锚定。
- **Plan worker 默认 + 临时 worker 按需（选定）**：付得起成本的形态默认隔离；一次性调研留在主工作区。
- **合并交给编排方 / 模型判断**：冲突上下文在最不该解冲突的一方，且不可靠；代码只做 `--ff-only`，解不了就停手。

## Consequences

- 默认命名沿用 `note-<id>` / `grp-<id-id>` / `plan`；`worktree: false` 与显式名字仍然生效。建 worktree 或 `pnpm install` 失败直接中止派工，不降级到主工作区——降级等于让 worker 在没有依赖的目录里跑测试。
- 终态（`settled`）后：`git merge-base --is-ancestor` 校验 → `git merge --ff-only wt/<名字>` → 删 worktree（长路径兜底 `rm -rf` + `worktree prune`）→ 删分支 → `worker.merged`。任一校验不过（分叉、主工作区脏、rebase 没做）→ 不合并、不删，落 `worker.merge_blocked`（含现场路径），`orchestrator_state` 标 `✗` 等人工处理。冲突永远发生在隔离目录里，主分支保持线性。
- 合并串行化：主工作区同一时刻只允许一个 merge（进程内互斥 + `index.lock` 类错误小重试），否则两个 worktree 并发 ff-only 会互相把对方的基线推走，第二个必然失败。
- 合并会删掉 cwd，所以同一个组再派工（rework / answer）时重新建一个 worktree 并写回句柄；会话仍续上，只是路径变了。abort / 超时**不删** worktree（现场留给人工）。
- 默认值翻转的代价：Plan worker 每次派工多 ≈1.5s + ≈13.5s 与 ≈183 MB 增量磁盘（Windows 热 store 实测，见 ADR-0012）。

## 后续（取代）

- ADR-0017 取代本文的「按 `kind` 推导 + 显式覆盖」与「合并会删 cwd 所以同组再派重建目录」两条：现场改为**一个组一个、整组共用**，键 `note-<id>` / `grp-<id-id>`，组内 note 全部 completed 才 ff-only 合并并删除，`abort` / 超时不动现场，「默认隔离」不再需要推导。
