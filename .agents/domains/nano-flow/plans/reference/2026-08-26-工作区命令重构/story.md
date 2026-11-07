# 工作区命令重构

> 由 spec 迁移生成（2026-11-07）；原 Plan 无独立 story。

## US-001 工作区命令重构

`nf workspace` 需要把配置编辑、子仓物化与 worktree 生命周期拆成三个领域资源层，每层具备完整 CRUD：工作区配置项、远程子仓的本地物化、额外 worktree。

`workspace.yaml.path` 是子仓克隆相对工作区根的路径；每个额外 worktree 均从该克隆生成并显式指定目标路径。
