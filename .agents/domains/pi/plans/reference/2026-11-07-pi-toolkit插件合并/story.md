# 三插件合并为 pi-toolkit 与 /toolkit 开关面板

## 原始想法

> 将 packages/pi-deepseek-web packages/pi-nested-skill packages/pi-session-name 合并为一个插件 pi-toolkit
> 添加 /toolkit 命令, 进入后出现一个开关面板, 可以配置工具的开关, 工具的所有可配置项都使用一个 json 维护
> 开关面板的ui参考 pi 中 /setting 的 ui

> 所有工具默认都是关闭

> 开关只有三个, 对应三个工具

（用户输入，2026-11-07）

## 角色

- **pi 使用者**：同时安装三个本域插件，需要分别记住三个包名、三份配置与显式启用方式；希望一次安装得到全部能力，并在一个面板里按需启停。
- **插件维护者**：维护 `packages/pi-deepseek-web`、`packages/pi-nested-skill`、`packages/pi-session-name` 三个独立包，需要在不丢失既有行为（web 工具契约、嵌套 skill 发现与 `$` 引用、会话命名）的前提下合并为单包，并统一配置入口与启停交互。

## 故事

### 单包交付与三开关

把三个插件合并为 `@kxh4892636/pi-toolkit`，用三个开关分别启停合并前的三个工具，默认全部关闭。

#### US-001 一次安装得到三个工具

作为 pi 使用者，我只安装一个包就能获得 web 工具、嵌套 skill 与会话命名，以便少装包、少记配置。

- [x] `packages/pi-toolkit` 为唯一入口包，`pi.extensions` 只指向 `src/index.ts`；web 客户端、skill 发现与命名逻辑按 `src/web/`、`src/skills/`、`src/naming/` 归档
- [x] 删除 `pi-deepseek-web`、`pi-nested-skill`、`pi-session-name` 三个包及其配置文件名
- [x] 剩余行为不变：web 工具契约、嵌套 skill 发现范围与 `$` 引用展开、会话命名边界均与合并前一致

#### US-002 三个开关，默认全关

作为 pi 使用者，我安装后不被静默激活任何能力，并在 `/toolkit` 中通过三行开关按需启用。

- [x] 面板只有三行，一个开关对应一个合并前的能力：`webTools`（`web_search` + `web_fetch`）、`nestedSkills`（嵌套发现 + `$` 补全 + `$` 展开）、`sessionName`
- [x] 未配置或配置缺省时三个开关均为 `false`：不激活 web 工具、不发现嵌套 skill、不展开 `$`、不自动命名
- [x] 关闭的 web 工具即使被调用也返回可操作的 `/toolkit` 提示，而不是静默执行

### 开关面板

#### US-003 `/toolkit` 面板与 pi `/settings` 一致

作为 pi 使用者，我打开 `/toolkit` 看到与 `/settings` 相同的交互形态，并能立即看到开关结果。

- [x] 面板复用 `/settings` 的组合：`DynamicBorder` + `SettingsList`（`getSettingsListTheme()`、可搜索、Enter/Space 切换、Esc 关闭）
- [x] 顶部显示当前写回的配置文件路径；面板只改开关，其它参数留在 JSON
- [x] `webTools` 切换立即增删活动工具；`nestedSkills` 的补全与展开在下一次输入生效、发现下一次 `/reload` 生效；`sessionName` 在下一次输入生效
- [x] 非 TUI 模式下 `/toolkit` 给出明确错误提示而不是崩溃

### 单一配置

#### US-004 一份 JSON 承载全部开关与参数

作为 pi 使用者，我在一个文件里找到并修改所有可配置项，路径优先级符合既有习惯。

- [x] `pi-toolkit.json` 承载 `tools.*` 开关与 `web` / `nestedSkill` / `sessionName` 全部参数；未知键被忽略
- [x] 候选路径 `~/.pi/agent/pi-toolkit.json` < `<cwd>/.pi/pi-toolkit.json`（仅受信项目）< `$PI_TOOLKIT_CONFIG`；按节深合并
- [x] `/toolkit` 写回优先级最高的已存在文件，保留文件其余键，不把解析出的 apiKey 写回
- [x] 旧 `pi-deepseek-web.json` 的 web 字段平移到 `web` 节；旧包配置与本机安装项完成迁移

## 约束与澄清

- 用户原话（2026-11-07）：合并三个插件为 `pi-toolkit`；新增 `/toolkit` 开关面板；所有可配置项用一个 JSON 维护；面板 UI 参考 `/settings`；所有工具默认关闭；开关只有三个，对应三个工具。
- 已确认变更（2026-11-07，用户补充）：初版按能力拆出六个开关（web 搜索/抓取、嵌套发现、`$` 引用、`$` 补全、会话命名），随后收敛为三个工具级开关；`web_search` 与 `web_fetch` 共用一个 `webTools` 开关。
- 沿用本域既有 ADR：web 工具契约（ADR-0003）、配置落用户目录且密钥不入仓库（ADR-0002）、嵌套 skill 以扩展接缝交付（ADR-0001）。
- 面板不编辑数值项：`searchCount`、`excludedDirs`、`maxLength` 等仍编辑 JSON，避免为每个数值项设计输入控件。

## 迷雾

无。开关粒度（3 个而非 6 个）、默认值（全关）、配置形态（单文件）、面板范围（只改开关）均在 2026-11-07 用户输入中确认。

## 上下文

- [spec](spec.md)
- [pi 业务域 CONTEXT](../../../CONTEXT.md)、[QUESTIONS](../../../QUESTIONS.md)
- [ADR-0001](../../../adr/0001-嵌套skill以扩展接缝交付.md)、[ADR-0002](../../../adr/0002-搜索密钥落用户配置与直连抓取.md)、[ADR-0003](../../../adr/0003-搜索与抓取改用DeepSeek官方API.md)、[ADR-0004](../../../adr/0004-三插件合并为pi-toolkit与开关面板.md)
- 上一 Plans：[pi-deepseek-web 插件](../../reference/2026-09-18-pi-deepseek-web插件/spec.md)、[pi-nested-skill 插件](../../reference/2026-09-18-pi-nested-skill插件/spec.md)、[pi 会话自动命名](../../reference/2026-10-14-pi会话自动命名/spec.md)
- 代码：`packages/pi-toolkit/src/{index,settings,panel}.ts`、`src/{web,skills,naming}/register.ts`
