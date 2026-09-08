---
status: in_progress
blocked_by: []
---

# vp 与 vitest 基建迁移

## 交付

`packages/dsh-keep-alive` 使用仓库统一的 vp 工具链：`vp pack` 构建、`vp check` 检查、`vp test` 测试、`vp test --run --coverage` 覆盖率；四条命令全部通过，且行为与迁移前一致。

## 范围

新增包内 `vite.config.ts`；替换 `package.json` scripts 与 devDependencies；移除 c8、`tsconfig.test.json`、`tsconfig.build.json` 与 `.test-dist`，`tsconfig.json` 简化为类型检查用途并同步 `.gitignore`；把 9 个 `node:test` 测试文件迁移到 vitest（断言语义等价、测试串行不变）；bin 与 supervisor 自启动入口改为 `dist/main.mjs`。不改变命令名、默认端口与 class 形态。

## 直接依赖

无。Plan 级 /dev-gate ready 后可领取。

## 验收

- [x] `pnpm --filter dsh-keep-alive check`、`build`、`test`、`test:coverage` 四条命令全部通过，仓库内无 c8 依赖与 `.test-dist` 残留。
- [x] 迁移后 32 个测试断言与迁移前等价（含真实进程启动、并发、退避、回退、日志轮转、控制通道场景），无新增跳过；控制通道一项按下方「有意偏离」加强了时序断言。
- [x] 覆盖率四指标 ≥80%，include/exclude 与门槛和迁移前口径一致，报告可复现。
- [x] `vp pack` 产物 `dist/main.mjs` 可直接执行：`node dist/main.mjs --help` 与 supervisor 自启动路径都可用。
- [x] 按当前代码临时打包安装到独立目录后，bin 可执行且帮助正常。
- [x] 用户可见行为不变：命令仍为 `dsh-keep-alive`，`--port` 仍必填。
- [x] 真实 Windows 冒烟 start/status/logs/stop 通过，不触碰 `%LOCALAPPDATA%\dsh-keep-alive\3080` 的运行实例。

## 上下文

- [执行契约](spec.md)。
- 迁移前基线：`pnpm --filter dsh-keep-alive test` 32 项通过（node:test，约 16 s）；`check` 通过。
- 参考：[dsh-nested-skill 配置](../../../../../packages/dsh-nested-skill/vite.config.ts)。

## 下一步

/code-delivery；领取前须 Plan 级 /dev-gate ready。

## 交付记录

交付物：包内 `vite.config.ts`（`vp pack` 单产物 + vitest 串行 + v8 覆盖率 80% 四指标 + `lint.typeAware/typeCheck` + `fmt`）；`package.json` 四条 vp scripts 与 devDependencies（去 c8，增 `vitest`、`@vitest/coverage-v8`）；bin 与 `src/commands.ts` supervisor 入口指向 `dist/main.mjs`；9 个测试文件迁移到 vitest；删除 `tsconfig.test.json`/`tsconfig.build.json`/`.test-dist` 并简化 `tsconfig.json`、`.gitignore`；`pnpm-workspace.yaml` 移除 c8 catalog 条目。

验证证据（2026-09-09，Node v24.19.0 / pnpm 11.22.0 / vite-plus 0.2.6 / vitest 4.1.10）：

- `pnpm --filter dsh-keep-alive check`：24 文件格式通过、21 文件无 lint/类型错误。类型门禁实测有效：注入 `TS2322` 探针后 `vp check --no-fmt` 退出 1，移除后恢复通过。
- `pnpm --filter dsh-keep-alive build`：`vp pack` 产出 `dist/main.mjs`（24.67 kB，保留 shebang，授予执行权限）。
- `pnpm --filter dsh-keep-alive test`：9 文件 32 项全通过，与迁移前逐文件数量一致（commands 4、main 1、paths 2、windows 3、instance 6、log 1、transport 3、update 9、versions 3），无 skip/only/todo。
- `pnpm --filter dsh-keep-alive test:coverage`：statements 87.02%、branches 81.30%、functions 83.33%、lines 88.32%，四指标 ≥80%；include `src/**/*.ts`、exclude `*.test.ts` 与 `src/testing/**`、门槛 80%、reporter text+json-summary+html 与迁移前口径一致；报告见 `packages/dsh-keep-alive/coverage`。
- 产物可执行：`node dist/main.mjs --help` 退出 0；真实进程测试 spawn `dist/main.mjs` 并通过 supervisor 自启动路径完成 start/status/logs/stop。
- 打包安装：`pnpm pack` → 独立目录 `npm install` → `.bin/dsh-keep-alive.cmd --help` 退出 0。注：`npm pack` 产出的 manifest 保留 `catalog:` 协议，npm 无法安装（既有事实，非本项引入）；`pnpm pack` 会替换为精确版本。
- 真实 Windows 冒烟：`commands.test.ts` 真实 CLI 用例在隔离 `LOCALAPPDATA` 与替身 DSH 下完成 start、重复 start 换 PID、status、logs、stop，并验证父进程退出后存活。
- 未触碰运行实例：新构建 `node dist/main.mjs status` 查询 `%LOCALAPPDATA%\dsh-keep-alive\3080` 返回 `state=running, version=0.1.2-rc.1, pid=25488`，GUI 仍返回 401。
- 仓库回归：`pnpm exec vp run -r --no-cache test` 退出 0，12 任务全过（含 `dsh-keep-alive#test`）；`check-domain.mjs .` 通过；`git diff --check` 干净；`vp fmt --check` 通过。
- 双轴审查：Standards 9 项（0 blocker/major，4 minor、5 nit）、Spec 5 项（0 blocker/major，3 minor、2 nit）。已修复：补 `lint`/`fmt` 段、删 `pnpm-workspace.yaml` 的 c8、`toBeUndefined()` 统一、`update.test.ts` 去重复断言。

有意偏离（登记）：

- `commands.test.ts` 的「stop 拒绝后续排队启动」在原实现下隐含「stop 请求先于 start 到达」的时序假设；vitest 下会偶发 flake（实测一次失败）。改为用 `os.io.terminate` 闸门把 stop 固定在 `closing` 状态，并以 `expect.poll` 观测该状态后再断言 `rejects.toThrow(/stopping/)`：断言由「会拒绝」加强为「在 closing 状态下以 stopping 错误拒绝」，测试数与文件数不变。
- `pnpm-lock.yaml` 由 pnpm 重新解析生成，除 c8 及其传递依赖移除、本包 importer 更新外，另含与 Issue 01 无关的解析漂移（`@esbuild-kit/*` 的 deprecated 元数据 URL、`@vitest/browser-preview` 的 peer `@testing-library/user-event` 14.6.1→14.6.7）。回退 lockfile 后重跑 `pnpm install --lockfile-only` 复现同样结果，属工具当前解析产物，手工改回不可复现，故保留。
- 覆盖率数值与 c8 时期（97.96/92.18/100）不同属测量机制差异：c8 经 `foreground-child` 采集子进程覆盖率，vitest v8 只统计本进程；文件集合与门槛未变。
- README 中「统计编译产物后映射回源码」的覆盖率说明已失真，按 Q8-B 的 README 归属随 Issue 02 一并更新。
