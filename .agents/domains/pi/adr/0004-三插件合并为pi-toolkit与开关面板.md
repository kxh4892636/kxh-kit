# 三个插件合并为单包 pi-toolkit 并以开关面板启停

本域原有三个独立 pi 包：`pi-deepseek-web`（web 工具）、`pi-nested-skill`（嵌套 skill 发现与 `$` 引用）、`pi-session-name`（会话自动命名）。用户要求合并为一个插件 `pi-toolkit`，新增 `/toolkit` 命令提供开关面板，所有可配置项由一个 JSON 维护，面板 UI 参照 pi 的 `/settings`，且所有工具默认关闭。此决策替代三个包各自的 `package.json`、`pi.extensions` 与配置文件名，保留 [ADR-0003](0003-搜索与抓取改用DeepSeek官方API.md) 的 web 工具契约。

## Decision

- **单包单入口**：`packages/pi-toolkit`，`pi.extensions` 只指向 `src/index.ts`；web 客户端、skill 发现与命名逻辑按 `src/web/`、`src/skills/`、`src/naming/` 归档，入口统一注册。
- **单一 JSON**：`pi-toolkit.json` 承载 `tools.*` 开关与 `web` / `nestedSkill` / `sessionName` 全部可配置项；候选路径 `~/.pi/agent/pi-toolkit.json` < `<cwd>/.pi/pi-toolkit.json` < `$PI_TOOLKIT_CONFIG`，按节深合并，项目不可信时跳过项目文件。`web.apiKey` 仍可回退 `web.apiKeyEnv`。
- **三个开关、默认全关**：面板只有三行，对应合并前的三个工具——`tools.webTools`（`web_search` + `web_fetch`）、`tools.nestedSkills`（嵌套发现 + `$` 补全 + `$` 展开）、`tools.sessionName`（会话命名）；未配置时三者均为 `false`。web 工具以 `defaultActive: false` 注册，`session_start` 按开关增删活动工具，工具 `execute` 再次校验开关。
- **`/toolkit` 面板**：复用 pi `/settings` 的呈现与交互——`DynamicBorder` + `SettingsList`（`getSettingsListTheme()`、可搜索、Enter/Space 切换、Esc 关闭）；只改三行开关，其它参数留在 JSON。切换即时生效（web 工具活动集、`$` 引用、命名与补全在下一次输入生效，嵌套发现下一次 `/reload` 生效），并写回优先级最高的已存在配置文件，保留文件其余键。
- **迁移**：删除三个旧包及其 `pi-deepseek-web.json` 配置；旧字段平移到 `web` 节，字段名不变。

## Considered Options

- **保留三个独立包，新增一个聚合包**：安装三个包才能得到完整能力，开关仍要跨三个配置文件；与「合并为一个插件」相悖。
- **只合并代码、保留多个配置文件**：可少写迁移代码，但「所有可配置项用一个 JSON」无法成立，用户需在多文件间找字段。
- **继续默认全开，开关只是关闭入口**：把既有用户行为作为默认值，但用户明确要求默认关闭；安装即静默启用网络与模型调用也不符合最小惊讶。
- **面板同时编辑数值项（子菜单）**：需要为每个数值项设计输入控件，面板复杂度与测试面显著上升；开关是本需求的核心，数值项改 JSON 更直接。
- **把开关写入 session 状态（如 `pi.appendEntry`）而非配置文件**：开关会随分支/会话漂移，跨会话不保持；用户要求「配置」。
- **开关只影响注册期、不即时生效**：简单，但用户切换后无反馈；除嵌套发现受 `resources_discover` 时机限制外均可即时生效。

## Consequences

- 一次 `pi install` 得到全部能力；`/toolkit` 一行一个开关，默认全 `off`。
- web 工具需要显式打开，并仍需 `web.apiKey` 或环境变量；未打开时调用报错指明 `/toolkit`。
- 旧配置需迁移为 `pi-toolkit.json`：开关显式置 `true`，web 字段移入 `web` 节；未迁移时能力保持关闭。
- 面板只覆盖开关；修改 `searchCount`、`excludedDirs`、`maxLength` 等仍编辑 JSON，未知键被忽略。
- 嵌套 skill 的开关在下一次 `/reload` 生效，面板描述中已注明。
