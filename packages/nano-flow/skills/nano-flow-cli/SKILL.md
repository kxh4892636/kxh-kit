---
name: nano-flow-cli
description: 使用 nnf 管理 CLI 与受管 skills，或通过 AnkiConnect 操作本机 Anki 时使用。
---

# Nano Flow CLI

按任务只读对应路由：

- CLI 与受管 skill 管理：[self](references/self.md)。
- 本机 Anki 操作：[Anki](references/anki.md)。

需求、计划与交付由 `nano-flow` 工作流路由。

## 共享契约

- 命令与 option 以现场 `nnf --help` 及各级 `--help` 为准，输入只用命名 option。
- 默认真实执行；写命令先加 `--dry-run` 核对计划，确认后移除执行。
- stdout 返回成功 JSON，stderr 返回错误 JSON；退出码 0=成功、1=运行时错误、2=用法错误。失败按 `hint` 修正前置。
