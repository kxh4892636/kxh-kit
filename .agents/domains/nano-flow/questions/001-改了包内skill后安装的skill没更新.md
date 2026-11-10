---
name: '001-改了包内skill后安装的skill没更新'
description: '改包内 skill 后要构建 CLI 并 self skill install，两份目录成对提交。'
---

# 001-改了包内skill后安装的skill没更新

## 适用条件与现象

修改 `packages/nano-flow/skills/nano-flow-cli/` 后，`.agents/skills/nano-flow-cli/` 内容不变；`nnf self skill check --name nano-flow-cli` 返回 `modified` 或 `outdated`。

## 原因

包内 `skills/` 是发布源，`.agents/skills/` 是 `nnf self skill` 的安装产物；安装只从 CLI 包内清单写入，内容哈希只用于识别安装状态。CLI 与受管 skill 同版本发布。

## 解决方法

先构建 CLI 刷新 `generated-skill-manifest.ts`，再执行 `nnf self skill install --name nano-flow-cli`；仓库内两份目录都受版本控制，需成对提交。

## 验证

`nnf self skill check --name nano-flow-cli` 返回 `current`，且 `diff -r` 两份目录无差异。

## 来源

[self.md](../../../../packages/nano-flow/skills/nano-flow-cli/references/self.md)、[ADR 003](../adr/003-cli与受管skill同版发布.md)
