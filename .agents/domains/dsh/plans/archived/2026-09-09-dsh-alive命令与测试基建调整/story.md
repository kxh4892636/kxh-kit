# dsh-alive命令与测试基建调整

> 由 spec 迁移生成（2026-11-07）；原 Plan 无独立 story。

## US-001 dsh-alive命令与测试基建调整

已交付的 `packages/dsh-keep-alive` 需要四项调整：命令名改为 `dsh-alive`；`--port` 缺省 3080；用 vp 与 vitest 替换包内命令；代码中禁止使用 class。包未发布、本机也未全局安装，但 `%LOCALAPPDATA%\dsh-keep-alive\3080` 上有正在运行的受管实例（当前 DSH Web 界面由它提供），本次改动不得使它失去管理通道。
