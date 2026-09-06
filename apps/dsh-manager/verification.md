# 交付验证

## Issue 01：原生窗口、安装与启动

2026-09-06，结论 passed。环境 Windows 11（10.0.26100）、Go 1.26.8 windows/amd64、本机 Node.js。固定审查点 d2915ca，审查包含本 issue 的完整 WIP。

- `go vet ./...` 通过，gofmt 完成。
- `go test -p 1 '-coverprofile=coverage.out' ./...` 全部通过；`go tool cover '-func=coverage.out'` 总 statement 覆盖率 85.9%，包含 GUI、Windows adapter、入口代码。
- 原生消息循环测试覆盖配置显示/保存/错误、启动/重启/停止、日志更新、布局、单实例激活与注销。
- 进程测试验证受管子进程端口归属、外部端口拒绝、进程树停止、取消和退出码；安装测试验证失败不提升、损坏安装恢复、无归属目录拒绝清理；管理测试验证主动停止取消重启、点击顺序、认证地址与日志脱敏。
- `DSH_SMOKE_ROOT=<专用目录> go test -v -timeout 15m -run TestRealDSHInstallationAndLifecycle ./internal/manager` 通过：官方 npm 安装 DSH 0.1.2-rc.1，隔离 profile 和工作目录，测试端口 61035，认证后 HTTP 200，停止后端口释放。上游启动令牌不写入报告。
- 首次真实探测失败的原因是上游根页面要求令牌和 cookie 握手；修复为解析受管进程的本机地址，CookieJar 验证就绪，浏览器使用同一认证地址，日志隐藏令牌；回归与真实重验均通过。
- `./build.ps1` 构建单 exe 成功，当前大小 6,989,312 字节。
- `./scripts/measure.ps1` 在独立用户数据目录采样：首个启动 114.61 ms，后续五次 57.40/60.68/68.91/62.02/63.56 ms；工作集 18.88–19.22 MiB，60 秒空闲累计 CPU 时间 0.0 秒（系统采样精度内）。该测量针对管理器窗口，不包含 DSH；不是操作系统冷启动基准。
- Standards 与 Spec 双 agent 审查通过；已修复重启取消竞态、损坏安装不可重试、DPI 最小尺寸及最小化布局重入。

Windows 10 兼容性尚未在 Windows 10 实机验证。托盘保活和自动更新属于后续 issue，本阶段未声明交付。
