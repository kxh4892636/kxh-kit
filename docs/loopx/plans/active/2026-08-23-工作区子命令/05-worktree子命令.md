---
status: pending
blocked_by: ["03"]
---

# Worktree 子命令

## 交付

`loopx workspace worktree` 子命令组管理子仓 worktree 的生命周期：`list` 枚举、`switch` 切换已注册 worktree 的分支、`remove` 移除（默认保留工作分支）、`prune` 清理失效注册。worktree 的创建统一由 `pull --path --worktree-branch` 物化承担。

## 范围

- `worktree list [--name <name>...]`（Query）：聚合各子仓 `git worktree list --porcelain`——路径、分支、HEAD commit、是否主 worktree、是否 locked；未物化子仓标注。
- `worktree switch --name <repo> --path <path> --branch <branch> [--base <branch>]`（Mutation）：将指定 worktree 切换到目标分支；目标分支不存在时从 `--base`（默认配置 branch）创建；worktree 不存在、目标分支已被其他 worktree 检出、dirty 导致切换冲突时透传 git 报错。额外 worktree 不写入 `workspace.yaml`，枚举以 git 注册信息为准。
- `worktree remove --name <repo> --path <path> [--force] [--delete-branch]`（Mutation）：删目录 + 清注册；主 worktree 允许移除（下次 `pull` 按配置重建）；dirty 时必须 `--force`；默认保留工作分支，`--delete-branch` 时以 `git branch -d` 删除，未合并分支由 git 拒绝并报错。
- `worktree prune [--name <name>...]`（Mutation）：对克隆存储执行 `git worktree prune`，报告清理的失效注册条目。
- 写命令均支持 `--dry-run`；与 03 共享克隆存储路径解析。
- 不做：worktree 创建（由 03 的 `pull` 承担）、`worktree lock` / `unlock`、本机克隆删除。

## 直接依赖

- 03: 消费其物化布局契约（克隆存储路径解析、工作分支命名）与 worktree 创建产物；`switch` 操作的正是 `pull` 物化出的 worktree。

## 验收

- [ ] `worktree switch` 将指定 worktree 切到已存在分支；目标分支不存在时从基准（或 `--base`）分支创建；分支被其他 worktree 占用时透传 git 报错
- [ ] `worktree list` 正确区分主 worktree 与额外 worktree 并标注 locked
- [ ] `worktree remove`：默认保留工作分支且可经 switch 重新利用；dirty 无 `--force` 时报错；`--delete-branch` 删除已合并分支、未合并分支被拒绝
- [ ] 手动删除 worktree 目录后 `worktree prune` 清掉失效注册并在结果中报告
- [ ] 写命令 `--dry-run` 均无副作用且返回计划
- [ ] `pnpm --filter @kxh4892636/loopx check` 与 `pnpm --filter @kxh4892636/loopx test` 通过

## 上下文

- [spec.md](spec.md)
- [03-拉取与物化](03-拉取与物化.md)

## 下一步

/implement
