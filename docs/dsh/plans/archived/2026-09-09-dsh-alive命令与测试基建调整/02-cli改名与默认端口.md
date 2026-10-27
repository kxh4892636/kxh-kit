---
status: completed
blocked_by: ["01"]
---

# CLI 改名与默认端口

## 交付

用户以 `dsh-alive` 调用工具；`start`/`stop`/`logs` 省略 `--port` 时作用于 3080，`status` 无参数仍列出全部受管端口。

## 范围

改 npm bin 名、帮助文本与错误前缀；`start`/`stop`/`logs` 的端口缺省值；README 同步（命令名、默认端口、开发命令，并纠正不存在的 `pack` 脚本）。不改包名、包目录、状态目录与命名管道名，不加旧命令别名，不改版本号。

## 直接依赖

- 01：测试文件与命令入口已在 vitest 与 `dist/main.mjs` 下稳定，避免同一批测试文件被改两次；消费其 vp 命令与构建产物路径。

## 验收

- [x] 省略 `--port` 时 `start`/`stop`/`logs` 的目标端口解析为 3080：以受控入口或替身断言，真实 3080 已有运行中实例，不做真实启停。
- [x] 在隔离 `LOCALAPPDATA` 下对已占用的 3080 执行 `dsh-alive start`（省略 `--port`）返回端口被占用的明确错误，证明默认值确实作用于 3080 且不终止既有实例。
- [x] `dsh-alive status` 无参数仍列出全部受管端口，带 `--port` 查询单个。
- [x] `--port` 显式值仍可覆盖；0、65536、非整数、缺值与多余参数仍报错；帮助文本与错误前缀显示 `dsh-alive`。
- [x] bin 只有一个条目，旧命令 `dsh-keep-alive` 不再存在。
- [x] README 命令与开发命令与实际 scripts 一致，`pack` 脚本记录已纠正。
- [x] 测试覆盖「省略即 3080」与「显式覆盖」两条路径，全部通过，覆盖率仍 ≥80%。
- [x] 不触碰 `%LOCALAPPDATA%\dsh-keep-alive\3080` 的运行实例。

## 上下文

- [执行契约](spec.md)。
- [前置交付](01-vp与vitest基建迁移.md)。
- 现状：`src/main.ts` 强制 `--port N`；README 记录不存在的 `pack` 脚本。

## 下一步

/code-delivery；等待 01 completed。

## 交付记录

交付物：`package.json` bin 改为唯一条目 `dsh-alive` → `dist/main.mjs`；`src/main.ts` 新增 `DEFAULT_PORT = 3080` 与 `resolvePort`（`start`/`stop`/`logs` 省略 `--port` 即 3080，`status` 无参仍列出全部端口，多余参数与非法值仍报错），帮助文本与错误前缀改为 `dsh-alive`；README 同步命令名、默认端口、`status` 语义、开发命令、`pnpm pack` 打包说明与覆盖率说明。

验证证据（2026-09-09，Node v24.19.0 / pnpm 11.22.0 / vite-plus 0.2.6 / vitest 4.1.10）：

- `pnpm --filter dsh-keep-alive check`：24 文件格式通过、21 文件无 lint/类型错误、0 警告。
- `pnpm --filter dsh-keep-alive test`：34 项全通过（01 后 32 项，本项新增 2 项），无 skip。
- `pnpm --filter dsh-keep-alive test:coverage`：statements 89.15%、branches 84.33%、functions 84.53%、lines 90.61%，四指标 ≥80%（`main.ts` 覆盖率由 48.48% 升至 76.92%）。
- 默认端口：`resolvePort([])` 为 3080，`--port N` 覆盖，`["--port"]`/`["--port","1.2"]`/`["--bad","1"]`/`["--port","1234","extra"]` 抛 `Expected --port N`，`["--port","0"]`/`["--port","65536"]` 由 schema 拒绝；隔离 `LOCALAPPDATA` 下 `main(["logs"])` 返回 `No log yet`、`main(["stop"])` 返回 `{port:3080,state:"stopped"}`、`main(["status"])` 无输出。
- 缺省端口作用于被占用 3080：3080 被外部实例占用时直接复用（否则由测试自己监听 3080 制造占用者），隔离 `LOCALAPPDATA` 下执行打包产物 `dsh-alive start`（省略 `--port`）stderr 含 `occupied`，并断言 start 前后 `snapshot(3080).owners` 完全一致——既不终止占用者，也不误启第二份实例。
- 错误前缀与帮助：`main.test.ts` 断言 `--help` stderr 为空、失败调用 stderr 以 `dsh-alive: ` 开头；帮助文本含 `dsh-alive` 与 `start [--port N]`。
- 真实 CLI：`commands.test.ts` 真实进程用例新增 `status --port N` 单端口查询断言，以及省略 `--port` 的 `logs`（`No log yet`）与 `stop`（`{port:3080,state:"stopped"}`）断言。
- bin 唯一性：`pnpm pack` → 独立目录 `npm install` → `node_modules/.bin` 仅 `dsh-alive`、`dsh-alive.cmd`、`dsh-alive.ps1`，`dsh-alive --help` 退出 0。
- 未触碰运行实例：`node dist/main.mjs status` 仍返回 `state=running, version=0.1.2-rc.1, pid=25488`。
- 仓库回归：`pnpm exec vp run -r --no-cache test` 退出 0（首轮出现 `nano-flow#test` 1 项失败，单包重跑 1128/1128 通过、整仓重跑 12 任务全过，判为并行执行下的偶发，与本改动无关）；`check-domain`、`git diff --check`、`vp fmt --check` 均通过。
- 双轴审查：Standards 10 项（0 blocker，1 major、5 minor、4 nit）、Spec 7 项（0 blocker，1 major、3 minor、3 nit）。已修复：`resolvePort` 拒绝多余参数（并补断言）、占用用例改为两分支都有证据并断言占用者不变、错误前缀断言、`status --port` 端到端断言、exec 超时与用例超时对齐、README 安装路径与 `status` 语义。未改（记录判断）：`--supervisor` 内部入口沿用 schema 解析（非用户面）。

已知遗留（非本项范围）：仓库根 `dsh-keep-alive-0.0.1.tgz` 是 Q8=B 决定不重新产出的旧本地产物，其 bin 仍为 `dsh-keep-alive`；README 已改为指向 `packages/dsh-keep-alive` 下的 `pnpm pack` 产物。
