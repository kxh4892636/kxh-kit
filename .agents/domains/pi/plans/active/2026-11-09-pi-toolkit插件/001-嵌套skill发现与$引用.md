---
name: '001-嵌套skill发现与$引用'
description: '通过 resources_discover 补交内建扫描看不见的嵌套 SKILL.md，并在输入中用 $skill-name 补全与展开为宿主同形 skill 块。'
status: 'blocked'
reason: '等待用户验收'
next_step: '在工作区打开 nestedSkills 后输入 $nano-flow-cli 验证补全与展开'
related_noted: ['004-toolkit开关面板与单一配置']
---

# 嵌套 skill 发现与 `$` 引用

## 做法

- `src/skills/discover.ts` 从 agent skills 目录、用户 `~/.agents/skills`、受信项目的 `.pi/skills` 与 `.agents/skills`（到 git 根）、以及宿主已知 skill 目录出发，找出「自身有 `SKILL.md` 且祖先目录也有 `SKILL.md`」的目录；结果 canonicalize 后排序。
- `src/skills/register.ts` 在 `resources_discover` 里把结果作为 `skillPaths` 交回宿主。发现只在启动与 `/reload` 发生，所以开关打开后要等下一次 `resources_discover`。
- `src/skills/suggest.ts` 包装宿主的 autocomplete provider：光标前的 `$<query>` 用 `fuzzyFilter` 排序，选中后插入 `$skill-name `；其它输入原样委托给内置 provider。
- `src/skills/reference.ts` 在提交前把可解析的 `$name` 替换成 `<skill name location>` 块（与 `/skill:name` 同形），未知 token（如 `$HOME`）保持原样；同名时宿主已有 skill 胜出。

## 证据

- 三个接缝都在使用时重读 `tools.nestedSkills`，关掉即不再补交、补全或展开。
- 真实文件系统探针：临时项目 `.agents/skills/outer/{nested,references/inner}/SKILL.md` 两处都被发现。
- `pnpm --filter @kxh4892636/pi-toolkit test` 覆盖发现、补全、展开与开关关闭路径。
