---
status: pending
blocked_by: ["01", "05"]
---

# 交付受管 skill 自管理

## 交付

用户可以用 `nm self skill` 检查、预演、安装、更新或卸载包内唯一的 `nano-mem` skill，并在版本陈旧或本地修改时获得可靠状态和保护。

## 范围

- 构建 skill manifest、内容哈希、受管标记与 `not_installed|current|outdated|modified` 状态推导。
- 实现 `status/install/update/uninstall`、默认 `<cwd>/.agents/skills`、`--target`、`--dry-run` 与 `--force`。
- 写操作使用 staging/backup/rename seam，失败恢复原目录；路径解析验证最终目标始终位于明确 target root。
- 只管理单个 `nano-mem` skill，不加入 name/all 集合协议。

## 直接依赖

- 01：需要 CLI 命令、JSON、dry-run 与文件系统 seam；消费其 package/build composition。
- 05：需要最终自包含 skill 内容；消费其 `skills/nano-mem` 树作为 manifest 与安装源。

## 验收

- [ ] 临时 target 中稳定区分四种 skill 安装状态；status 是只读操作且输出目标、包版本和内容哈希依据。
- [ ] install/update/uninstall 的 dry-run 不写文件，真实执行后 status 分别为 current/current/not_installed。
- [ ] modified 状态默认拒绝覆盖或卸载且现场不变；`--force` 只影响已解析的明确 skill 目标。
- [ ] 任意复制/替换失败会恢复原 skill 目录，不留下 staging、backup 或半安装树。
- [ ] Windows 路径、空 target、target 穿越和指向具体 skill 目录等错误输入不会扩大写入范围。

## 上下文

- [spec.md](spec.md)
- [story.md](story.md)
- [Common 领域语言](../../../../common/CONTEXT.md)
- [ADR 0001](../../../adr/0001-分离skill策略面与cli机制面.md)

## 下一步

/code-delivery
