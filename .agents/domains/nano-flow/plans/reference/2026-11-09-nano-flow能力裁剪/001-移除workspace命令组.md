---
name: '001-移除workspace命令组'
description: '删除 nnf workspace 整组命令与其测试，顶层只剩 anki、fixture、self。'
status: completed
---

# 移除 workspace 命令组

## 交付

- 删除 `packages/nano-flow/src/builtins/workspace/` 全部源码与测试（含 `testing/workspace-contracts.ts`、`testing/worktree-fixture.ts`）。
- 清理仓库内其他位置的 `workspace` 引用：`README.md` 的命令表、`test/distribution.spec.ts` 中若有用例、注释与类型残留。
- `import.meta.glob("./*/index.ts")` 会自动收敛，`src/builtins/discover.ts` 无需改动；确认没有硬编码 `workspace` 的注册路径。

## 验收

- `node packages/nano-flow/dist/main.mjs --help` 的 Commands 只剩 `anki`、`fixture`、`self`。
- `node packages/nano-flow/dist/main.mjs workspace --help` 按未知命令报用法错误（退出码 2）。
- `vp run @kxh4892636/nano-flow#test` 与 `vp check` 全绿（预计减少约 2409 行测试）。

## 验收证据（2026-11-09）

- 删除了 `src/builtins/workspace/`（19 个文件，含 testing 夹具）。
- `dist/main.mjs` 的 Commands 只剩 `anki`、`fixture`、`self`（258.88 kB → 缩到 197.82 kB 后随 002 变化）。
- `nnf workspace` 返回 `{"success":false,"error":"error: unknown command 'workspace'"}`，退出码 2。
- 同步修正 `src/builtins/discover.spec.ts`：命令清单断言与契约哈希（`72f09e19…`）。
- `vp run @kxh4892636/nano-flow#test` 850 条全绿；`vp check` 无告警无类型错误。
