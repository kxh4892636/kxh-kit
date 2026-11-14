---
name: "002-本地起wiki站验收的两个陷阱"
description: "wiki 的 dev server 只监听 [::1]，用 127.0.0.1 打不开；用 Invoke-WebRequest 探深链或纯 HTML 路由会拿到 404，探针结果不代表站点坏了。"
---

# 002-本地起wiki站验收的两个陷阱

## 现象一：`127.0.0.1` 打不开

`pnpm --filter @kxh4892636/wiki start --port 3000 --no-open` 起来后只监听 `[::1]:3000`。浏览器或脚本访问 `http://127.0.0.1:3000` 连不上（或落到别的服务），`http://localhost:3000` 正常。

## 现象二：探针 404

用 `Invoke-WebRequest`（或任何不带 `Accept` 的客户端）探带 `#hash` 的深链、或某些路由，会拿到 404。同一个 URL 在浏览器里打开正常——浏览器请求带 `Accept: text/html`，dev server 才会按 HTML 路由处理。

## 解法

- 一律用 `localhost`，脚本里不要写死 `127.0.0.1`。
- 探针带上 `Accept`：`Invoke-WebRequest -Headers @{ Accept = "text/html" } http://localhost:3000/docs/中转/思维导图示例`。
- 交互类验收（浮窗、引用跳转、全屏、深链定位）不要用探针代替，走浏览器（CDP / 手动）——探针只能证明服务在。

## 验证方法

先 `curl -I localhost:3000` 看是否 200；再看进程监听地址（`Get-NetTCPConnection -LocalPort 3000`）确认是 `::1` 而不是 `127.0.0.1`。两者都对上，才把 404 归因到代码。

## 出处

[006-样例导图与真机验收](../plans/active/2026-11-13-思维导图插件/006-样例导图与真机验收.md) 的实施记录（`session-d3d041d7-33a0-4596-8966-d0cc91cceee0` seq 1733 起的那轮验收）。

## 相关

- [001-在wiki文档里写一个导图块并验收](../workflows/001-在wiki文档里写一个导图块并验收/001-在wiki文档里写一个导图块并验收.md) — 验收清单里的本地调试步骤引用这里
