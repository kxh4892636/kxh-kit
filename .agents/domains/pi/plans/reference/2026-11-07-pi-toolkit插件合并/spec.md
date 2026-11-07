---
status: completed
---

# 三插件合并为 pi-toolkit 与 /toolkit 开关面板

## 问题

本域能力分布在三个独立 pi 包中：

- `packages/pi-deepseek-web`：注册 `web_search` / `web_fetch`，配置在 `pi-deepseek-web.json`。
- `packages/pi-nested-skill`：发现嵌套 `SKILL.md`、提供 `$skill-name` 补全、展开 `$` 引用。
- `packages/pi-session-name`：首个输入自动命名会话。

三包各自安装、各自配置，启用即生效；使用户需要记三个包名、三份配置与多套行为说明，也无法在一个地方看清「当前启用了哪些能力」。用户要求合并为一个插件 `pi-toolkit`、用一份 JSON 承载全部可配置项、以 `/toolkit`（UI 参照 `/settings`）的三个开关启停三个工具，且默认全部关闭。关联 story 的 US-001 至 US-004。

## 方案

### 单包单入口

`packages/pi-toolkit`（`@kxh4892636/pi-toolkit`，1.0.0）：

- `src/index.ts`：加载配置、注册 `/toolkit`、接线三个功能模块，`session_start` 应用开关。
- `src/settings.ts`：单文件配置的路径解析、按节深合并、校验、写回。
- `src/panel.ts`：`/toolkit` 开关面板（3 行）。
- `src/web/`：`http` / `search` / `fetch` / `format` 原样迁移，`register.ts` 负责注册与启停。
- `src/skills/`：`discover` / `reference` / `suggest` 原样迁移，`register.ts` 负责三个接缝与开关。
- `src/naming/`：`name` 原样迁移，`register.ts` 负责 `input` 接线与开关。

删除三个旧包，`pnpm-lock.yaml` 同步；旧包的历史 ADR 保留。

### 配置结构（`pi-toolkit.json`）

```json
{
  "tools": { "webTools": false, "nestedSkills": false, "sessionName": false },
  "web": {
    "apiKey": "sk-...",
    "apiKeyEnv": "DEEPSEEK_API_KEY",
    "baseURL": "https://api.deepseek.com",
    "searchCount": 10,
    "searchMaxQueries": 10,
    "searchMaxResults": 10,
    "searchSummaryMaxChars": 800,
    "searchTimeoutMs": 30000,
    "fetchTimeoutMs": 30000,
    "fetchMaxOutputChars": 200000
  },
  "nestedSkill": { "excludedDirs": ["node_modules", ".git", "dist", "build", "coverage", "out"] },
  "sessionName": { "maxLength": 21, "timeoutMs": 5000, "maxTokens": 256 }
}
```

候选路径（低到高）：`~/.pi/agent/pi-toolkit.json`、`<cwd>/.pi/pi-toolkit.json`（仅受信项目）、`$PI_TOOLKIT_CONFIG`。按节深合并（后写字段覆盖前者），未知键忽略。`/toolkit` 写回优先级最高的已存在文件，均不存在时创建 agent 目录文件，且只改 `tools` 节、保留其余键。

### 三个开关与生效路径

| 开关 | 覆盖能力 | 生效点 |
| --- | --- | --- |
| `tools.webTools` | `web_search` + `web_fetch` | `session_start` 与切换时增删活动工具；`execute` 再校验开关 |
| `tools.nestedSkills` | 嵌套发现、`$` 补全、`$` 引用展开 | `resources_discover` 与 `input` / 补全请求时读取；发现下一次 `/reload` 生效 |
| `tools.sessionName` | 首个输入自动命名 | `input` handler 读取，下一次输入生效 |

web 工具以 `defaultActive: false` 注册，`applyWebToolActivation()` 只改动这两个工具，不触碰其它工具；开关关闭时 `execute` 抛 `... is disabled. Run /toolkit to enable Web tools.`。

### 面板

复用 pi `/settings` 的组件与交互，不自行实现选择/滚动/宽度：

- `DynamicBorder`（显式传入 `theme.fg` 颜色函数）→ 标题与配置路径 `Text` → `SettingsList`（10 行可视、`getSettingsListTheme()`、`enableSearch: true`）→ `DynamicBorder`。
- 每行 `values: ["on", "off"]`，Enter/Space 循环切换，Esc 关闭，输入过滤。
- 切换回调更新内存设置 → `applyWebToolActivation()` → `saveToggles()`；写文件失败时 `notify` 错误但不中断面板。
- 非 TUI 模式直接 `notify("/toolkit requires interactive mode", "error")`。

### 迁移

- 三个旧包目录删除；本机 `~/.pi/agent/settings.json` 的 `packages` 换成 `packages/pi-toolkit`。
- 本机 `~/.pi/agent/pi-deepseek-web.json` 的 web 字段移入 `pi-toolkit.json` 的 `web` 节，三个开关置 `false`；校验 apiKey 一致后删除旧配置文件与临时备份。
- README 合并为单包文档；新增 ADR-0004；更新域 CONTEXT、CONTEXT-MAP、QUESTIONS。

## 已排除的备选

- **保留三个独立包，新增聚合包**：安装三个包才能得到完整能力，开关仍跨三份配置，与「合并为一个插件」相悖；拒绝。
- **只合并代码、保留多个配置文件**：无法满足「所有可配置项用一个 JSON」，用户在多个文件间找字段；拒绝。
- **默认全开，开关只作为关闭入口**：用户明确要求默认关闭；安装即静默启用网络与模型调用不符合最小惊讶；拒绝。
- **六个细粒度开关（搜索/抓取/发现/引用/补全/命名）**：初版实现后用户澄清「开关只有三个，对应三个工具」；细粒度开关增加面板与配置复杂度，且 web 两个工具始终成对使用；改为三个工具级开关，拒绝保留六个。
- **面板同时编辑数值项（子菜单）**：需为每个数值项设计输入控件，面板复杂度与测试面显著上升；数值项改 JSON 更直接；拒绝。
- **开关写入 session 状态（如 `pi.appendEntry`）而非配置文件**：开关随会话/分支漂移，跨会话不保持；用户要求「配置」；拒绝。
- **开关只影响注册期、不即时生效**：简单但切换后无反馈；除嵌套发现受 `resources_discover` 时机限制外均可即时生效；拒绝。
- **保留旧 `PI_DEEPSEEK_WEB_CONFIG` 与旧配置文件读取**：多一套路径与迁移分支，且与「单一 JSON」冲突；旧配置一次性迁移后删除；拒绝。

## 实施决策

### 配置加载（`src/settings.ts`）

- `configPaths()` 生成三档候选；`loadSettings()` 逐文件读取、`mergeInto()` 递归合并对象、`parseSettings()` 逐字段校验并补默认值；错误消息带字段名与全部候选路径。
- `writePathFor()` 取最后一个已存在路径，否则取第一个（agent 目录）。`saveToggles()` 只合并 `tools` 键，保留其它键与未知键；写前 `mkdirSync`。
- `requireApiKey(web, paths)` 在缺 key 时列出配置路径与 `web.apiKeyEnv`。
- 布尔开关只接受 `true`/`false`；整数上限、`nestedSkill.excludedDirs` 非空字符串数组、`baseURL` 协议/无查询/旧 Anthropic 端点均在加载期校验。

### 入口接线（`src/index.ts`）

- `session_start` 首次加载配置（缓存 `LoadedSettings`）；加载失败 `notify` 错误并保持全部关闭，不使插件不可用。
- 注册顺序：web 工具 → 嵌套 skill 接缝 → 会话命名 → `/toolkit` 命令 → `session_start`。
- `/toolkit` handler：加载失败直接报错返回；成功则打开面板，`onToggle` 合并设置、应用激活、写回文件并在写入失败时提示。

### 功能模块

- `web/register.ts`：保留原工具描述、prompt snippet/guidelines、参数 schema 与格式化逻辑；仅新增 `defaultActive: false`、开关校验与 `applyWebToolActivation()`。
- `skills/register.ts`：`resources_discover` 关闭时返回 `undefined`；`session_start` 仍注册 `$` 补全 provider，但 provider 每次请求读开关，关闭时委托内置 provider；`input` 关闭时直接 `continue`。
- `naming/register.ts`：保留 fire-and-forget、代际防竞态、已有名称保护；`input` 读取 `tools.sessionName` 与 `sessionName.*` 限额。

### 测试

- `settings.test.ts`：路径优先级、默认全关、按节合并、env 覆盖、key 回退、字段校验、写回路径、写回保留其它键、缺 key 报错。
- `panel.test.ts`：3 行与文案、初始 `off`、Enter 切换回调、Esc 关闭、非 TUI 提示；`panelItems()` 映射。
- `index.test.ts`：默认关闭（活动工具不变、`execute` 拒绝）、开启后两工具激活并可执行、既有活动工具被关闭、配置损坏只提示不抛、`/toolkit` 非 TUI、嵌套发现开关、命名开关、面板切换后写回 JSON。
- `web/register.test.ts`、`skills/register.test.ts`、`naming/register.test.ts` 由旧包 index 测试迁移，覆盖开关关闭分支。
- `web/{http,search,fetch,format}.test.ts`、`skills/{discover,reference,suggest}.test.ts`、`naming/name.test.ts` 原样迁移。

## 工作环境

- 宿主：pi 1.5.0（`@earendil-works/pi-coding-agent`、`@earendil-works/pi-tui`，catalog 锁定）。
- 仓库：`kxh-kit`（`main`），pnpm workspace；Node v24.21.0、pnpm 11.22.0。
- 打包：包内无构建步骤，由 pi 的 jiti 加载 TS；pi SDK / pi-tui / typebox 为 peer 依赖。
