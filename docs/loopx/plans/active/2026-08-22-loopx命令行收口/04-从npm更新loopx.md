---
status: in_progress
blocked_by: ["03"]
---

# 从 npm 更新 loopx

## 交付

使用者显式执行 `loopx self update` 时，可检测并安装 npm 中的 CLI 版本，然后将已安装受管 skill 同步到同版；失败时保留原可用状态。

## 范围

- 在 self module 的 internal seam 定义 PackageManagerPort，隐藏 npm 查询、候选包获取、全局安装与回滚；production 使用 npm CLI adapter，测试使用 scripted adapter。
- `loopx self update` 默认 selector 为 `latest` 且不选 prerelease；`--version <semver-or-tag>` 覆盖 selector。
- 无更新时返回成功 JSON 且不写入；预演只返回候选版本、CLI 替换与 skill 同步计划。
- 真实更新保存当前版本可恢复信息，安装新 CLI 后通过 SkillStore 同步原已安装的 skill；任一失败触发 CLI/skill 回滚。
- 本 issue 不发布 npm 包，不在普通命令启动时检查更新。

## 直接依赖

- 03: CLI 更新后需要原子同步已安装 skill；消费其 SkillStore 选择、受管标记、更新和回滚契约。

## 验收

- [x] scripted PackageManagerPort 测试覆盖 `latest`、指定 semver/tag、排除 prerelease、无更新、查询失败、安装失败和 skill 同步失败。
- [x] 各失败路径后 CLI 版本与已安装 skill 文件树均等于更新前快照。
- [x] `--dry-run` 不调用 PackageManagerPort 的安装方法或 SkillStore 写方法，但返回完整 JSON 计划。
- [x] `vp run @kxh4892636/loopx#test`、`vp run @kxh4892636/loopx#build` 和 `vp check` 通过。

## 上下文

- [spec](spec.md)
- [Skill 安装生命周期](03-Skill安装生命周期.md)
- [CLI 与受管 skill 同版发布](../../../adr/0003-cli与受管skill同版发布.md)

## 下一步

/implement

## 交付记录

交付物：`self update` 编排、真实 npm tgz 候选 skill 解析、Windows npm adapter、CLI/skill 回滚与 semver selector。

验证证据：31 个 LoopX 测试通过；包构建通过；全仓 `vp check` 为 0 error（31 个既有 warning）；本机 Node 直启 npm CLI 返回 11.6.2；Standards/Spec 双轴审查均无 blocker。
