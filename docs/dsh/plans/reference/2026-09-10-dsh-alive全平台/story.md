# dsh-alive 全平台

## 原始想法

/nano-flow packages/dsh-keep-alive 支持全平台

## 角色

- **跨平台 DSH 使用者**：在 Linux（真实服务器/开发机、无桌面会话）或 macOS 上使用 `dsh-alive` 的用户；当前版本在这些机器上直接报错退出，只能用前台终端跑 DSH。
- **Windows DSH 使用者**：现有用户，Windows 行为是既有验收基线，本次改动不得回退。
- **工具维护者**：需要在三种平台上维护同一套 CLI、状态目录与控制通道，且能在没有 mac 实机的条件下对 macOS 支持作出可复核的声明。

## 故事

### US-001 在 Linux 上后台保活

作为在 Linux 上使用 DSH 的用户，我运行 `dsh-alive start` 后关闭终端，DSH 仍在后台服务，以便长时间任务不因 SSH 断开而中断。

- [ ] `dsh-alive start` 在 Linux 上成功启动 DSH，关闭启动终端（或结束该 shell）后端口仍可达。
- [ ] `status`、`logs`、`stop` 在 Linux 上给出与 Windows 一致的语义（停止后不复活，重复 start 即重启）。
- [ ] 状态、版本、日志存放在该用户的数据目录下，不写系统目录，也不要求 root 或系统服务。

### US-002 在 macOS 上后台保活

作为在 macOS 上使用 DSH 的用户，我希望同一份 `dsh-alive` 无需额外配置即可工作，以便不用为 mac 单独维护脚本或 LaunchAgent。

- [ ] macOS 走与 Linux 相同的 CLI 入口与控制协议，不再因平台检查直接报错。
- [ ] 进程身份、端口归属与进程树终止在 macOS 上有明确实现，未实机验证的部分在 README 与交付记录中显式标注。
- [ ] README 给出一条用户可自行执行的 macOS 验证命令与判定标准。

### US-003 不破坏 Windows 行为

作为现有 Windows 用户，我升级后行为与之前一致，以便升级工具不改变既有运维方式。

- [ ] Windows 仍使用命名管道、`%LOCALAPPDATA%` 与 PowerShell 进程快照；既有 Windows 测试用例语义不变。
- [ ] 包元数据不再对非 win32 平台拒绝安装，但 Windows 安装路径与命令完全不变。

## 迷雾

- macOS 实机行为（`lsof` 端口归属、BSD `ps` 字段解析、Unix socket 路径长度上限）只能在用户自己的 mac 上确认；本 Flow 按「适配器就绪 + 解析层测试」交付。
- Linux 上 systemd 用户服务、注销后恢复仍不在范围；与既有「非范围」一致。

## 上下文

- [现有实现 README](../../../packages/dsh-keep-alive/README.md)
- [原 Plan（显式排除 macOS/Linux）](../archived/2026-09-08-终端后台保活工具/spec.md)
- [领域语言](../../CONTEXT.md)
- 设计问答：工作区 `.flow/quest/2026-09-10-dsh-alive全平台.md`
