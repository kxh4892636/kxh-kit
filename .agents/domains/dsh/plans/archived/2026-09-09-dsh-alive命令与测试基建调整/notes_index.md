# Notes Index

<!-- 由 nano_flow_check 生成，请勿手改 -->

| Name | Description | Related Note |
| --- | --- | --- |
| [001-vp与vitest基建迁移](001-vp与vitest基建迁移.md) | `packages/dsh-keep-alive` 使用仓库统一的 vp 工具链：`vp pack` 构建、`vp check` 检查、`vp test` 测试、`vp test --run --coverage` 覆盖率；四条命令全部通过，且行为与迁移前一致。 | — |
| [002-cli改名与默认端口](002-cli改名与默认端口.md) | 用户以 `dsh-alive` 调用工具；`start`/`stop`/`logs` 省略 `--port` 时作用于 3080，`status` 无参数仍列出全部受管端口。 | 001-vp与vitest基建迁移 |
| [003-移除class与lint强制](003-移除class与lint强制.md) | `packages/dsh-keep-alive` 的 src 中不再出现 class；工作区根 lint 配置对该包 src 强制 `max-classes-per-file: 0`，`vp check` 全绿。 | 001-vp与vitest基建迁移 |
