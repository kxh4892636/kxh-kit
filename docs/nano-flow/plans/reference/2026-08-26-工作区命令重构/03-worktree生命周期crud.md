---
status: completed
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
- 删除旧扁平命令、help 和测试。

## 直接依赖

- 02：worktree CRUD 消费其已物化子仓克隆和 repository CRUD 契约。

## 验收

- [x] 真实 git 与 CLI 黑盒集成测试证明：add/list/switch/remove 完整覆盖 worktree CRUD，每个目标操作都显式指定 path，primary 克隆受保护，prune 只清失效注册；最终 CLI 只暴露 config/repository/worktree 三组领域命令；并通过 spec 固定的全部 `/verifying` 门禁。

## 交付记录

- 交付物：完成 worktree add/list/switch/remove CRUD 与 prune，所有目标操作显式接收工作区相对 `--path`；删除旧扁平 pull/query，实现 config path 上的 primary clone 保护、物理路径 containment 与安全删除顺序；CLI 和分发包版本升级到 `0.0.4`。
- 验证证据：`build` 通过；源码 19 files / 244 tests 通过；distribution 1 file / 3 tests 通过；mutation 在 22m17s 内完成 8024 mutants，总分 51.74%、covered 62.50%、workspace 60.37%；领域文档校验通过；Spec/Standards 双轴审查通过。
- 门禁说明：`vp check --no-fmt` 对 105 files 的 lint/type 全通过，全部本次变更文件定向 format/lint/type 通过；精确 `vp check` 仅因 Windows checkout 中 137 个未修改文件的既有 CRLF 格式基线失败，为避免把全仓行尾改写混入本 issue，未批量格式化无关文件。

## 上下文

- [spec](spec.md)
- [现有 worktree 实现](../../../../../packages/loopx/src/builtins/workspace/workspace-worktree.ts)
- [现有 workspace 命令入口](../../../../../packages/loopx/src/builtins/workspace/index.ts)

## 下一步

/implement
