# dsh嵌套skill发现插件

> 由 spec 迁移生成（2026-11-07）；原 Plan 无独立 story。

## US-001 dsh嵌套skill发现插件

DSH 内建 provider 只发现 `.agents/skills/<skill>/SKILL.md` 的一层形态；Nano Flow 等技能把主流程 skill 嵌套在 `references/skills/` 下（如 `.agents/skills/nano-flow/references/skills/*/SKILL.md`），DSH 目录完全不可见。用户需要 DSH 在 `.agents` 目录内任意深度发现嵌套 skill，并以独立插件交付、安装到本机 profile。
