---
status: completed
blocked_by: ["01"]
---

# Skill 目录与版本检测

## 交付

使用者可通过 `nf self skill list` 查看 CLI 包内 skill，并通过 `check --name` 判定指定目标的安装状态。

## 范围

- 将当前 `packages/nano-flow/skills` 重组为 `skills/nano-flow/` 完整树，保持与 `.agents/skills/nano-flow` 的内容契约。
- 从 `skills/*/SKILL.md` 构建 catalog，打包时以 CLI 版本和内容哈希生成 manifest；新增 skill 目录不修改 catalog 共享代码。
- 实现受管标记和 `not_installed | current | outdated | modified` 推导，哈希排除标记自身。
- 实现 `nf self skill list [--target <path>]` 和 `nf self skill check --name <skill> [--target <path>]`；默认 target 根为 `<cwd>/.agents/skills`。
- 本 issue 不改动目标 skill 文件，不实现安装/卸载/更新。

## 直接依赖

- 01: 需要在 `self` 内建子命令中暴露 catalog 查询；消费其 `BuiltinCommand`、typed option、JSON 和 help 契约。

## 验收

- [x] 从已打包产物运行 `skill list`，JSON 至少列出 `nano-flow`、CLI 版本、目标路径和安装状态。
- [x] 临时工作区测试覆盖四种状态；改动一个受管文件后稳定返回 `modified`。
- [x] `list` / `check` 是 query，传入 `--dry-run` 仍执行查询且不写目标。
- [x] `vp run @kxh4892636/nano-flow#test`、`vp run @kxh4892636/nano-flow#build` 和 `vp check` 通过。

## 上下文

- [spec](spec.md)
- [CLI 与受管 skill 同版发布](../../../adr/0003-cli与受管skill同版发布.md)
- [`nano-flow` 当前安装源](../../../../../.agents/skills/nano-flow/SKILL.md)

## 下一步

/implement

## 交付记录

- 交付物：`skills/nano-flow/` 完整树、build-time manifest 生成器、`self skill list/check` 与四态检测模块。
- 验证证据：17 个 CLI/interface 测试、构建与 `vp check` 通过；本地 `.tgz` 的 dry-run list 返回 `nano-flow@0.1.0` 且未创建目标目录。
- 审查：相对 `4907b13` 的 Standards/Spec 双轴复审均无阻断项。
