---
status: pending
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

- [ ] `packages/dsh-keep-alive/src` 中不再有 class 声明或 class 表达式。
- [ ] 根 `vite.config.ts` 的 `lint.overrides` 对该路径生效（临时放回一个 class 会被报错），且不波及其它包。
- [ ] `createInstance` 签名、`Instance` 接口、状态与行为不变：32 项测试全部通过，覆盖率仍 ≥80%。
- [ ] `pnpm --filter dsh-keep-alive check` 与仓库 `pnpm exec vp run -r --no-cache test` 无新增失败。
- [ ] 真实 Windows 冒烟与 01 相同场景通过，不触碰 `%LOCALAPPDATA%\dsh-keep-alive\3080` 的运行实例。

## 上下文

- [执行契约](spec.md)。
- [前置交付](01-vp与vitest基建迁移.md)。
- 迁移前 class 位置：`src/runtime/instance.ts`、`src/testing/virtual-processes.ts`。

## 下一步

/code-delivery；等待 01 completed。

## 交付记录

（完成登记前填写交付物与验证证据链接。）
