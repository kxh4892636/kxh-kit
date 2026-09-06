# DSH 管理器

使用 Go 与 Windows 系统控件管理 DeepSeek Harness。目标 Windows 10/11 x64；管理器为单个 exe，使用系统 Node.js，不内嵌 Node.js。

## 使用

双击 `dsh-manager.exe`，填写工作目录和端口，点击“启动 / 首次安装”。首次联网从官方 npm 安装 DSH 到 `%LOCALAPPDATA%/DSHManager`，之后使用已安装版本启动。Node.js 路径留空使用 PATH，也可选择包含 npm 的 Node.js 安装。

使用 Node.js 22.19+（22 系列）或 24+。不兼容或缺失时窗口显示原因。点击“打开 Web UI”使用服务公布的认证地址；访问令牌仅保存在内存，日志隐藏令牌。配置和版本记录写入用户数据目录，现有全局 DSH 安装保持独立。DSH 本身仍使用默认用户 profile 与数据。

启动仅监听 `127.0.0.1`。端口占用时提示错误，不接管已有服务；停止清理本工具创建的进程树。

关闭窗口会进入托盘，双击托盘图标恢复窗口。使用“退出并停止服务”完整退出。异常退出自动重启可开关，连续失败逐步退避到 30 秒；HTTP 暂不可达只提示，不强制中断正在执行的任务。停止按钮也能取消待重启任务。

“登录时启动并保活”默认关闭；勾选后写入当前用户的登录项，下次登录后台启动管理器及 DSH，不需要管理员权限。移动 exe 后需重新设置登录项；注销或完整退出后不再保活。

默认启动时和每 6 小时检查官方 npm latest 并下载更新，支持关闭自动下载和手动检查。运行时下载不打断服务，待应用版本在下次显式启动或“更新并重启”时应用；异常退出保活仍使用原版本。下载期间点击停止不会被稍后的更新重启覆盖。

新版首次启动失败会尝试一次旧版回退，并暂停该失败版本的自动重试。“检查更新”可重新准备失败版本。回退只涉及程序版本，不撤销 DSH 已执行的数据迁移。检查更新完成时清理本工具拥有的旧目录，保留当前、上次成功和待应用版本。

## 构建与验证

安装 Go 1.26.8 或更新版本，在本目录执行：

```powershell
./build.ps1
go vet ./...
go test -p 1 '-coverprofile=coverage.out' ./...
go tool cover '-func=coverage.out'
```

产物为 `dist/dsh-manager.exe`。构建阶段使用固定版本的 rsrc 生成内嵌 manifest；运行时不需要额外的 GUI DLL 或 WebView。

联网真实冒烟使用专用目录，隔离 DSH profile，只启动测试创建的进程：

```powershell
$env:DSH_SMOKE_ROOT = Join-Path $env:TEMP 'dsh-manager-smoke'
go test -v -timeout 15m -run TestRealDSHInstallationAndLifecycle ./internal/manager
```

自动化 GUI 测试使用 Windows 消息循环，需在有桌面会话的 Windows 环境执行。测试会短暂激活自己的窗口，不需要人工点击。

`./scripts/measure.ps1 -Screenshot ./dist/window.png` 在独立配置目录执行首次及五次暖启动，测量管理器空闲 60 秒 CPU 与工作集，并保存原生窗口截图。[验证记录](verification.md) 包含实际结果和平台范围。
