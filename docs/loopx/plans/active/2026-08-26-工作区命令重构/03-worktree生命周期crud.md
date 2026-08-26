---
status: pending
blocked_by: ["02"]
---

# Worktree CRUD

## 交付

用户通过 `workspace worktree` 从已物化子仓克隆显式创建目标 worktree，并完整列出、切换和移除其生命周期；最终 workspace CLI 只剩三层领域资源契约。

## 范围

- 完成 `worktree add/list/switch/remove` CRUD：add 必须 `--name` + 相对工作区根的目标 `--path`，branch/base 保留已确认默认；list 按 name 聚合；switch/remove 必须显式目标 path。
- 所有 Git worktree 操作从 02 的配置子仓克隆执行；以 `primary` 识别并保护克隆本身。
- 保留 `worktree prune [--name...]` 作为失效注册维护，不把它作为正常 Delete。
- 保留 remove 的 dirty `--force` 和可选 `--delete-branch`，不级联删除 repository/config。
- 删除 worktree 对 local orphan、默认管理 worktree、`mainWorktree/isMain` 的依赖；删除剩余 local schema/helpers、旧扁平命令、help 和测试。
- 增加遗留 `workspace.local.yaml` 对三层命令输出与副作用均无影响的最终黑盒回归。

## 直接依赖

- 02：worktree CRUD 消费其已物化子仓克隆和 repository CRUD 契约。

## 验收

- [ ] 真实 git 与 CLI 黑盒集成测试证明：add/list/switch/remove 完整覆盖 worktree CRUD，每个目标操作都显式指定 path，primary 克隆受保护，prune 只清失效注册；最终 CLI 只暴露 config/repository/worktree 三组领域命令，当前权威代码/文档不再消费 local/外置克隆/旧扁平契约；并通过 spec 固定的全部 `/verifying` 门禁。

## 上下文

- [spec](spec.md)
- [现有 worktree 实现](../../../../../packages/loopx/src/builtins/workspace/workspace-worktree.ts)
- [现有 workspace 命令入口](../../../../../packages/loopx/src/builtins/workspace/index.ts)
- [已完成的工作区子命令 Plan](../../reference/2026-08-23-工作区子命令/spec.md)

## 下一步

/implement
