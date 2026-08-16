---
status: completed
blocked_by: []
---

# 本地 VSCode 打开

## 交付

在选中的 diff 文件中一键打开本机 VSCode 的对应文件，并定位到对应行。

## 范围

做：

- fork 的 `/api/open-in-editor` 端点改造为 IPC handler，收敛为 editor-adapter 接缝。
- v1 仅 VSCode：`code` CLI（`code -g file:line`）或 `vscode://file/...` 协议。
- 行号定位使用点击处 side 对应的行号。

不做：cursor / trae（仅留接缝）、远程打开（在 06）。

## 直接依赖

- 01：open-in-editor 端点与 diff 行上下文来自 fork，本 issue 做 IPC 适配与行号定位。

## 验收

- [x] 在 diff 中点击打开按钮，本机 VSCode 打开对应文件并定位到对应行号。

## 交付物与证据

- 交付物：`src/main/editor/editor-adapter.ts`（editor-adapter 接缝 port）、`src/main/editor/vscode-adapter.ts`（`vscode://file/<路径>:<行号>` 协议打开）、`api-router.ts` 本地分支（editor.id 策略：缺省/vscode 放行，none 禁用 400，其他编辑器 400）与 `openInEditorAvailable` 本地上报、`index.ts` 接线（惰性闭包保持 e2e monkey-patch 生效）、`App.tsx` canOpenInEditor 恢复 `id === "none"` 隐藏语义（fork 改动第 8 处，含 06 短路绕过的行为修复）、`e2e/open-in-editor.spec.ts`。
- 合回：merge `d743417`（`3d74a5a`，8 文件 +379/-31）。
- 验证证据：单元/组件 847 通过（新增 adapter 7 例 + router 本地打开 6 例）；e2e 10/10（新增 open-in-editor 用例真实驱动 UI：split/unified 两布局各点一次，捕获 URL 断言精确到行号 `:2`）；合回后 main `pnpm ready` exit 0（wiki 断链已随用户侧清理消失，7 任务全绿）。
- 验证环境：Windows 11 + Node 22 + pnpm 11；协议 URL 经 monkey-patch `shell.openExternal` 捕获断言，未真实拉起 VSCode（真实拉起为人工走查补充）。
- code review 结论：Standards 无硬性违规（editor/ 子目录收敛、头注登记齐全；adapter 契约已补「失败不得抛错穿透」注释）；Spec 无缺口，范围三项全覆盖。
- 接受偏差：打开机制选 vscode:// 协议而非 `code -g` CLI（issue 二选一即合规；win32 的 code 为 .cmd shim，Node 18.20+/20.12+ 无 shell 无法 spawn，协议零依赖且官方支持行号定位）；行号「点击处 side 对应」未改客户端——vendored 组件已满足（split 删除行不展示按钮、一律传新侧/工作区文件行号，unified 同理）。

## 上下文

- [spec.md](spec.md)

## 下一步

已完成
