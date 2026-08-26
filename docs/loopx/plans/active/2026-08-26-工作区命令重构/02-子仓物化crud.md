---
status: in_progress
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

- [x] 真实 git 集成测试证明：clone/status/pull/remove 完整覆盖物化 CRUD，clone 与 pull 不互相隐式代理，pull 只快进安全克隆，remove 守住确认、dirty、本地独有历史和 worktree 门禁，全组不读写 local 文件或创建 worktree；并通过 spec 固定的全部 `/verifying` 门禁。

## 交付记录

- 交付物：`workspace repository clone/status/pull/remove`、配置 path 物化、批处理失败隔离、浅克隆安全快进、物理路径删除门禁、local-only refs 与凭据脱敏保护，以及 16 项真实 Git 集成测试。
- 验证证据：变更文件 format/lint/type 通过；全量 `test` 19 files / 254 tests 通过；`build` 通过。完整 `check` 的 lint/type 通过；全仓格式仍受既有 CRLF checkout 差异影响，未批量改写未改文件。
- 审查：Standards 4 项、Spec 2 项发现全部修复；新增 symlink/junction 越界、tag-only 历史、mixed unknown name、凭据脱敏与 pull 后保持 shallow 的回归测试。

## 上下文

- [spec](spec.md)
- [现有 pull 实现](../../../../../packages/loopx/src/builtins/workspace/workspace-pull.ts)
- [现有 status 实现](../../../../../packages/loopx/src/builtins/workspace/workspace-query.ts)
- [ADR-0005](../../../adr/0005-子仓克隆由工作区配置定位.md)

## 下一步

/implement
