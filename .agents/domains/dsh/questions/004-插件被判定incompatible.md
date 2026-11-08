---
name: '004-插件被判定incompatible'
description: 'dsh plugin add 输出插件与当前 DSH 版本不兼容时如何对齐声明。'
---

# 004-插件被判定incompatible

## 适用条件与现象

`dsh plugin add` 输出 `Plugin … is incompatible with dsh <版本>: requirements …`，提示可用 `dsh plugin allow-version` 或插件管理器给「精确版本豁免」。

## 原因

0.2.x 按 manifest 评估兼容性——有 `engines.dsh` 只看它，否则要求每个 `@deepseek-ai/dsh*` peer 范围满足运行版本。

## 解决方法

把 peer 精确改到宿主实装版本并重装依赖、重打包、重装；不要用豁免掩盖声明漂移。声明应等于已在本机验证的版本。

## 验证

本包 peer 对齐到宿主实装版本后，安装不再报 incompatible；`nano_flow_check` 与插件工具在会话内可用。

## 来源

迁移前 dsh 领域文档，原问题 4。
