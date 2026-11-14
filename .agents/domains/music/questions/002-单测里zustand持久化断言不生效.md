---
name: '002-单测里zustand持久化断言不生效'
description: 'node 测试环境没有 window，zustand persist 直接跳过存储；只 stub localStorage 不够，window.localStorage 也要 stub。'
---

# 002-单测里zustand持久化断言不生效

## 适用条件与现象

在 `repos/music` 的 vitest（`vitest.config.ts` 的 `environment: "node"`）里断言播放器 store 的持久化内容，比如「`musopen.listen.v1` 只存 `history`，不再存 `autoPlay`」：

- 存储里读不到写入的值，或者断言恒成立、改坏了也测不出来。

## 原因

`store/player.ts` 用 `createJSONStorage(() => window.localStorage)`；node 环境没有 `window`，persist 拿不到 storage 就静默跳过，任何写入都不会发生。只 `vi.stubGlobal("localStorage", …)` 不解决问题，代码读的是 `window.localStorage`。

## 解决方法

同时 stub 两个名字，指向同一个假存储：

```ts
vi.stubGlobal("localStorage", storage);
vi.stubGlobal("window", { localStorage: storage });
```

见 `client/app/store/player.test.ts`。断言要正反两条：写入后键里只有 `history`；把带旧 `autoPlay` 的历史 JSON 塞进去仍能正常读取（不做版本迁移的前提）。

## 验证

`cd repos/music && pnpm exec vitest run` 通过；故意把 `partialize` 改回带 `timer` 或 `autoPlay` 时，该用例必须变红。

## 来源

Plan `2026-11-11-自动播放倒计时`，[001-倒计时状态与播完行为](../plans/reference/2026-11-11-自动播放倒计时/001-倒计时状态与播完行为.md) 的「测试环境坑」；log.jsonl run 2。

## 相关

- [001-音频e2e怎么测到期与播完](001-音频e2e怎么测到期与播完.md) — 同一批测试的浏览器侧坑，墙钟与音频要分开控制。
- [001-倒计时状态与播完行为](../plans/reference/2026-11-11-自动播放倒计时/001-倒计时状态与播完行为.md) — 该 stub 的引入记录与「不做 persist 版本迁移」的决定。

