# dsh-keep-alive

Windows 上的 DSH 后台保活工具。使用系统 Node.js ≥24.19.0 和 npm，无需管理员权限。

```powershell
npm install -g ./dsh-keep-alive-0.0.1.tgz
dsh-keep-alive start --port 3080
dsh-keep-alive status
dsh-keep-alive logs --port 3080
dsh-keep-alive stop --port 3080
```

启动成功后命令退出；关闭终端仍继续运行。重复 `start --port 3080` 会重启该端口实例。不同端口独立，同一用户的同一端口只有一个受管实例。端口必须显式指定，范围 1–65535；外部程序占用端口时报告错误，不终止它。

DSH 使用 `web` profile，绑定 `127.0.0.1`，不自动打开浏览器。通过 `logs` 找到 DSH 输出的登录链接并打开；未认证首页返回 401 属于正常行为。登录链接含令牌，不应分享日志。

启动继承当前目录和环境（包括 `DSH_HOME`、npm registry 配置）；重复启动采用新的目录和环境。工具状态、版本及日志存放于 `%LOCALAPPDATA%/dsh-keep-alive/<port>`；DSH 会话、插件仍由 DSH 管理。多个端口沿用同一 DSH_HOME 时不提供会话隔离。

DSH 异常退出按 1、2、4、8、16、30 秒退避恢复；稳定运行 60 秒后重置。`stop` 取消保活并关闭该端口 supervisor。日志每文件最多 5 MiB，保留当前及两个旧文件；`logs` 打印当前文件。

首次启动从配置的 npm registry 安装 `@deepseek-ai/dsh@latest`，解析为精确版本后保存；已缓存的可运行版本可离线启动。首次查询及安装总限时 10 分钟；启动就绪限时 60 秒。就绪要求受管进程存活、端口属于其进程树且 HTTP 可达。

不包含系统服务、开机自启、用户注销或系统重启后恢复，也不承诺 supervisor 被强杀后的恢复。不内嵌或升级 Node.js。工具自身通过 npm 更新。

开发验证：

```powershell
pnpm --filter dsh-keep-alive check
pnpm --filter dsh-keep-alive test:coverage
pnpm --filter dsh-keep-alive build
pnpm --filter dsh-keep-alive pack
```

覆盖率包含全部生产 TypeScript（包括 CLI、后台入口与 Windows 适配）；统计编译产物后映射回源码。测试的系统交互采用临时目录和独立端口，不调用模型。
