# Pi

pi 扩展业务域：以独立 pi package 扩展宿主能力——发现被「命中即停」规则漏掉的嵌套 skill、以 `$` 引用在任意位置插入并展开 skill，以及经 DeepSeek 的 web 搜索与直连 web 抓取。与 pi 本体解耦，经 `pi install` 安装。

## Language

### 插件形态

**pi 插件**：
以工作区独立包开发、经 `pi install` 安装、通过 `package.json` 的 `pi` 清单提供 extension/skill 资源的 pi 扩展；本域产物。
_避免使用_：上游补丁、改动 pi 仓库、DSH 插件

**扩展接缝**：
pi 对外公开、扩展可挂载的事件与方法面（如 `resources_discover`、`input`、`ctx.ui.addAutocompleteProvider`、`pi.registerTool`）。
_避免使用_：hook、provider、注册表

### 技能发现与引用

**嵌套 skill**：
位于另一个 skill 目录内部、因 pi 发现规则「命中即停」而不可见的 `SKILL.md`。
_避免使用_：子 skill、深层 skill、二级 skill

**隐藏 skill**：
本域插件判定为嵌套、需经 `skillPaths` 补交给宿主加载的 skill；与「嵌套 skill」指同一对象，强调其相对宿主默认发现结果不可见。
_避免使用_：漏网 skill

**`$` 引用**：
用户输入中 `$<skill-name>` 形态的 skill 引用；由本域插件在提交前展开为 skill 正文，可出现在任意位置、可多个。
_避免使用_：美元引用、skill 变量、skill 宏

**声明优先**：
同名冲突时宿主既有（顶层）skill 胜出；`skillPaths` 后加载，故不覆盖顶层声明。
_避免使用_：嵌套优先

### Web 能力

**搜索问答**：
DeepSeek 在 `web_search` 结果块之外返回的 `text` block 正文；作为可选 answer 与来源列表一并交给模型。
_避免使用_：总结、摘要

**web 工具**：
本域 `pi-deepseek-web` 注册的两个模型工具：`web_search`（经 DeepSeek `web_search_20250305` 服务端工具）与 `web_fetch`（直连 HTTP、HTML 经 turndown 转 GFM markdown）。
_避免使用_：MCP 工具、web seam

**插件配置**：
`~/.pi/agent/pi-deepseek-web.json`（项目 `.pi/` 可覆盖，`PI_DEEPSEEK_WEB_CONFIG` 指定绝对路径最高优先）承载 DeepSeek 凭据、端点与限额的独立配置文件。
_避免使用_：settings、环境变量、dotenv

**凭据回退**：
`apiKey` 字面值优先，缺失时读取 `apiKeyEnv`（默认 `DEEPSEEK_API_KEY`）指向的环境变量。
_避免使用_：默认密钥、内置密钥
