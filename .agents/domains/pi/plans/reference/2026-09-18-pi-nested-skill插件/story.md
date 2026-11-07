# pi-nested-skill插件

> 由 spec 迁移生成（2026-11-07）；原 Plan 无独立 story。

## US-001 pi-nested-skill插件

pi 现有两处能力缺口：

1. **单输入单 skill**：宿主 `_expandSkillCommand` 仅当整段输入以 `/skill:` 开头时展开，且只取首个 token；`/` 补全也只在行首触发。用户无法在一次输入里于任意位置插入并展开多个 skill。
2. **嵌套 skill 不可见**：pi 的 skill 发现是「命中即停」——目录一旦含 `SKILL.md` 即不再下钻。Nano Flow 等技能把主流程 skill 放在 `.agents/skills/nano-flow/references/skills/*/SKILL.md`，被上层 `nano-flow/SKILL.md` 截断而完全不可见。

用户要求：任意位置插入多个 skill、自动发现嵌套文件夹中的 skill、以 `$skill-name` 触发发现/搜索并显示选择 UI，且实现复用 pi 内部 `/xxx-name` 的逻辑。
