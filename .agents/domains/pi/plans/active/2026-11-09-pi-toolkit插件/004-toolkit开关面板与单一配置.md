---
name: '004-toolkit开关面板与单一配置'
description: '/toolkit 复用 pi /settings 的 SettingsList 与主题，三行开关写回 pi-toolkit.json，其余参数留在同一 JSON。'
status: 'completed'
related_noted: ['001-嵌套skill发现与$引用', '002-会话自动命名', '003-DeepSeek网页工具']
---

# toolkit 开关面板与单一配置

## 做法

- `src/settings.ts`：唯一配置层。候选路径按 `~/.pi/agent/pi-toolkit.json`、`<cwd>/.pi/pi-toolkit.json`、`$PI_TOOLKIT_CONFIG` 排序并逐节深合并；项目文件只在项目受信时读取。字段逐项校验（布尔、正整数、URL、字符串数组），未知字段忽略；缺文件等于「全关」。
- `/toolkit` 写入优先级最高的**已存在**文件，没有则创建 agent 目录下的 `pi-toolkit.json`；写回只合并 `tools` 节，保留其它键与手写参数。
- `src/panel.ts`：`DynamicBorder`（`theme.fg("border")`）+ 标题 + 配置路径 + 宿主 `SettingsList`（`enableSearch`、`getSettingsListTheme()`、`maxVisible 10`）+ 收尾边框；Enter/Space 在 `on`/`off` 间切换，Esc 关闭，输入即过滤。非 TUI 模式只提示「/toolkit requires interactive mode」。
- 三个开关默认 `false`；切换立即更新内存、写盘并触发能立即生效的动作（web 工具的激活集合），其它接缝在下次使用时读新值。

## 证据

- `pi-toolkit.example.json` 展示全部字段。
- 单测覆盖：三级路径优先级、深合并、字段校验、写回保留其它键、面板渲染/搜索/切换/取消、非交互模式拒绝。
- 本机已清除三条指向已删目录的旧包声明，并 `pi install` 本包；非交互会话冒烟通过。真机面板交互留待用户验收。
