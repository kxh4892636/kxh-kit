---
status: completed
---

# dsh-alive 全平台

## 问题

`packages/dsh-keep-alive`（CLI `dsh-alive`）目前只在 Windows 上可用：`main.ts` 对任何非 win32 平台直接抛出 `dsh-alive currently supports Windows only`，`package.json` 用 `"os": ["win32"]` 让 npm 在 Linux/macOS 上拒绝安装，`paths.ts` 依赖 `%LOCALAPPDATA%` 与 Windows 命名管道，进程快照/身份/终止全部走 `src/platform/windows.ts` 的 PowerShell + CIM。用户在 Linux 与 macOS 上无法后台保活 DSH，SSH 断开或关闭终端即中断长任务。

用户已确认范围：**Windows、Linux、macOS 三平台**（`.flow/quest/2026-09-10-dsh-alive全平台.md` Q1）。

约束：

- Windows 既有行为不得回退（当前 Windows 用户是既有验收基线）。
- 本机只有 Linux 可端到端实测；macOS 无实机，只能交付可复核的适配器与解析层测试，并把「未实机验证」显式写进 README 与交付记录。
- 控制协议、鉴权、保活退避、版本准备/回退、每端口独立实例等既有语义全部不变；本次只替换平台相关的三件事：进程表来源、进程终止手段、控制通道地址。

## 方案

把平台差异收口为一个窄适配器，其余全部保持平台无关：

- `src/platform/processes.ts`（新，平台无关）：`sameProcess`、`descendants`、以及「多次快照循环、追查两次快照之间的后代、终止前复核身份」的终止循环，由注入的 `snapshot`/`kill` 参数驱动。
- `src/platform/{windows,linux,bsd}.ts`：各自只实现「读一次进程表（含端口监听者）」与「终止一个进程」。
- `src/platform/current.ts`：按 `process.platform` 选择适配器，未知平台给出可读错误。
- `paths.ts` 产出平台正确的状态目录与控制通道地址：Windows 命名管道，POSIX 每端口目录内的 `control.sock`。
- `transport.ts` 与 `spawnSupervisor` 不变协议，只接受「地址」并处理 POSIX 的陈旧 socket 文件与 `detached` 会话脱离。

Linux 用 `/proc` 直读进程表（无 fork、无依赖、starttime 精度 1/100 秒）；macOS 用单次 `ps -eo pid=,ppid=,lstart=,args=` 解析整表；两者共用同一身份判据与终止算法。

## 已排除的备选

- 只补 Linux、macOS 留到以后：用户已确认三平台；分两次 Flow 会重复改同一批文件与文档。
- 把 `process.platform` 分支散布到 `commands.ts`/`instance.ts`/`paths.ts`：平台差异只有「读进程表」「终止进程」「控制通道地址」三处，散布后三份实现必各自漂移。
- 引入原生进程树依赖（如 `@vscode/windows-process-tree` 类）：Windows 侧已有可用实现，POSIX 侧 `/proc` 与 `ps` 足够，新增二进制依赖会破坏「只需系统 Node」的前提。
- Linux 用 `ps` 而不是 `/proc`：就绪阶段每 250 ms 快照一次，60 秒窗口内要 fork 约 240 次，且 `lstart` 只有秒级精度。
- POSIX 上用 TCP 端口或轮询文件代替 Unix socket：现协议已有 nonce + HMAC 鉴权，`node:net` 对命名管道与 Unix socket 是同一 API，改地址即可，无需新协议。
- 保留 `"os": ["win32"]` 只加运行时判断：npm 会在安装期直接拒绝，与目标冲突；安装期硬限制与运行时能力检查职责不同，只保留后者。
- macOS 保持现状不交付代码、只在文档里写「暂不支持」：与用户指令冲突，且放弃可测的解析层收益。

## 实施决策

### 适配器边界

平台只提供两件事，签名沿用现有 `Snapshot`/`Identity`：

```ts
interface Identity {
  pid: number;
  parent: number;
  birth: string;
  command: string | null;
}
interface ProcessSnapshot {
  processes: Identity[];
  owners: number[];
}
interface ProcessSource {
  snapshot: (port: number) => Promise<ProcessSnapshot>;
  terminate: (identities: Identity[]) => Promise<void>;
}
```

- `sameProcess(a, b)` 判据为 `pid` + `birth`；`parent` 只用于构建进程树，`command` 只用于诊断日志，二者不参与判据。理由是 POSIX 上父进程退出后子进程被 reparent（ppid 会变），Windows 上 `CommandLine` 可能为 null；把易变字段放进判据只会产生假阴性（Q10）。Windows 侧同步收敛为同一判据。
- `command` 同时不作为存活性判据：`null` 只说明读不到命令行，活进程也可能如此；把「已退出」判定交给平台的进程表本身（POSIX 的僵尸条目由适配器直接跳过，Windows 退出进程会离开 `Win32_Process`）。
- `descendants` 语义不变：排除 PID 重用、保留已退出父进程的受管后代（`birth` 落在被重用 PID 的新 `birth` 之前）；返回快照里的当前身份，而不是入参身份，使状态变化（如变成僵尸）对调用方可见。
- 终止循环语义不变（终止按批下发，适配器内部逐个复核身份）：第一轮快照必须先于任何终止信号，同一轮按父进程优先终止根进程与当时可见的后代（POSIX 上根进程一旦退出，子进程被 reparent，先杀根会丢掉整棵子树）；搜索锚点随发现扩张，已发现的进程即使之后被 reparent 仍用于搜索它后来派生的后代；每轮对仍存活的受管进程重发终止信号（适配器幂等），10 轮后仍未退出则报错。
- 有界能力边界：若根进程在首次快照之前就已被回收，其后代也已被 reparent 到 pid 1，则这些后代无法被归属为受管进程，终止在第一轮返回而不误杀外部进程。生产路径不会命中（`haltInstance` 从当前快照取身份，首次快照时根进程仍在）；由 `processes.test.ts` 的一条用例显式锁定。

### Linux（`/proc`）

- 进程表：遍历 `/proc/<pid>`，`stat` 取 `ppid` 与 `starttime`，`cmdline`（NUL 分隔）取命令行；跳过状态为 `Z` 的僵死进程（其 `cmdline` 已为空，保留会污染身份复核）。
- `birth`：`(bootTimeSeconds * 1000 + starttime * 10)` 的 ISO 字符串（`btime` 来自 `/proc/stat`，CLK_TCK 固定为 100）；同主机内与 Windows 的 `CreationDate` 同为绝对时间，且精度更高。
- 端口监听者：`lsof -nP -iTCP:<port> -sTCP:LISTEN -t`，输出为 PID 列表；命令缺失或失败返回空集（未知），不报错（Q7）。
- 终止：先 SIGTERM，短等待后 SIGKILL，按 `pid` + `birth` 复核后 `process.kill`。

### macOS（BSD `ps`）

- 进程表：`ps -eo pid=,ppid=,lstart=,args=`（`LC_ALL=C`）一次取全表；按固定列宽切分 `lstart`（`Www Mmm dd hh:mm:ss yyyy`）并解析为 ISO；`args` 直接作为 `command`，含空格不截断。
- 终止与端口归属同 Linux 的公共 POSIX 部分（`lsof`）。
- 解析层接受注入的 `ps` 文本，可在 Linux 上用录制的 BSD 输出直接测试（Q6、Q11）。

### 状态目录与控制通道

| 平台    | 状态目录                                           | 控制通道                                    |
| ------- | -------------------------------------------------- | ------------------------------------------- |
| Windows | `%LOCALAPPDATA%/dsh-keep-alive/<port>`             | `\\.\pipe\dsh-keep-alive-<userHash>-<port>` |
| macOS   | `~/Library/Application Support/dsh-keep-alive/`    | `<port>/control.sock`（目录 `0700`）        |
| Linux   | `${XDG_DATA_HOME:-~/.local/share}/dsh-keep-alive/` | `<port>/control.sock`（目录 `0700`）        |

- POSIX socket 路径在绑定前校验长度（≤ 90 字节），超限给出明确错误而不是 `EINVAL`。
- 绑定前 `unlink` 陈旧 socket 文件；`stop` 后删除 socket 文件。
- supervisor 以 `detached: true` + `stdio: "ignore"` + `unref()` 启动（Windows 保留 `windowsHide`），POSIX 上新建进程组以免被终端 SIGHUP 带走。已现场验证：父进程退出后 supervisor 存活且 Unix socket 可连。

### npm 解析

版本解析与安装仍用 `node <npm-cli.js>` 而不是 PATH 里的 `npm`，但候选路径扩为：`<nodeDir>/node_modules/npm/bin/npm-cli.js`（Windows/nvm 布局）、`<nodeDir>/../lib/node_modules/npm/bin/npm-cli.js`（Linux 标准布局）、`/usr/share/nodejs/npm/bin/npm-cli.js`、`/usr/local/lib/node_modules/npm/bin/npm-cli.js`、`/opt/homebrew/lib/node_modules/npm/bin/npm-cli.js`；全部缺失时报错并提示通过 `PATH` 安装 npm。理由：supervisor 继承的环境不一定含 PATH，用与当前 Node 同装的 npm 最可复现。

### 保持不变

控制协议（nonce + HMAC + 单行 JSON）、每端口一个 supervisor、退避序列 1/2/4/8/16/30 秒与 60 秒稳定重置、就绪三重判定（受管进程存活、端口属于其进程树、HTTP 可达）、版本准备与回退、`--tag` 通道语义、日志 5 MiB × 3 上限、`stop` 后不复活。

## 工作环境

- 当前执行环境：Linux（本机），系统 Node.js v24.19.0，pnpm 11.22.0，vite-plus；仓库根 `package.json` 声明 `engines.node >= 22.12.0`，本包运行下限保持 `>=24.19.0`。
- 现场核实：`/proc/<pid>/stat`、`/proc/stat`（`btime`）、`lsof -nP -iTCP:<port> -sTCP:LISTEN -t`、`ps -eo pid=,ppid=,lstart=,args=` 均可用；`detached` + Unix socket 的 supervisor 在父进程退出后存活已验证。
- Windows 代码保留但本机无法运行：Windows 专属测试以 `process.platform === "win32"` 条件跳过，其状态必须在交付记录中如实标注。
- 需要访问 npm registry（真实 DSH 冒烟）；测试使用临时状态目录、独立端口与隔离 `DSH_HOME`，不触发模型调用。
- 若创建 worktree，统一位于仓库 `.worktrees`。

## 范围

- 平台适配器收口与三平台实现（Windows 语义冻结、Linux 新增、macOS 新增）。
- 状态目录、控制通道地址、后台脱离的跨平台化。
- 包元数据、CLI 帮助文本、README 的跨平台化。
- 三平台测试与覆盖率覆盖（不排除任何平台文件）。
- Linux 真实 DSH 端到端冒烟；macOS 解析层与自验证命令。

## 非范围

- 系统服务、开机自启、用户注销或系统重启后恢复、supervisor 被强杀后的恢复。
- 内嵌或升级 Node.js；工具自身自动更新；会话隔离；历史实现兼容迁移。
- Windows 行为的任何语义变更（含命名管道、`%LOCALAPPDATA%`、PowerShell 快照）。
- macOS 实机验收（无环境；以自验证命令移交用户）。
- 模型调用测试。

## 待定

- macOS 实机上的三处未知：`ps` 的 `args` 是否对长命令行截断、`lsof` 返回格式、Unix socket 路径长度上限。三者都有测试或降级路径，实机结果只影响文档表述，不影响实现结构；恢复条件为用户执行 README 中的自验证命令并回报。

## 执行基线

状态：2026-09-10 现场核实后确立，auto 模式基线卡自动确认（`extensions/QUESTIONS.md` 与 `extensions/workflows/README.md` 现场均为空，无遗留问题）。

### 工作环境

- 当前工作区 Linux（Debian 内核 5.15），系统 Node.js v24.19.0、pnpm 11.22.0、vite-plus 0.2.6；仓库根声明 `engines.node >= 22.12.0`，本包下限 `>=24.19.0`。
- 现场可用：`/proc/<pid>/stat`、`/proc/stat`、`lsof`、`ss`、`netstat`、`ps -eo pid=,ppid=,lstart=,args=`；`detached` 子进程 + Unix socket 在父进程退出后存活已验证。
- npm：`@deepseek-ai/dsh` 官方源与本机内网镜像（`https://bnpm.byted.org`）均可解析到 `0.1.5-rc.1`；默认 registry 走官方源，真实冒烟如需镜像用 `DSH_ALIVE_REGISTRY` 覆盖。
- 本机限制：`apps/etf-service`、`apps/etf-dashboard` 未安装依赖（`pnpm install --frozen-lockfile` 因内网镜像缺 `isbot@5.2.2` 报 `FETCH_404`，两次尝试均复现），因此仓库级 `vp run -r --no-cache test` 在 etf-service 处直接报「cannot find binary path」而不可执行。
- Windows 与 macOS 均无实机：Windows 专属测试在本机只能条件跳过，其运行时行为不在本 Flow 的证据范围内。

### 执行契约

- 固定比较点：`96c0b4860023e74ff708a17fb56672b71906427e`；本 Flow 新增的领域文档与 Plan 为初始工作区变更。
- 范围仅在 `packages/dsh-keep-alive`（含其 README、package.json 与 pnpm-lock.yaml 的该 importer），按 01 → 02 → 03 顺序交付，每个 issue 通过门禁后提交一次本地 Git 提交。
- `packages/dsh-keep-alive/package.json` 移除 `"os": ["win32"]` 是交付的一部分：该字段当前使 pnpm 在非 win32 平台跳过本包依赖安装，门禁无法执行。为建立基线，临时在包内手工链接了依赖（`node_modules` 未跟踪，不入提交）；Issue 02 移除该字段后由 `pnpm install` 正常接线，届时删除手工链接并复验。
- 提交只暂存本次改动涉及的路径；不执行 push、不发布 npm。
- 停止点：范围改变、真实冒烟失败需要降低标准、`pnpm install` 无法恢复时回到本 gate。

### 质量门禁

- 静态与构建：`pnpm --filter dsh-keep-alive check`（格式 + lint + 类型）、`build`（`vp pack`）、`git diff --check`；遵循 code-spec。
- 行为测试：`pnpm --filter dsh-keep-alive test:coverage` 全部通过；statements/branches/functions/lines 各 >=80%，不排除 `src/**` 下任何平台文件或进程入口；平台无关算法用注入快照测，Linux 适配器用真实子进程测，macOS 适配器用注入 `ps` 文本测，Windows 用条件跳过。
- 真实 Linux 验收：从打包产物 `start` 后结束启动终端仍 HTTP 可达、重复 `start` 旧树退出、异常退出退避恢复、`stop` 后不复活、外部端口占用报错不误杀；真实 DSH 使用隔离 `DSH_HOME` 与独立端口，不触发模型调用。
- macOS：解析层与数据目录解析测试通过；README 自验证命令与「未实机验证」标注齐备。Windows：现有测试语义不变、条件跳过策略就位，并在交付记录中如实标注未实机运行。
- 回归：`apps/etf-service`、`apps/etf-dashboard` 依赖缺失使仓库级测试命令不可用（环境事实，非本改动引入）；替代口径为「本包测试全绿 + 所有依赖完整的兄弟包逐包复跑，失败集合与下面基线一致」。基线失败集合（Linux 上既有，全部与 `node:path` 平台假设有关，与本改动无关）：`dsh-nested-skill` 4、`dsh-session-manager` 2 个测试文件体（41 项测试全过）、`nano-flow` 13、`nano-mem` 7；`docusaurus-plugin-link`、`dsh-opencode-session`、`herdr-limit-resume` 全绿；`dsh-keep-alive` 基线 47 项中 6 项失败（PowerShell 快照、`%LOCALAPPDATA%`/命名管道路径、npm-cli.js 位置），均为 Windows 专属断言。
- 交付：check-domain 通过、code-review 的 Standards 与 Spec 双轴无阻塞项、验证记录支持每项主张后才提交并 report completed。

## 上下文

- 用户故事：[story.md](story.md)。
- 设计问答（Q1 用户直接确认三平台）：工作区 `.flow/quest/2026-09-10-dsh-alive全平台.md`。
- 现行实现：[packages/dsh-keep-alive](../../../../packages/dsh-keep-alive/README.md)。
- 原 Plan（显式排除 macOS/Linux，本次撤销该排除）：[2026-09-08-终端后台保活工具](../archived/2026-09-08-终端后台保活工具/spec.md)。
- 领域语言：[DSH](../../../CONTEXT.md)。
- 仓库先例：nano-mem 的 POSIX/Windows npm 调用与数据目录；diff-viewer 的全平台打包（无 mac 环境时按配置就绪交付）；herdr 的「Windows named pipe / Unix socket 同一入口」。

## Issue

| #   | Issue                                                              | 状态      | 阻塞于 | 下一步         |
| --- | ------------------------------------------------------------------ | --------- | ------ | -------------- |
| 01  | [平台无关进程核心与适配器收口](01-平台无关进程核心与适配器收口.md) | completed | —      | /code-delivery |
| 02  | [Linux 全功能支持](02-Linux全功能支持.md)                          | completed | 01     | /code-delivery |
| 03  | [macOS 支持与自验证交付](03-macOS支持与自验证交付.md)              | completed | 02     | /code-delivery |
