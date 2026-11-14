---
name: '015-Windows上单测假红的两处平台假设'
description: 'dsh-toolkit 在 Windows 上跑 test 假红：layering 用 URL.pathname 取源码目录得到 /C:/…，plan-log 用 POSIX 字面量做预期路径、与 join 结果不等；两处都改成平台无关写法。'
---

# 015-Windows上单测假红的两处平台假设

## 现象

Windows 上 `pnpm --filter @kxh4892636/dsh-toolkit test` 报 4 条失败，全部在测试自身：

- `src/layering.test.ts` 的 3 条分层用例在遍历阶段就 `ENOENT`；
- `src/nano-flow/planning/plan-log.test.ts` 里 `resolvePlanDirectory`「优先绑定 cwd」一条，期望路径与实测值不等，用例误走 fallback 分支。

产品代码没有回归：分层 0 处违规用独立脚本复核过，`resolvePlanDirectory` 在真实 Windows 路径上的行为用探针验证过。

## 原因

1. `new URL(".", import.meta.url).pathname` 在 Windows 得到 `/C:/...`——多了前导斜杠、盘符照留，`readdirSync` 把它当路径去打开，直接 `ENOENT`。
2. 用例用 POSIX 字面量 `/old/work` 拼期望路径，实现用 `join(binding.cwd, planPath)` 得到 `\\old\\work\\...`；测试自带的 `exists` 谓词用 `===` 比较，两者永不相等，于是「绑定 cwd 存在时优先」被误判成不成立。

两处都是测试写的平台假设，与 `resolvePlanDirectory`、分层断言的行为无关。

## 修法

- 取源码目录改用 `fileURLToPath(new URL(".", import.meta.url))`。
- 期望路径也由同一个 `join` 产出，不在断言里写路径字面量（要断言「回退到工作区」时同理）。
- 断言强度不变：两条用例仍分别覆盖「绑定 cwd 存在时优先」与「不存在时回退」，layering 三条仍比对全部非测试 TS。

## 验证

`pnpm --filter @kxh4892636/dsh-toolkit test` → 43 个文件 375 条用例全通过（2026-11-13 19:30，Windows，node v24.21.0）。

## 相关

- [001-修掉Windows上假红的单测](../plans/reference/2026-11-13-Windows测试假红与轮转绑定/001-修掉Windows上假红的单测.md) — 本次修复、验收与全绿证据
- [012-源码按能力分层](../adr/012-源码按能力分层.md) — 分层断言由 layering.test.ts 固定，它崩掉等于门禁失效
- [001-发布dsh-toolkit并真机验收](../workflows/001-发布dsh-toolkit并真机验收/001-发布dsh-toolkit并真机验收.md) — test 门禁在发布流程里的位置与 Windows 上的跑法
