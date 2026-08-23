---
name: loop-x-cli
description: 使用 loopx CLI 管理 LoopX 自身与受管 skills，或通过 AnkiConnect 操作本机 Anki；当任务涉及 CLI 自管理或 Anki 操作时使用。
---

# LoopX CLI

`loopx` 将自身管理和 Anki 自动化收口在一个命令入口。根据任务只读取一份路由：

- CLI 自管理任务：读取 [self 路由](references/self.md)。
- Anki 操作：读取 [Anki 路由](references/anki.md)。

Loop Kit 的需求打磨、计划与实现流程属于 `loop-x` 工作流 skill，不通过本 skill 路由。

## 共享契约

- 现场运行 `loopx --help`、`loopx <group> --help` 或更深层的 `--help`，以 CLI 生成的命令和 option 为事实来源。
- 输入只使用命名 option。默认真实执行；在写命令上先用 `--dry-run` 获取计划，确认后移除该 option 执行。
- stdout 是成功 JSON，stderr 是错误 JSON；退出码 0 表示成功、1 表示运行时错误、2 表示用法错误。失败时优先按 `hint` 修正前置条件。
