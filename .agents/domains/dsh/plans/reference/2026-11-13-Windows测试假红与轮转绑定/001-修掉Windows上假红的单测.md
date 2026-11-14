---
name: "001-修掉Windows上假红的单测"
description: "layering.test.ts 用 URL.pathname 拿源码目录、plan-log.test.ts 用 POSIX 字面量做 fixture，两处在 Windows 上假红；改成平台无关写法并让 pnpm test 在 Windows 上全绿。"
status: completed
related_noted: []
next_step: "已完成；结论与证据见下"
---

# 001-修掉Windows上假红的单测

## 交付

两处测试改成平台无关写法，断言强度不变：

1. [layering.test.ts](../../../../../../packages/dsh-toolkit/src/layering.test.ts)：`new URL(".", import.meta.url).pathname` 在 Windows 得到 `/C:/...`，`readdirSync` 直接 `ENOENT`，3 条分层用例在遍历阶段就崩。改用 `fileURLToPath`。
2. [plan-log.test.ts](../../../../../../packages/dsh-toolkit/src/nano-flow/planning/plan-log.test.ts) 的 `resolvePlanDirectory`「优先绑定 cwd」一条：fixture 用 POSIX 字面量 `/old/work`，实现用 `join`，Windows 上得到 `\\old\\work\\...`，测试自带的 `exists` 谓词永远不相等 → 误走 fallback 分支。期望路径改由同一个 `join` 产出。

## 验收与证据

- `pnpm --filter @kxh4892636/dsh-toolkit test`：**43 个文件 375 条用例全通过**（2026-11-13 19:30 于 Windows，node v24.21.0）。
- 改动只在两个 `.test.ts`，产品代码零改动；两条用例仍分别覆盖「绑定 cwd 存在时优先」与「不存在时回退」，layering 三条仍比对全部非测试 TS。

## 背景

失败只发生在这两处平台假设上，产品代码没有回归：layering 的 0 处违规我用独立脚本复核过，`resolvePlanDirectory` 在真实 Windows 路径上的行为也用探针验证过（绑定 cwd 存在返回绑定目录，不存在回退当前工作区）。
