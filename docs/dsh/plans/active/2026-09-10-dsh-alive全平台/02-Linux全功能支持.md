---
status: pending
blocked_by: ["01"]
---

# Linux 全功能支持

## 交付

在 Linux 上安装 `dsh-alive` 后可以 `start` 后台启动 DSH、关掉终端继续服务，并用 `status`、`logs`、`stop` 完成既有运维动作。

## 范围

- Linux 平台适配器：`/proc` 直读进程表（`stat` 的 ppid 与 starttime、`cmdline`、跳过僵死进程），`lsof` 查端口监听者，SIGTERM → SIGKILL 终止并复核身份。
- 状态目录 `${XDG_DATA_HOME:-~/.local/share}/dsh-keep-alive`，目录权限 `0700`；控制通道为每端口目录内 `control.sock`，绑定前清理陈旧 socket、`stop` 后删除，绑定前校验路径长度。
- supervisor 在 POSIX 上以 `detached: true` + `stdio: "ignore"` + `unref()` 脱离终端。
- npm 解析候选路径扩展（Linux 标准布局、发行版目录、Homebrew 目录），全部缺失时给出可读错误。
- 移除 `"os": ["win32"]`，改为运行时平台检查；CLI 帮助文本去掉 Windows 限定；README 增补 Linux 数据目录与使用说明。
- Linux 真实 DSH 端到端冒烟：关闭启动终端后端口仍可达。

不做：macOS 适配器、系统服务、开机自启。

## 直接依赖

- 01: 消费其平台适配器接口、平台无关的 `sameProcess`/`descendants`/终止循环，以及跨平台可跑的测试边界。

## 验收

- [ ] Linux 上 `start` 成功：受管进程存活、端口属于其进程树、HTTP 可达三项就绪判定成立。
- [ ] 结束启动终端（或终止发起进程）后端口仍可达；`status` 能报告版本、PID 与状态。
- [ ] 重复 `start` 重启该端口实例且旧进程树退出；`stop` 后等待超过退避窗口仍不复活；不同端口互不影响。
- [ ] 外部程序占用端口时报错且不终止该进程；`status`、`logs` 可诊断失败。
- [ ] 状态、版本、日志位于用户数据目录且目录权限为 `0700`；不写系统目录，不需要 root。
- [ ] 真实 DSH 冒烟使用隔离 `DSH_HOME` 与独立端口，不触发模型调用；证据包含实际 PID、端口与 HTTP 响应。
- [ ] npm 安装路径解析在 Linux 标准布局下工作，候选全缺失时报错文本可读。
- [ ] `check`、`test:coverage`、`build` 通过；Linux 代码被真实子进程测试覆盖，覆盖率 >= 80% 且未排除平台文件。
- [ ] README 含 Linux 使用说明；Windows 说明与行为未变。

## 上下文

- [执行契约](spec.md) 的「Linux（/proc）」「状态目录与控制通道」「npm 解析」。
- 上游 issue：[01 平台无关进程核心与适配器收口](01-平台无关进程核心与适配器收口.md)。
- 领域语言：[DSH](../../../CONTEXT.md)；用户故事 [US-001](story.md)。

## 下一步

/code-delivery。

## 交付记录

待填写：交付物与验证证据。
