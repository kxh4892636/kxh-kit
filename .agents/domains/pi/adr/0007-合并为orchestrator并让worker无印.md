# 合并为 orchestrator，并让 worker 只有笔没有印

背景：`pi-toolkit` 里 Nano Flow 只管"单会话把一个 Plan 推进完"，而多 Plan 并行需要"一个会话编排、多个会话执行"。若把授权也交给执行方，worker 就能给自己加活、自己宣布完成；若保留独立开关与独立命名，模型和用户都要同时记住两套词。

决策：**Nano Flow 与编排合并为一个能力 `orchestrator`**（目录、开关、命令、工具名、配置节、session entry 统一改名，旧配置名在加载时迁移），并且 **worker 只有笔没有印** —— note 级动作全归 worker（`create` / `link` / `merge` / `update` / `status`），plan 级动作（`init` / `move`）与结束判定（`completed`）归编排方。

理由：授权单位是 Plan 而不是 note，所以 note 级写入不构成提权；而"宣布完成"是唯一不能下放的判断，因为它决定别人的下游能否解锁。合并命名是为了让模型只处理一套词汇，减少"同一件事两种叫法"导致的误用。

## Considered Options

- **保留 ticket 作为授权对象**：单用户场景下授权、幂等、多源归属都退化为零，只增加状态机负担。
- **保留第 5 个开关**：`tools.orchestrator` 默认关闭已经是足够的 opt-in，多一个开关只增加认知成本。
- **worker 独立 Plan 文件（一 ticket 一 Plan）**：Plan 是"一次工作"的单位而非"一次执行"，按执行划分会产生碎片。
- **编排方保留一个跨域 `move` 例外**：与"对业务域只读"冲突；孤儿 Plan 由人工处理。

## Consequences

- 旧 `pi-toolkit.json` 的 `tools.nanoFlow` / `nanoFlow` 在加载时自动折进新名，两者并存时新名优先。
- session entry 改名后，改名前的会话模式不生效，回落到 `orchestrator.always`。
- 编排方对业务域零写权限；worker 若不写 `completed`，Plan 会停在 `waiting(needs=review)`，由启动对账摆到人面前。
