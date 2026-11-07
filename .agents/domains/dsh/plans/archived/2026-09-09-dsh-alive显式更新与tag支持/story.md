# dsh-alive显式更新与tag支持

> 由 spec 迁移生成（2026-11-07）；原 Plan 无独立 story。

## US-001 dsh-alive显式更新与tag支持

已交付的 `packages/dsh-keep-alive` 在启动后立即并每 13 小时后台检查并自动切换 DSH 版本，切换可能中断正在执行的任务；用户要求移除该自动机制，改为显式命令，并支持发布标签（tag）。
