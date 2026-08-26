---
status: pending
blocked_by: ["01"]
---

# 子仓物化 CRUD

## 交付

用户通过 `workspace repository` 在配置 `path` 上完整克隆、查看、更新和移除远程子仓的本地物化，不依赖 local 文件或隐式 worktree 副作用。

## 范围

- 建立 `repository clone/status/pull/remove`，以 01 的 resolver 定位子仓克隆。
- clone 只 Create 缺失克隆；status 只 Read 本地现场且不 fetch；pull 只 Update 已存在克隆；remove 只 Delete 单个克隆。
- clone/pull 保持多 name 或默认全部的顺序批处理与单项失败隔离；remove 要求单 name + `--yes`。
- pull 只对安全克隆 fetch + fast-forward-only，不更新 worktree。
- remove 在有额外 worktree 时拒绝；primary 克隆 dirty 或存在 remote refs 不可达的本地历史时需 `--force`，不删除 config 项。
- repository 命令不读写 `workspace.local.yaml`/`clone_path` 或默认 `~/workspaces`，并移除旧扁平 status/pull。

## 直接依赖

- 01：repository CRUD 消费其 config CRUD 产出与唯一克隆路径 resolver。

## 验收

- [ ] 真实 git 集成测试证明：clone/status/pull/remove 完整覆盖物化 CRUD，clone 与 pull 不互相隐式代理，pull 只快进安全克隆，remove 守住确认、dirty、本地独有历史和 worktree 门禁，全组不读写 local 文件或创建 worktree；并通过 spec 固定的全部 `/verifying` 门禁。

## 上下文

- [spec](spec.md)
- [现有 pull 实现](../../../../../packages/loopx/src/builtins/workspace/workspace-pull.ts)
- [现有 status 实现](../../../../../packages/loopx/src/builtins/workspace/workspace-query.ts)
- [ADR-0005](../../../adr/0005-子仓克隆由工作区配置定位.md)

## 下一步

/implement
