---
name: '001-三工具合并为pi-toolkit并由开关面板启停'
description: '嵌套 skill、会话命名与 DeepSeek 网页工具收进一个 pi 包，用 /toolkit 的 /settings 式面板逐项开关，全部配置落一个 JSON。'
status: 'accepted'
---

# 三工具合并为 pi-toolkit 并由开关面板启停

## 背景

三个能力历史上是三个独立 pi 包（`pi-nested-skill`、`pi-session-name`、`pi-deepseek-web`），各自读自己的配置、各自安装。用户要一次装齐、逐项开关，并且只维护一份配置；UI 要与 pi 的 `/settings` 屏幕同形。

## 决策

- 合成一个包 `@kxh4892636/pi-toolkit`，入口 `src/index.ts`，工具共用一个扩展工厂（最初三个，后续补入 `ask_questions` 与 Nano Flow）。
- 每个工具一个开关（`tools.nestedSkills` / `tools.sessionName` / `tools.webTools`），默认全部关闭；`/toolkit` 用 pi 的 `SettingsList` + `getSettingsListTheme()` 渲染，行为与 `/settings` 一致。
- 所有开关与可调参数放同一个 `pi-toolkit.json`（agent 目录、项目 `.pi`、`PI_TOOLKIT_CONFIG` 三级深合并）；面板只写开关，其余字段手改 JSON。
- 每个接缝在**使用时**重读开关（`input`、工具 `execute`、`resources_discover`），因此关掉即失效；只有嵌套 skill 的发现受 pi 的 `resources_discover` 时机限制，需要 `/reload`。

## 后果

- 好处：一次安装、一个面板、一份配置；五个能力的默认行为统一为「关」。
- 代价：五个能力无法分别升级；面板不编辑数值参数；嵌套 skill 的开启要等下一次 `resources_discover`。
- 替代方案被否：三个包共享一份配置需要跨包约定与额外安装顺序，收益不抵复杂度。
