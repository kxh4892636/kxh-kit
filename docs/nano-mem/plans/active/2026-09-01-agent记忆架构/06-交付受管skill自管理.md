---
status: completed
blocked_by: ["01", "05"]
---

# 交付受管 skill 自管理

## 交付

用户可以用 `nm self skill` 检查、预演、安装、更新或卸载包内唯一的 `nano-mem` skill，并在版本陈旧或本地修改时获得可靠状态和保护。

## 范围

- 构建 skill manifest、内容哈希、受管标记与 `not_installed|current|outdated|modified` 状态推导。
- 实现 `status/install/update/uninstall`、默认 `<cwd>/.agents/skills`、`--target`、`--dry-run` 与 `--force`。
- 写操作使用 staging/backup/rename seam；破坏性清理开始前失败则恢复原目录且清除事务目录，清理已部分执行时保留剩余 backup 并明确报告恢复失败，避免扩大数据损失；路径解析验证最终目标始终位于明确 target root。
- 只管理单个 `nano-mem` skill，不加入 name/all 集合协议。

## 直接依赖

- 01：需要 CLI 命令、JSON、dry-run 与文件系统 seam；消费其 package/build composition。
- 05：需要最终自包含 skill 内容；消费其 `skills/nano-mem` 树作为 manifest 与安装源。

## 验收

- [x] 临时 target 中稳定区分四种 skill 安装状态；status 是只读操作且输出目标、包版本和内容哈希依据。
- [x] install/update/uninstall 的 dry-run 不写文件，真实执行后 status 分别为 current/current/not_installed。
- [x] modified 状态默认拒绝覆盖或卸载且现场不变；`--force` 只影响已解析的明确 skill 目标。
- [x] 破坏性 backup 清理开始前的任意复制/替换失败会恢复原 skill 目录且不留下事务树；清理若部分失败则返回明确恢复失败并保留最后可恢复副本。
- [x] Windows 路径、空 target、target 穿越和指向具体 skill 目录等错误输入不会扩大写入范围。

## 交付记录

- 交付物：构建期 manifest generator、受管 skill 文件系统 adapter、状态/事务 service、`nm self skill` 命令组及其测试。
- 构建期生成单 skill manifest，记录包版本、文件 SHA-256 与 tree hash；安装 marker 与实际树共同推导 `not_installed|current|outdated|modified`。
- `self skill status|install|update|uninstall` 支持默认 target、显式 `--target`、`--dry-run` 与 `--force`，并拒绝空路径、父目录穿越、具体 skill 目录及 symlink target root。
- staging/backup/rename 事务在破坏性清理前完整回滚；递归清理一旦部分失败即保留最后恢复副本并返回 `SKILL_ROLLBACK_FAILED`，不以不完整快照伪装成功恢复。
- rename 捕获现场后重新检查实际 backup 状态与 force 授权，阻断检查与写入之间的并发本地修改；Windows junction 测试证明 force 替换不会跟随或删除外部目标。
- 验证证据：包级 check、build、87 tests 全部通过；coverage 为 statements 95.81%、branches 90%、functions 97.75%、lines 96.23%；built CLI 临时 target install/status/uninstall smoke 通过。
- 当前 staged fixed point 的 Standards/security 与 Spec 双轴复审均为 0 findings。

## 上下文

- [spec.md](spec.md)
- [story.md](story.md)
- [Common 领域语言](../../../../common/CONTEXT.md)
- [ADR 0001](../../../adr/0001-分离skill策略面与cli机制面.md)

## 下一步

/code-delivery
