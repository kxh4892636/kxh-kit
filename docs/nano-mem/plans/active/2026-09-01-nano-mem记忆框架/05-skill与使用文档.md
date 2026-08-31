---
status: pending
blocked_by: ["04"]
---

# nano-mem skill 与 README 使用文档

## 交付

`packages/nano-mem/skills/nano-mem/SKILL.md`（agent 使用纪律与契约）与 `README.md`（US-007 使用文档）就绪；记忆命令（add/search/get/list/use/delete/gc/stats）的用法、语义、遗忘边界全部成文，可随包分发安装到工作区 `.agents/skills`。

## 范围

- `skills/nano-mem/SKILL.md`：frontmatter（name: nano-mem + description，风格对齐 loop-x-cli）；内容——契约段（`nm --help` 为事实源、`--json`、退出码 0/1/2）；何时 `add`（完成项目决策/用户偏好/踩坑/事实性结论）、何时 `search`（任务开始前/相似任务）、何时 `use`（记忆实际用于回答或产物）；记忆三态与遗忘语义（搜不到不代表没有；`--include-dormant` 边界）；弱使用/强使用的说明。
- `README.md`：安装（npm i -g / npx 形式）、快速开始、命令参考（含 self 命令占位小节——详细文档由 06 补全）、`NANO_MEM_DB`、`--json` 契约与退出码、遗忘语义。
- 不做：self 命令实现（06）与 README self 章节细化（06 补充）；冒烟安装验证（07）。

## 直接依赖

- 04: 检索排序与遗忘语义（score/阈值/三态/--include-dormant/--score-weights）；消费其最终命令行为写文档与 skill 纪律。

## 验收

- [ ] `skills/nano-mem/SKILL.md` 存在于包内并含 name: nano-mem frontmatter、契约段、add/search/use 时机与三态语义。
- [ ] README 覆盖全部 8 个记忆命令的用法与示例；`NANO_MEM_DB`、`--json` 契约、退出码成文。
- [ ] 文档描述与 `nm --help` 输出逐项一致（手测：命令名/选项名/默认值无出入）。

## 上下文

- [spec](../../../docs/nano-mem/plans/active/2026-09-01-nano-mem记忆框架/spec.md) 实施决策「skill 与文档」
- [story US-005/US-007](../../../docs/nano-mem/plans/active/2026-09-01-nano-mem记忆框架/story.md)
- [CONTEXT 使用/遗忘](../../../docs/nano-mem/CONTEXT.md)
- `.agents/skills/loop-x-cli/SKILL.md` — 契约段写法参考

## 下一步

决策已澄清：/code-delivery
