# Notes Index

<!-- 由 nano_flow_check 生成，请勿手改 -->

| Name | Description | Related Note |
| --- | --- | --- |
| [001-平台无关进程核心与适配器收口](001-平台无关进程核心与适配器收口.md) | 进程身份、进程树与终止循环成为平台无关的一份实现，三个平台各自只提供「读一次进程表」与「终止一个进程」；Windows 行为与现有测试不变。 | — |
| [002-Linux全功能支持（1-2）](002-Linux全功能支持（1-2）.md) | 在 Linux 上安装 `dsh-alive` 后可以 `start` 后台启动 DSH、关掉终端继续服务，并用 `status`、`logs`、`stop` 完成既有运维动作。 | 001-平台无关进程核心与适配器收口 |
| [003-Linux全功能支持（2-2）](003-Linux全功能支持（2-2）.md) | 在 Linux 上安装 `dsh-alive` 后可以 `start` 后台启动 DSH、关掉终端继续服务，并用 `status`、`logs`、`stop` 完成既有运维动作。（续 2） | — |
| [004-macOS支持与自验证交付](004-macOS支持与自验证交付.md) | macOS 上 `dsh-alive` 走同一 CLI 与控制协议，不再被平台检查拒绝；用户可执行 README 中的一条命令自行验证，未实机验证的事实被显式记录。 | 002-Linux全功能支持（1-2） |
