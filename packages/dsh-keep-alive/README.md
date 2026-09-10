# dsh-alive

DSH 后台保活工具（npm 包名 `dsh-keep-alive`，命令 `dsh-alive`）：按端口在后台运行 DSH，关闭终端后继续服务。使用系统 Node.js ≥24.19.0 和 npm，无需管理员权限。

| 平台    | 状态                           | 进程表 / 控制通道                   |
| ------- | ------------------------------ | ----------------------------------- |
| Windows | 支持（既有行为，本机未回归）   | PowerShell CIM 快照 / 命名管道      |
| Linux   | 支持（本机实测）               | `/proc` 直读 + `lsof` / Unix socket |
| macOS   | 暂不支持（在此平台会报错退出） | —                                   |

先在 `packages/dsh-keep-alive` 目录执行 `pnpm pack` 生成安装包，再从仓库根安装：

```sh
npm install -g ./packages/dsh-keep-alive/dsh-keep-alive-0.0.1.tgz
dsh-alive start
dsh-alive status
dsh-alive logs
dsh-alive update
dsh-alive stop
```

Windows 用 PowerShell 执行同样的命令。Linux 上建议先确认 `lsof` 可用（`command -v lsof`）：它只用于把端口归属到受管进程，缺失时仍可启动，但失去「端口被外部进程占用」的提前报错。

启动成功后命令退出；关闭终端仍继续运行。`start`、`update`、`stop`、`logs` 省略 `--port` 时作用于 3080，显式 `--port N` 覆盖该默认值，范围 1–65535。`status` 省略 `--port` 时列出全部受管端口，带 `--port N` 查询单个。重复 `dsh-alive start` 会重启该端口实例。不同端口独立，同一用户的同一端口只有一个受管实例；外部程序占用端口时报告错误，不终止它。

## 版本与发布通道

`start` 与 `update` 都先解析当前通道（`--tag`）在 npm 上的精确版本：

- `start`：版本有变化则安装后启动；查询或安装失败时回退到 `state.json` 已缓存的版本继续启动，原因记入 `status.error` 与日志。重复 `start` 即重启。
- `update`：版本有变化则安装并记录，**不启动、不重启**；运行中的实例继续服务旧版本，新版本在下次 `start` 生效。没有新版时不做任何事。安装失败时以错误退出，不改变已有版本与运行状态。

通道是端口的属性：省略 `--tag` 时沿用该端口上次使用的通道，缺省 `latest`；`status.tag` 显示当前通道，`status.prepared` 显示已安装并记录、但尚未生效的版本。可用任意 npm dist-tag，例如 `latest`、`alpha`、`next`；显式换通道用 `dsh-alive update --tag <名称>` 或 `dsh-alive start --tag <名称>`。旧 `state.json` 没有 `tag` 字段时按 `latest` 处理。

工具不再在后台自动检查更新：何时更新、何时重启都由命令决定，因此不会在你没有执行命令时切换版本。`update` 在实例未运行时只准备版本，也不拉起后台控制进程。

升级工具后，由旧版启动的 supervisor 不认识发布通道：`start` 会让它退出并改由新版接管该端口（实例本就要重启）；`update` 会明确报错，提示先执行 `start`。

首次启动从 npm 官方源 `https://registry.npmjs.org` 解析并安装目标版本的 `@deepseek-ai/dsh`，不读取本机 registry 配置——镜像源可能缺发布标签的依赖（本机 npmmirror 就缺 alpha 的子包），跟随本机配置会得到不可复现的结果；需要镜像时用环境变量 `DSH_ALIVE_REGISTRY` 覆盖。已缓存的可运行版本可离线启动。首次查询及安装总限时 10 分钟；启动就绪限时 60 秒。就绪要求受管进程存活、端口属于其进程树且 HTTP 可达。

DSH 使用 `web` profile，绑定 `127.0.0.1`，不自动打开浏览器。通过 `logs` 找到 DSH 输出的登录链接并打开；未认证首页返回 401 属于正常行为。登录链接含令牌，不应分享日志。

启动继承当前目录和环境（包括 `DSH_HOME`、npm registry 配置）；重复启动采用新的目录和环境。工具状态、版本及日志按端口存放：

| 平台    | 数据目录                                                 |
| ------- | -------------------------------------------------------- |
| Windows | `%LOCALAPPDATA%/dsh-keep-alive/<port>`                   |
| Linux   | `${XDG_DATA_HOME:-~/.local/share}/dsh-keep-alive/<port>` |

Linux 上控制通道是该目录内的 Unix socket（`control.sock`），目录权限为 `0700`，只有当前用户可访问；`stop` 或 supervisor 正常退出后会删除 socket 文件。可用环境变量 `DSH_ALIVE_DATA` 覆盖数据目录根（测试与隔离冒烟使用）。DSH 会话、插件仍由 DSH 管理；多个端口沿用同一 DSH_HOME 时不提供会话隔离。

DSH 异常退出按 1、2、4、8、16、30 秒退避恢复；稳定运行 60 秒后重置。`stop` 取消保活并关闭该端口 supervisor。日志每文件最多 5 MiB，保留当前及两个旧文件；`logs` 打印当前文件。

网络或安装失败时保持当前版本；`start` 启动新版失败时恢复上一可运行版本，`status.error` 记录 `Rolled back …`。回退仅恢复可执行文件，不保证逆转 DSH 对用户数据的修改。如果旧版也无法恢复，状态明确显示 failed，可查看日志后重试 `start`。

停止或重启会协调尚未完成的安装，可能等待剩余安装时间（一次查询与安装合计最多 10 分钟），避免新旧 supervisor 同时修改版本目录。工具会保留安装过的版本及隔离的损坏目录，便于诊断；需清理时先 `stop`，再按端口删除该工具的数据目录，DSH_HOME 中的用户数据不会随之删除。

不包含系统服务、开机自启、用户注销或系统重启后恢复，也不承诺 supervisor 被强杀后的恢复。不内嵌或升级 Node.js。工具自身通过 npm 更新。

POSIX 上的已知边界：受管进程树按 `ppid` 归属，而父进程一旦退出，子进程会被内核 reparent 到 pid 1。因此清理必须在根进程仍可读时开始：`stop`/重启的第一轮快照会先取下整棵可见子树再终止它，之后逐轮用已发现的进程继续追查新后代。若根进程在首次快照前就已被回收，剩余后代不再能被归属为受管进程——此时工具提前结束清理而不误杀外部进程，遗留的端口占用会由下一次 `start` 的就绪检查报出。

开发验证：

```sh
pnpm --filter dsh-keep-alive check
pnpm --filter dsh-keep-alive test
pnpm --filter dsh-keep-alive test:coverage
pnpm --filter dsh-keep-alive build
```

打包：在 `packages/dsh-keep-alive` 目录执行 `pnpm pack`（会把 `catalog:` 依赖替换为精确版本，产物为 `dsh-keep-alive-0.0.1.tgz`）。

覆盖率由 vitest 的 v8 provider 直接对 `src/**/*.ts` 采样，排除 `*.test.ts` 与 `src/testing/**`，包含 CLI、后台入口与平台适配器（Linux 适配器用真实 `/proc` 与真实子进程测试，Windows 专属用例在非 win32 条件跳过）。测试的系统交互采用临时目录和独立端口，不调用模型。
