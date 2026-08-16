---
status: in_progress
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

- [ ] 在 diff 中点击打开按钮，本机 VSCode 打开对应文件并定位到对应行号。

## 上下文

- [spec.md](spec.md)

## 下一步

/implement
