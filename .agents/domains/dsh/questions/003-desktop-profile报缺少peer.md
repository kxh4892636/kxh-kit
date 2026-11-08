---
name: '003-desktop-profile报缺少peer'
description: 'desktop profile 执行 pnpm peers check 时报缺少 @deepseek-ai/* peer。'
---

# 003-desktop-profile报缺少peer

## 适用条件与现象

插件装好后在 `~/.dsh/profiles/desktop` 执行 `pnpm peers check`，列出 `missing peer @deepseek-ai/cordis|dsh-fs|dsh-home-paths|dsh-skill`。

## 原因

profile 的 `pnpm-workspace.yaml` 设了 `autoInstallPeers: false`；插件声明的 DSH peer 由宿主运行时提供，本就装进 profile 里。

## 解决方法

不要为了消警告把它们加成 profile 依赖（会造成双份 dsh 包、版本混装）；以「插件是否被宿主加载、能否发现 skill / 工具」为准。

## 验证

安装后 peer 警告仍在，但宿主正常加载插件并发现嵌套 skill 与 `nano_flow_*` 工具。

## 来源

迁移前 dsh 领域文档，原问题 3。
