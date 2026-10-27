---
status: completed
blocked_by: ["01"]
---

# 移除 class 与 lint 强制

## 交付

`packages/dsh-keep-alive` 的 src 中不再出现 class；工作区根 lint 配置对该包 src 强制 `max-classes-per-file: 0`，`vp check` 全绿。

## 范围

把 `src/runtime/instance.ts` 的 `ManagedInstance` 改为工厂函数 + 闭包；把 `src/testing/virtual-processes.ts` 的 `VirtualProcesses` 改为工厂函数；更新测试调用点；在根 `vite.config.ts` 增加 `lint.overrides`。不改行为、对外类型与命令接口。

## 直接依赖

- 01：测试已迁移到 vitest，class 的调用点（`instance.test.ts`、`update.test.ts`、`commands.test.ts`）不再被并发改写；消费其 `vp check` 与 `vp test` 命令。

## 验收

- [x] `packages/dsh-keep-alive/src` 中不再有 class 声明或 class 表达式。
- [x] 根 `vite.config.ts` 的 `lint.overrides` 对该路径生效（临时放回一个 class 会被报错），且不波及其它包。
- [x] `createInstance` 签名、`Instance` 接口、状态与行为不变：34 项测试全部通过，覆盖率仍 ≥80%。
- [x] `pnpm --filter dsh-keep-alive check` 通过；仓库 `pnpm exec vp run -r --no-cache test` 在最终代码上 12 任务全过（此前数次因 nano-flow 用例 5 秒超时抖动失败，证据见交付记录）。
- [x] 真实 Windows 冒烟与 01 相同场景通过，不触碰 `%LOCALAPPDATA%\dsh-keep-alive\3080` 的运行实例。

## 上下文

- [执行契约](spec.md)。
- [前置交付](01-vp与vitest基建迁移.md)。
- 迁移前 class 位置：`src/runtime/instance.ts`、`src/testing/virtual-processes.ts`。

## 下一步

/code-delivery；等待 01 completed。

## 交付记录

交付物：`src/runtime/instance.ts` 去掉 `ManagedInstance` 类，改为显式状态对象 + 按职责拆分的模块级函数（`initialState`/`instanceStatus`/`serialize`/`writeLog`/`logMessage`/`markFailed`/`haltInstance`/`bootInstance`/`recoverInstance`/`prepareVersion`/`applyUpdate`/`scheduleUpdate`/`startInstance`/`stopInstance`）与 `createInstance` 装配层；`src/testing/virtual-processes.ts` 去掉 `VirtualProcesses` 类，改为 `initialProcesses` + `createVirtualProcesses` 工厂；3 个测试文件调用点改为 `createVirtualProcesses()`；根 `vite.config.ts` 增加 `lint.overrides`（`packages/dsh-keep-alive/src/**` → `max-classes-per-file: ["error", 0]`）。

验证证据（2026-09-09，Node v24.19.0 / pnpm 11.22.0 / vite-plus 0.2.6 / vitest 4.1.10）：

- class 清除：`src` 下 20 个 .ts 文件无 class 声明或 class 表达式，`new VirtualProcesses` 零命中；`createInstance(port, paths, io?)` 签名与 `Instance` 接口未变。
- 规则生效与范围：临时在 `src/main.ts`（深度 1）与嵌套文件放回 class，`npx vp lint` 均报 `max-classes-per-file … Maximum allowed is 0`；`packages/nano-flow/src`、`packages/herdr-limit-resume/src` 仍 0 错误，未被波及。
- 行为不变：`pnpm --filter dsh-keep-alive test` 34 项全通过；`test:coverage` statements 89.34%、branches 84.33%、functions 85.71%、lines 90.73%，四指标 ≥80%。
- 静态检查：`pnpm --filter dsh-keep-alive check` 24 文件格式、21 文件无 lint/类型问题、0 警告；函数长度符合 code-spec（最长 `bootInstance` 63 行、`createVirtualProcesses` 82 行，均 <89；`instance.ts` 381 行 <610）。
- 打包与运行：`pnpm pack` → 独立目录安装 → `dsh-alive --help` 退出 0；`node dist/main.mjs status` 仍返回 `state=running, version=0.1.2-rc.1, pid=25488`，未触碰 3080 运行实例。
- 文档/卫生：`check-domain.mjs .` 通过、`git diff --check` 干净、`vp fmt --check` 通过。
- 双轴审查：Spec 5 项（0 blocker/major，2 minor、3 nit）、Standards 4 项（0 blocker，1 major、1 minor、2 nit）。已处理：按 code-spec 拆分超长函数（原 `createInstance` 249 行 → 装配层 + 各职责函数，最长 63 行；`createVirtualProcesses` 100 → 82 行）；注释改为约束型；验收文案由「32 项」更正为 34 项。
- 已知遗留（登记，不阻塞）：`src/testing/virtual-processes.ts` 仍实例化 Node 内置类（`new ChildProcess()`、`new PassThrough()`）；`max-classes-per-file` 只约束 class 声明/表达式，故未违反本项门禁。
- 仓库回归（`pnpm exec vp run -r --no-cache test`）：最终代码上运行通过，12 任务全过（含 `dsh-keep-alive#test`、`nano-flow#test`）。本轮中间有 5 次运行失败，失败点全在 `@kxh4892636/nano-flow#test`，且是不同用例的 5 秒默认超时（`self-command.spec.ts` 的 `installs and uninstalls every packaged skill` 5075ms、`enforces managed update and uninstall state boundaries` 5057ms、`recovery keeps external edits and the intent until the conflict is resolved` 5023ms、`interrupted completion resumes its existing receipt without redoing delivery` 5044ms，超出门槛 23–75ms）；nano-flow 单包重跑 1128/1128 通过（约 38s），nano-flow 与 dsh-keep-alive 并发运行也全部通过，且 nano-flow 未被本 Plan 修改。判定为整仓 12 任务并行执行下的负载抖动：同一命令在本 Plan 期间多次通过（00:41、00:52、01:09、01:11 与最终一次），失败仅出现在机器被并发会话占满时。未把单包通过当作整仓通过，失败与证据均如实登记。
