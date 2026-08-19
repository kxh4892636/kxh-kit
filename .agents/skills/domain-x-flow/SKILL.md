---
name: domain-x-flow
description: 业务域 Workflow 的存放地与索引; 开始任务或遇到 block 卡点时, 按业务域查阅对应 README.md 的 路径-触发条件 索引, 命中触发条件时加载对应 Workflow.
---

# domain-x-flow

每个业务域一个目录: 目录内一份 `README.md` 索引和若干 Workflow 文件. Workflow 的创建, 修订与删除只能经 `/to-workflow` 进行.

## 使用

1. 从 `CONTEXT-MAP.md` 定位任务所属业务域.
2. 查阅该业务域与 common 的 `README.md` — 各是一份 路径-触发条件 索引.
3. 命中触发条件: 读取对应路径的 Workflow 并遵循. 未命中: 不读取任何 Workflow.

## 业务域索引

| 业务域 | 索引 |
| ------ | ---- |
| common | [common/README.md](common/README.md) |

新业务域由 `/to-workflow` 按需登记到本表.

