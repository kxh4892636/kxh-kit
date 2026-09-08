---
status: in_progress
---

# dsh-alive 命令与测试基建调整

## 问题

已交付的 `packages/dsh-keep-alive` 需要四项调整：命令名改为 `dsh-alive`；`--port` 缺省 3080；用 vp 与 vitest 替换包内命令；代码中禁止使用 class。包未发布、本机也未全局安装，但 `%LOCALAPPDATA%\dsh-keep-alive\3080` 上有正在运行的受管实例（当前 DSH Web 界面由它提供），本次改动不得使它失去管理通道。

## 方案

按「先换基建、再改用户可见行为、最后改代码形态」推进：先把构建与测试迁到仓库既有的 vp + vitest 工具链（行为不变），再改命令名与默认端口（用户可见），最后移除 class 并由 lint 规则长期强制。三项各自独立验收、独立提交。

## 已排除的备选

- 只迁移测试、构建继续用 tsc：与仓库其它包工具链不一致，且用户要求「引入 vp」；见 Q4。
- 同时改包名、包目录、状态目录与命名管道名：会让正在 3080 运行的受管实例失去管理通道（端口被占用又无法重新 start），代价高于收益；见 Q1。
- 保留 `dsh-keep-alive` 作为兼容别名：包未发布、本机无全局安装，别名没有真实使用者；见 Q2。
- 全部命令省略 `--port` 都默认 3080（含 `status` 无参数）：会丢掉「列出全部受管端口」的汇总能力；见 Q3。
- 版本升到 0.0.2 并重新产出 tarball 作为交付物：用户选择保持 0.0.1、只改代码与 README；见 Q8。
- 全仓禁用 class：仓库其它包与应用有 25 个文件含 class，会波及其它业务域；见 Q6。

## 实施决策

### 命令与默认端口（Q1–Q3）

- npm bin 名改为 `dsh-alive`；包名、包目录、`%LOCALAPPDATA%\dsh-keep-alive` 状态目录与命名管道名不变；不保留旧命令别名。
- `start`/`stop`/`logs` 省略 `--port` 时使用 3080；`status` 无参数保持「列出全部受管端口」，带 `--port` 查询单个。`--port` 显式值仍可覆盖，必须为 1–65535 整数，缺值或非法值仍报错。
- 帮助文本、错误前缀与 README 使用 `dsh-alive`；版本保持 0.0.1。
- 验证「缺省 3080」不得对真实 3080 做启停：用受控入口或替身断言端口解析，或在隔离 `LOCALAPPDATA` 下验证对已占用 3080 的 `start` 返回明确错误。

### 工具链（Q4–Q5、Q7）

- 新增 `packages/dsh-keep-alive/vite.config.ts`（`vite-plus` 的 `defineConfig`）：`pack` 入口 `src/main.ts`；`lint` 启用 `typeAware` 与 `typeCheck`；`test` 使用 v8 覆盖率，`include` 为 `src/**/*.ts`，`exclude` 为 `src/**/*.test.ts` 与 `src/testing/**`，四指标门槛 80%，reporter 为 text + json-summary + html。
- 包内 scripts 改为：`build: vp pack`、`check: vp check`、`test: vp pack && vp test`、`test:coverage: vp pack && vp test --run --coverage`。删除 c8 依赖、`tsconfig.test.json`、`tsconfig.build.json` 与 `.test-dist`；`tsconfig.json` 简化为类型检查用途并同步 `.gitignore`；devDependencies 增加 `vitest` 与 `@vitest/coverage-v8`（catalog）。
- `vp pack` 产物为 `dist/main.mjs`：`package.json` 的 bin 与 `src/commands.ts` 中 supervisor 自启动入口（`new URL("./main.mjs", import.meta.url)`）同步调整；tarball 安装验证按当前代码临时打包。
- 测试保持串行：`src/testing/fixture.ts` 用「绑定 0 端口再释放」取端口，并行会互相抢占，`vite.config.ts` 须关闭文件级并行。
- 真实进程测试统一 spawn 构建产物 `dist/main.mjs`，不再依赖 `.test-dist`。

### 代码形态（Q6）

- src 全量移除 class：`src/runtime/instance.ts` 的 `ManagedInstance` 改为工厂函数 + 闭包（`createInstance` 签名、`Instance` 接口、状态与行为不变）；`src/testing/virtual-processes.ts` 的 `VirtualProcesses` 改为工厂函数，字段与 `io` 形状不变，测试调用点改为工厂调用。
- 在工作区根 `vite.config.ts` 用 `lint.overrides` 对 `packages/dsh-keep-alive/src/**` 设 `max-classes-per-file: ["error", 0]`，不波及其它包。

## 工作环境

Windows / PowerShell；仓库使用 pnpm 与 vite-plus 0.2.6，根 `package.json` 声明 Node.js >=22.12.0，本机 Node.js v24.19.0，`vp` 与 `vitest` 已在工作区安装。测试使用临时状态目录、独立端口与 DSH 替身，不调用模型。`%LOCALAPPDATA%\dsh-keep-alive\3080` 有运行中的受管实例，验证不得停止它。工作区可能存在与本 Plan 无关的并发改动（其它会话正在改 `apps/wiki/docs/**`），提交只限本 Plan 路径。

## 范围

- 01：vp + vitest 基建迁移（构建、检查、测试、覆盖率命令与配置），行为不变。
- 02：CLI 命令名改为 `dsh-alive`、`--port` 缺省 3080，同步 README。
- 03：src 移除 class 并加 lint 强制。

各项包含自己的测试、验证与提交。

## 非范围

包名/包目录/状态目录/命名管道改名、旧命令别名、版本号变更与 tarball 交付物、领域文档变更、全仓禁用 class、macOS/Linux 支持、DSH 功能本身改动、模型调用测试。

## 待定

无未决产品选项。`vp pack` 对 CLI 入口与 supervisor 自启动的实际可执行性、按当前代码打包安装后的 CLI 帮助、根 lint overrides 生效后 `vp check` 仍全绿，均属交付阶段验证，本文件不预先宣称通过。

## 上下文

- [领域语言](../../../CONTEXT.md)
- 设计确认记录：工作区 `.flow/quest/2026-09-09-dsh-alive命令与测试基建调整.md`
- [上一轮交付](../../reference/2026-09-08-终端后台保活工具/spec.md)
- 仓库既有 vp 约定：[dsh-nested-skill 配置](../../../../../packages/dsh-nested-skill/vite.config.ts)、[dsh-session-manager 配置](../../../../../packages/dsh-session-manager/vite.config.ts)

## Issue

| #   | Issue                                                | 状态        | 阻塞于 | 下一步         |
| --- | ---------------------------------------------------- | ----------- | ------ | -------------- |
| 01  | [vp 与 vitest 基建迁移](01-vp与vitest基建迁移.md)    | completed   | —      | /code-delivery |
| 02  | [CLI 改名与默认端口](02-cli改名与默认端口.md)        | in_progress | 01     | /code-delivery |
| 03  | [移除 class 与 lint 强制](03-移除class与lint强制.md) | pending     | 01     | /code-delivery |
