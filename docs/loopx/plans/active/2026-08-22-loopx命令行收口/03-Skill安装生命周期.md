---
status: pending
blocked_by: ["02"]
---

# Skill 安装生命周期

## 交付

使用者可安全地安装、更新和卸载单个或全部受管 skill，并在真实变更前预演整批操作。

## 范围

- 在 deep SkillStore module 中实现 `install --name|--all`、`update --name`、`uninstall --name|--all`、`--target` 和 `--force`。
- `--name` 与 `--all` 必须且只能提供一个；未知 skill、非受管目录和本地修改均给出稳定用法/运行时错误。
- 批量写操作先预检全部目标；任一目标冲突时整批不变，`--force` 才可处理已受管但被修改的 skill。
- 使用同父目录临时树、完整校验与原子替换；失败不留部分目标或临时文件。
- 预演输出选中的 skill、来源/目标、旧新版本和将采取的操作，文件系统零变更。

## 直接依赖

- 02: 需要选择可用 skill 并判断受管/修改状态；消费其 catalog、manifest、受管标记和状态契约。

## 验收

- [ ] 临时工作区端到端测试覆盖单个/全部安装、更新、单个/全部卸载，每次后 `check` 状态正确。
- [ ] 本地修改、非受管同名目录和人工注入的中途失败均证明默认不覆盖、不部分完成；`--force` 只放宽已确认的本地修改保护。
- [ ] 所有写命令的 `--dry-run` 输出可判定 JSON 计划，目标文件树哈希前后一致。
- [ ] `vp run @kxh4892636/loopx#test`、`vp run @kxh4892636/loopx#build` 和 `vp check` 通过。

## 上下文

- [spec](spec.md)
- [Skill 目录与版本检测](02-Skill目录与版本检测.md)
- [CLI 与受管 skill 同版发布](../../../adr/0003-cli与受管skill同版发布.md)

## 下一步

/implement

## 交付记录

待交付。
