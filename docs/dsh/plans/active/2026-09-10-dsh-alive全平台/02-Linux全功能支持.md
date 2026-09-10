---
status: completed
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

- [x] Linux 上 `start` 成功：受管进程存活、端口属于其进程树、HTTP 可达三项就绪判定成立。
- [x] 结束启动终端（或终止发起进程）后端口仍可达；`status` 能报告版本、PID 与状态。
- [x] 重复 `start` 重启该端口实例且旧进程树退出；`stop` 后等待超过退避窗口仍不复活；不同端口互不影响。
- [x] 外部程序占用端口时报错且不终止该进程；`status`、`logs` 可诊断失败。
- [x] 状态、版本、日志位于用户数据目录且目录权限为 `0700`；不写系统目录，不需要 root。
- [x] 真实 DSH 冒烟使用隔离 `DSH_HOME` 与独立端口，不触发模型调用；证据包含实际 PID、端口与 HTTP 响应。
- [x] npm 安装路径解析在 Linux 标准布局下工作，候选全缺失时报错文本可读。
- [x] `check`、`test:coverage`、`build` 通过；Linux 代码被真实子进程测试覆盖，覆盖率 >= 80% 且未排除平台文件。
- [x] README 含 Linux 使用说明；Windows 说明与行为未变。

## 上下文

- [执行契约](spec.md) 的「Linux（/proc）」「状态目录与控制通道」「npm 解析」。
- 上游 issue：[01 平台无关进程核心与适配器收口](01-平台无关进程核心与适配器收口.md)。
- 领域语言：[DSH](../../../CONTEXT.md)；用户故事 [US-001](story.md)。

## 下一步

/code-delivery。

## 交付记录

交付物：

- `src/platform/linux.ts`：`/proc` 直读的进程快照（`/proc/<pid>/stat` 的 ppid 与 starttime、`cmdline`、跳过僵尸）与端口监听者查询（`lsof`），终止前按 `pid` + `birth` 复核身份，先 SIGTERM、下一轮对同一进程升级 SIGKILL（按 pid 记录，进程消失即清除）。
- `src/paths.ts`：数据目录按平台解析（Windows `%LOCALAPPDATA%`、Linux `${XDG_DATA_HOME:-~/.local/share}`、macOS `~/Library/Application Support`），可用 `DSH_ALIVE_DATA` 覆盖；POSIX 控制通道为每端口目录内的 `control.sock`，目录权限 `0700`，超过 90 字节时给出可读错误。
- `src/platform/current.ts`：接入 `linux` 适配器，支持平台列表随之更新。
- `src/runtime/transport.ts`：绑定前探测并清理陈旧 socket 文件；已有 supervisor 应答时拒绝接管；关闭后删除 socket 文件。
- `src/runtime/versions.ts`：npm CLI 候选路径按平台生成（与 Node 同装的两处 + Linux/Homebrew 系统路径），全部缺失时报错并列出尝试过的路径。
- `src/main.ts`、`package.json`：移除 win32 守卫与 `"os": ["win32"]`；帮助文本改为平台中性。
- `README.md`：平台支持矩阵、Linux 使用说明、数据目录、`lsof` 依赖说明与 POSIX 已知边界。
- 测试：`src/platform/linux.test.ts`（真实 `/proc`、真实子进程、SIGTERM→SIGKILL、端口归属、边界输入）、`src/paths.test.ts`（平台目录与 socket 路径）、`src/runtime/transport.test.ts`（跨平台地址、陈旧 socket、拒绝接管）、`src/runtime/versions.test.ts`（候选路径与真实 npm）；原先按 win32 条件跳过的 CLI 与 npm 用例已全部解锁为跨平台用例。

验证证据：

- 静态门禁：`pnpm --filter dsh-keep-alive check`（本地经 vp 0.2.6）通过——31 个文件格式正确、28 个文件无 lint 与类型错误。
- 行为测试：`vp test --run` — 12 个测试文件全通过，68 项通过 / 1 项按平台跳过（唯一跳过项为 Windows 真实 PowerShell 快照）。
- 覆盖率：`vp test --run --coverage` — statements 91.36%、branches 88.54%、functions 88.51%、lines 92.29%，均 ≥ 80%，未排除任何平台文件；`src/platform/linux.ts` statements 96.29%、lines 95.77%。
- 构建：`vp pack` 成功，产物 `dist/main.mjs` 38.35 kB。
- 无 `lsof` 降级路径实测（PATH 只保留 node 所在目录、缓存版本、死 registry）：`start` 1 秒内返回 `state=running`，HTTP 200；`status` 正常；`stop` 正常。修复前同一场景 61 秒超时失败。
- 真实 Linux 验收（隔离数据目录 `/tmp/alive-smoke/data`、隔离 `DSH_HOME`、registry 走 `https://bnpm.byted.org`，不触发模型调用）：
  - 真实安装并启动 `@deepseek-ai/dsh@0.1.5-rc.1`：`start --port 4411` 返回 `state=running, pid=953313`；发起进程在 `setsid` 子 shell 中执行并立即退出（父 shell 已消亡），1 秒后 `curl` 得到 HTTP 401（未认证首页），证明 supervisor 与 DSH 都不依赖启动终端。
  - 重复 `start`：pid 从 953313 变为 953707，旧进程树已不在进程表，HTTP 仍为 401。
  - 不同端口独立：4411 与 4412 同时 running（pid 953707、955174），`status` 无参数列出全部受管端口。
  - 外部占用：另一进程监听 4413 时 `start --port 4413` 以 `Port is occupied by another process` 失败（exit 1），占用者仍在运行未被终止。
  - 崩溃恢复：`kill -9` 受管 DSH（953707）后按退避恢复，约 6 秒后就绪，新 pid 956110、HTTP 401。
  - `stop`：两个端口都停止，等待 35 秒（超过 30 秒退避窗口）后端口不再可达，未复活；`status` 显示 stopped 与 `prepared=0.1.5-rc.1`。
  - 数据目录权限 `drwx------`（0700）；`stop` 后 `control.sock` 已删除，`state.json` 与 `dsh.log` 保留。
- `git diff --check` 与 `check-domain.mjs .` 通过。
- 回归：`vp run --filter nano-mem --no-cache test` 失败集合与执行基线一致（7 项 `node:path` 平台假设相关，与本改动无关）；仓库级 `vp run -r` 仍因 `apps/etf-service` 依赖缺失不可执行（环境事实，见执行基线）。
- 提交：`e455b39`（feat(dsh-keep-alive): support Linux alongside Windows）；提交后复跑 `vp test --run` 仍为 68 项通过 / 1 项跳过，`vp check` 通过。
- 审查：Standards 与 Spec 双轴结论见下方「审查记录」，两轴发现均已修复并复验。

未验证范围：Windows 运行态行为（本机为 Linux；Windows 代码路径未改动，仅 win32 用例在本机条件跳过）；macOS 适配器不在本提交内，属 Issue 03。

## 审查记录

Standards 轴（首轮结论 pass，0 blocker / 2 major / 15 minor / 2 nit，硬规则全部满足）：

- F1（major，已修复）：`transport.ts` 的 `close` 处理器无条件 `rm(socket)`。libuv 在 `server.close()` 时已同步 unlink，而 `'close'` 事件要等已有连接结束才触发；这期间新 supervisor 可能已 probe → bind，随后旧实例的延迟 `rm` 会删掉新 socket，造成「supervisor 活着但控制通道消失、DSH 变成不可控孤儿进程」。修复：删除该处理器，交由 libuv 在关闭时删除；陈旧文件仍由绑定前的 probe 清理。
- F2（major，已修复）：移除 win32 守卫后 CLI 进程内不再做平台检查，macOS 上会先建目录、拉起 supervisor、跑完版本解析（可达 10 分钟）才在适配器处失败，并以「Supervisor did not start」误导用户。修复：`main()` 在分发命令前调用一次 `platformFor()`，未知平台立即以可读错误退出。
- F3（已修复）：`userInfo()` 与管道名哈希移入 win32 分支；POSIX 不再计算或用不到的信息（容器内无 passwd 条目时 `userInfo()` 会抛错）。
- F4（已修复）：README 的 POSIX 边界描述纠正为「reparent 在父进程退出时即发生，适配器跳过 cmdline 为空的僵尸；清理必须在根进程仍可读时开始」。
- F5（已修复）：`parseStat` 改用 `Number.isSafeInteger` 并加上下界（负 ppid 与超大 starttime 不再让 `toISOString()` 抛 RangeError 穿透 snapshot/terminate）。
- F6（已修复）：抽出 `bootTimeOrThrow`，去掉快照与终止两处重复的启动时间读取与错误文案。
- F7（已修复）：`list()` 不再把 `readdir` 失败吞成空表——进程表不可读时上抛，避免清理误判「树已退出」；由新增用例锁定。
- F8（已修复）：修正 `current.ts` 中「唯一改动点」的注释，改为列出接入新平台的真实改动面。
- F9（已说明）：macOS 数据目录保留并在注释中标注其适配器由 Issue 03 交付，当前平台选择会明确报错。
- F10（已修复）：npm 候选加入 PATH 派生项并统一 `resolve`，错误文案改为「install npm next to this Node.js」并列出实际尝试过的路径。
- F11（已修复）：`removeStaleSocket` 增加 2 秒 probe 超时，且只把 `ENOENT`/`ECONNREFUSED` 视为陈旧；其他错误上抛，不再误删活着的通道。地址与种类仍由 `Paths.pipe` 承载（judgement，未改动）。
- F12（已修复）：`src/testing/platform.ts` 增加 `onLinux`/`onPosix`，`linux.test.ts`、`paths.test.ts`、`transport.test.ts` 统一改用它，跳过而非静默通过。
- F13（已修复）：删除复述实现且与被测模块无关的 `sameProcess` 用例。
- F14（已修复）：边界用例补上「cmdline 可读 + stat 不可解析」与「进程表整体不可读必须报错」两条真实路径。
- F15（已修复）：`commands.test.ts` 统一引用 `DATA_ROOT_ENV` 常量。
- F16（已修复）：`preparePaths` 在 POSIX 上显式 `chmod 0700`，已存在的目录也会被收紧。
- F17（已修复）：出生时间不符时同时清理 `signaled` 记录，避免 pid 重用后新的受管进程首轮就吃 SIGKILL。
- F18/F19（已修复）：transport 测试注释改为「独立临时根目录」；README 开发命令围栏改为 `sh`。

Spec 轴（首轮结论 fail，1 blocker / 1 major / 1 minor / 1 low / 3 info）：

- B1（blocker，已修复）：缺少 `lsof` 时端口归属为「未知」（owners 为空），而 `instance.ts` 把 `owners.length` 作为就绪硬前提，导致 `start` 必然 60 秒超时——与 README 的「缺失时仍可启动」和 Q7 的降级语义矛盾。实测：无 `lsof` 时 start 耗时 61202 ms、exit 1，期间 HTTP 一直可达，最后还杀掉了自己拉起的 DSH。修复：owners 为空视为「未知」而不参与就绪合取，只要求「受管进程存活 + HTTP 可达」；端口预检本身在 owners 为空时天然跳过，外部占用仍会因 HTTP 不可达而失败，不误杀。复验：同一场景 1 秒内就绪、HTTP 200。
- M1（major，已修复）：PATH 派生的 npm 候选违反 spec 的闭集约定，且 `access()` 不校验可执行性——PATH 里的 sh 包装 npm（Volta/asdf/corepack）会被选中并以 `SyntaxError` 硬失败。修复：删除 PATH 候选，恢复 spec 的闭集（与 Node 同装两处 + 发行版目录 + Homebrew 目录），候选统一 `resolve` 为绝对路径。
- M2（minor，已修复）：`signaled` 升级集合只按 pid 记键，pid 重用后新的受管进程首轮即吃 SIGKILL，且集合随 supervisor 生命周期无上限增长。修复：键改为 `pid@birth`。
- L1（low，已修复）：僵尸判据原本用「cmdline 为空」代理，会连带丢弃读不到命令行的活进程（本机 321 个内核线程）。修复：改读 `/proc/<pid>/stat` 的状态字段判 `Z`，cmdline 仅作诊断，读不到时记为 `null` 而保留进程。
- D1/D2（已修复）：交付记录数字更新为冻结修订；`linux.test.ts` 中与现行为相反的用例标题已改写。
- D3（info，未改动）：`start(..., paths, spawnBackground)` 与 `spawnSupervisor(port)` 的 root 解析不对称。生产路径全部经环境变量解析 root，无生产缺陷；保留注入点用于测试，属已知设计取舍。

修复后复验（冻结修订）：`vp check` 无警告无错误、`vp pack` 成功、`vp test --run` 68 项通过 / 1 项跳过、覆盖率 91.36/88.54/88.51/92.29；真实 Linux 冒烟（registry 走 `https://bnpm.byted.org` 安装 `@deepseek-ai/dsh@0.1.5-rc.1`）：`setsid` 子 shell 中启动后 HTTP 401、重启换 pid 后仍 401、`stop` 后端口不可达且 socket 已删除、数据目录 `drwx------`。

修复后复验：`vp test --run` 12 个测试文件全通过，68 项通过 / 1 项按平台跳过；`vp check` 无警告、无 lint 与类型错误；覆盖率 statements 91.34%、branches 88.2%、functions 88.59%、lines 92.28%（`linux.ts` statements 96.1%）；`vp pack` 成功。真实 Linux 冒烟复跑：`setsid` 子 shell 启动后父 shell 消亡、HTTP 401；重启后旧 pid 退出、新 pid 服务；`stop` 后端口不可达且 `control.sock` 已删除，数据目录权限 `drwx------`。
