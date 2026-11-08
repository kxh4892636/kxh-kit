---
name: '001-desktop-dump-config报错'
description: '在 desktop profile 上执行 --dump-config 等 boot 类命令时报独占托管错误。'
---

# 001-desktop-dump-config报错

## 适用条件与现象

在 desktop 版 DSH 上用自带 CLI 执行 `--dump-config`（或任何 boot 类命令）指向 `desktop` profile，得到 `error: profile "desktop" is managed exclusively by the Electron application`，退出码 1。

## 原因

desktop 应用把 `~/.dsh/profiles/desktop` 视为独占托管；CLI 只放开 `plugin` 子命令（转发 pnpm）等运维入口，不复制宿主的组合逻辑。

## 解决方法

用「profile 清单 + 运行中宿主」代替组合层证据：读 `~/.dsh/profiles/desktop/package.json` 的 `dependencies` 与 `dsh.profile.bundles`，再看运行中会话的 skill / 工具目录是否出现插件产物。

## 验证

安装 `@kxh4892636/dsh-toolkit` 后，profile 的 `bundles` 末项出现该包，且本会话 skill 目录出现随包 skill、工具目录出现 `nano_flow_*`。

## 来源

迁移前 dsh 领域文档，原问题 1。
