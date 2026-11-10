---
name: "006-rpc模式空回答对齐TUI"
description: "rpc/print 模式下空的自定义回答被记成有效答案（A1 为空但 skipped=false），TUI 则留在原题。让两种模式同一条空输入规则。"
status: completed
related_noted: []
---

# 006-rpc模式空回答对齐TUI

## 交付

- `ask/ask.ts` 的 `askSequential`：自定义回答改为循环取文本，空白输入继续问同一题，只有取消（`undefined`）才离开；与 TUI 的「空输入不前进」同一条规则。

## 验收

- rpc / print 下空输入不产生 `skipped: false` 的空答案。

## 证据

- 新增测试（`ask.test.ts`）：输入序列 `["", "   ", "自己写"]` 得到 `A1: 自己写（自定义）`；旧实现得到 `A1: （自定义）`（已用 `git checkout HEAD` 复现）。
