---
name: '002-PATH上的dsh不能装desktop插件'
description: 'PATH 上的 dsh 与 desktop 宿主版本不一致，装 desktop 插件会写错 profile。'
---

# 002-PATH上的dsh不能装desktop插件

## 适用条件与现象

`Get-Command dsh` 命中 `C:\Users\kxh\AppData\Local\vite-plus\bin\dsh.cmd`，`dsh --version` 与 desktop 宿主不一致；用它 `plugin --profile desktop add` 会按旧代规则写 profile。

## 原因

该入口属于 vite-plus 的 js_runtime 安装，是独立的 dsh 副本，不认 desktop 的 profile 约定与 bundle 模板。

## 解决方法

desktop 场景一律用应用自带 CLI：`<install dir>\resources\runtime\cli\bin\dsh.cmd`（`ELECTRON_RUN_AS_NODE` 拉起 `dsh-desktop-host/lib/cli.js`，`--version` 与宿主同值）。

## 验证

`& "$env:LOCALAPPDATA\Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd" --version` 输出与宿主一致。

## 来源

迁移前 dsh 领域文档，原问题 2。
