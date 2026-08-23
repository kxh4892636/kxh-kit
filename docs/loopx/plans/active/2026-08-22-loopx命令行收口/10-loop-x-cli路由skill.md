---
status: completed
blocked_by: ["03", "04", "05", "06", "07", "08", "09"]
---

# loop-x-cli 路由 skill

## 交付

受管 `loop-x-cli` skill 可识别 LoopX CLI 任务并路由到正确的 `self` 或 `anki` 子命令；现有 Anki agent 能力在新 skill 中拥有完整替代形态。

## 范围

- 在 `packages/loopx/skills/loop-x-cli/` 建立路由 skill，使用 `/writing-for-agents` 将触发条件、命令导航、安全边界和结果解读编写为 agent 可导航文档。
- 路由 `loopx self update`、`self skill list/check/install/update/uninstall` 以及全部 `loopx anki` 命令族。
- 吸收 `.agents/skills/anki-cli` 中的 AnkiConnect 前置、JSON 参数与安全说明，将命令入口改为 `loopx anki`；本 issue 先保留旧 skill，由 contract issue 删除。
- 验证 build-time catalog 自动发现 `loop-x-cli`，`skill list`、`install --name loop-x-cli` 和 `install --all` 同时管理 `loop-x` / `loop-x-cli`，不修改 catalog 核心代码。
- 不把每个内建子命令拆成独立 agent skill，不改动 Loop Kit 的 `loop-x` 工作流 skill。

## 直接依赖

- 03: 需要让新 skill 被受管生命周期发现、安装和卸载；消费其 catalog 自动发现与 SkillStore 写契约。
- 04: 需要路由 CLI self-update；消费其 `self update`、版本 selector 和失败语义。
- 05: 需要路由 Anki 连接选项与牌组命令；消费其稳定顶层/scoped options 和牌组命令路径。
- 06: 需要路由笔记和笔记类型命令；消费其稳定命令路径与 options。
- 07: 需要路由卡片、同步和复习会话；消费其稳定命令路径与交互契约。
- 08: 需要路由标签、媒体与统计命令；消费其稳定命令路径与安全约束。
- 09: 需要路由 GUI 命令；消费其稳定命令路径与 GUI 前置。

## 验收

- [x] skill 路由表覆盖 `self`、牌组、笔记、笔记类型、卡片/复习、标签、媒体、统计和 GUI，所有示例只使用命名 options 和 `loopx` bin。
- [x] `/writing-for-agents` 验证触发、导航、安全与上下文层级，且不复制 CLI `--help` 可生成的完整参考。
- [x] 打包后 `skill list` 同时列出 `loop-x` 和 `loop-x-cli`；临时工作区中单个/全部安装、check 和卸载均通过。
- [x] `vp run @kxh4892636/loopx#test`、`vp run @kxh4892636/loopx#build` 和 `vp check` 通过。

## 上下文

- [spec](spec.md)
- [LoopX 领域术语](../../../CONTEXT.md)
- [当前 Anki agent skill](../../../../../.agents/skills/anki-cli/SKILL.md)
- [Skill 安装生命周期](03-Skill安装生命周期.md)

## 下一步

/implement

## 交付记录

交付物：受管 `loop-x-cli` skill 已按 self/Anki 两个 branch 渐进披露，覆盖 CLI 自管理、全部 Anki 命令族、安全边界和结果契约；build-time catalog 自动发现并管理两个 skills。

验证证据：skill `quick_validate` 通过；177 个 LoopX 测试、LoopX 构建和全仓 `vp check` 通过（31 个既有 warning）；dangling commit `94383ad117a374f7bc69dfaee01f452ab785ecb8` 的 Standards/Spec 双轴复审均无 blocker。
