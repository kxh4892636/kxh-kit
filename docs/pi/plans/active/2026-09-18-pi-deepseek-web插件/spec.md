---
status: pending
---

# pi-deepseek-web

## 问题

pi 没有内置 web 搜索。用户需要经 DeepSeek 获得 web 搜索能力，并显式要求插件有一个配置文件用于配置 DeepSeek API。参考 DeepSeek Harness 的 `web-search-deepseek` 与 `tool-web` 实现，另需补一个 web 抓取工具以读取具体页面。

## 方案

工作区包 `@kxh4892636/pi-deepseek-web`（`packages/pi-deepseek-web`），以 pi 扩展形态注册两个模型工具：

- `web_search`：调用 DeepSeek 的 Anthropic 兼容 Messages API，启用 `web_search_20250305` 服务端搜索工具，把 `web_search_tool_result` 结果块与 `text` block 的 citations 合成为来源列表与可选搜索问答。
- `web_fetch`：直连 HTTP 抓取 URL，`text/*` 与 `+json`/`+xml` 原样解码，`text/html` 经 `turndown` 转 GFM markdown。

DeepSeek 的端点、模型、凭据与两个工具的限额统一来自独立配置文件，用户只需填 `apiKey` 即可使用。

## 已排除的备选

- **`web_fetch` 经 DeepSeek server tool**：DeepSeek 只接受 `web_search_20250305` / `web_search_20260209`，实测拒绝 `web_fetch_20250910`；被拒绝。
- **`web_search` 参数用 `queries: string[]`（对齐 DSH）**：pi 没有 DSH 的 web seam，多查询合并逻辑没有落点；模型可直接多次调用工具；被拒绝。
- **自研无依赖 HTML→markdown**：表格、链接、代码块会明显退化；被拒绝。
- **把配置写进 pi `settings.json` 自定义键**：pi 未提供扩展读取自定义配置的接缝；被拒绝。
- **单文件放 `~/.pi/agent/extensions/`**：失去 workspace 校验、测试与版本化；被拒绝。

## 实施决策

### 包布局与形态

- `package.json`：`pi.extensions: ["./src/index.ts"]`；`type: module`；无 build 脚本（pi 用 jiti 直载 TS）。
- 模块划分：`src/index.ts`（扩展工厂，注册工具）、`src/config.ts`（配置读取与默认值）、`src/search.ts`（DeepSeek 客户端与响应映射）、`src/fetch.ts`（HTTP 抓取与 content-type 分类）、`src/format.ts`（模型可见文本投影）。纯逻辑与 pi API 解耦，便于单测。
- 依赖：运行时 `turndown`、`@joplin/turndown-plugin-gfm`；peer `@earendil-works/pi-coding-agent`、`@earendil-works/pi-tui`（`*`）；dev 同名 `^0.85.1` + 仓库 catalog 工具链。

### 配置

- 路径优先级：`PI_DEEPSEEK_WEB_CONFIG`（绝对路径）> `<cwd>/.pi/pi-deepseek-web.json` > `<getAgentDir()>/pi-deepseek-web.json`。用 pi 导出的 `getAgentDir()`、`CONFIG_DIR_NAME` 求默认路径。
- 字段与默认值：`apiKey?`、`apiKeyEnv = "DEEPSEEK_API_KEY"`、`baseURL = "https://api.deepseek.com/anthropic/v1"`、`model = "deepseek-v4-flash"`、`apiVersion = "2023-06-01"`、`maxTokens = 4096`、`maxUses = 5`、`fetchMaxResponseBytes = 5000000`、`fetchMaxBodyChars = 100000`、`fetchTimeoutMs = 30000`。
- 凭据回退：`apiKey` 非空则用；否则读 `apiKeyEnv` 指向的环境变量。缺失时抛错，错误信息包含配置文件路径与 `apiKeyEnv` 名。
- 非法 JSON、未知字段：非法 JSON 抛错；未知字段忽略。文件不存在时全部走默认值。

### `web_search`

- 请求：`POST ${baseURL}/messages`，`redirect: "error"`；请求头 `x-api-key` 与 `authorization: Bearer` 同发、`anthropic-version`、`content-type`、`accept`、`user-agent`。
- body：`{model, max_tokens, messages:[{role:"user",content:[{type:"text",text:"Perform a web search for the query: <q>"}]}], tools:[{type:"web_search_20250305",name:"web_search",max_uses}]}`。
- 映射：遍历 `web_search_tool_result` 的 `web_search_result`（`url/title/page_age`），按 URL 去重；snippet 从 `text` block 的 `citations[].cited_text` 按 URL 关联（首次出现胜出）；`text` 正文作为可选 answer；`truncated` 固定 `false`。
- 无 `web_search_tool_result` 块视为错误。

### `web_fetch`

- `fetch` + `redirect: "follow"`；超时用传入 signal 与 `fetchTimeoutMs` 竞争；`Content-Length` 超 `fetchMaxResponseBytes` 直接报错，流式读取超限截断并标记 `truncated`；解码后超 `fetchMaxBodyChars` 截断。
- content-type 分类：`text/html` / `application/xhtml+xml` → HTML→markdown；`text/*`、`application/json`、`application/xml`、`+json`/`+xml` → 原样文本；其余报错。
- turndown 配置对齐 DSH：`headingStyle:"atx"`、`codeBlockStyle:"fenced"`、`bulletListMarker:"-"`、GFM 插件、移除 `script/style/noscript/template/iframe/object/embed` 等非可见元素。

### 结果投影与错误

- `web_search` 文本 = 可选 answer + `Sources:` markdown 列表（`[title](url)` + snippet + `(publishedAt)`）+ 引用提示；`details` = `{sources, truncated, answer?}`。
- `web_fetch` 文本 = `URL:` / `HTTP status:` / `Content-Type:` 头 + untrusted 提示 + 正文 + 截断标注；`details` = `{url, statusCode, contentType, truncated}`。
- 所有失败在 `execute` 抛错（pi 置 `isError`），错误信息面向自助修复。

## 工作环境

- pi 0.85.1；`pi` CLI 在 PATH；扩展文档与示例在 `C:\Users\kxh\AppData\Local\vite-plus\data\js_runtime\node\24.21.0\node_modules\@earendil-works\pi-coding-agent`。
- 参考仓库：`C:\Users\kxh\kxh-awesome\projects\deepseek-harness` 的 `packages/web/web-search-deepseek/src/provider.ts`、`packages/web/tool-web/src/{search,fetch}.ts`、`packages/web/web-fetch-http/src/provider.ts`。
- 工作区：kxh-kit pnpm workspace（`packages/*`），registry 为 `https://registry.npmmirror.com`。
- DeepSeek 凭据：用户提供 `apiKey`，写入 `~/.pi/agent/pi-deepseek-web.json`（不进仓库）。
- 安装：`pi install <abs path>/packages/pi-deepseek-web`；真机冒烟用 `pi -p` 与会话 jsonl。

## 范围

- 插件包实现、vitest 单测、README（含配置说明与 `.example`）。
- 安装到本机 pi 并写入含 key 的配置文件。
- search / fetch 的真机冒烟证据。

## 非范围

- 图片、PDF 等二进制内容抓取；需要登录/反爬/robots 的站点。
- 修改 pi 上游或引入自定义 provider seam。
- npm 发布与 `web_search_20260209` 的差异化适配。
- `web_fetch` 的代理与同源重定向策略（直接用 `fetch` 默认跟随）。

## 待定

- `turndown` 与 `@joplin/turndown-plugin-gfm` 若被 pnpm 的 `minimumReleaseAge` 拦截，则在 `pnpm-workspace.yaml` 的 `minimumReleaseAgeExclude` 追加两项后重装；恢复条件：`pnpm install` 成功且两包出现在 `packages/pi-deepseek-web/node_modules`。

## 上下文

- [quest 设计记录](../../../../.flow/quest/2026-09-18-pi插件.md)
- [ADR-0002](../../adr/0002-搜索密钥落用户配置与直连抓取.md)
- [CONTEXT](../../CONTEXT.md)
- [ADR-0001](../../adr/0001-嵌套skill以扩展接缝交付.md)
- DeepSeek provider 参考：`C:\Users\kxh\kxh-awesome\projects\deepseek-harness\packages\web\web-search-deepseek\src\provider.ts`
- fetch 参考：`C:\Users\kxh\kxh-awesome\projects\deepseek-harness\packages\web\web-fetch-http\src\provider.ts`、`packages\web\tool-web\src\fetch.ts`
- pi 扩展文档：`.../pi-coding-agent/docs/extensions.md`、`docs/packages.md`

## Issue

| #   | Issue                                          | 状态    | 阻塞于 | 下一步         |
| --- | ---------------------------------------------- | ------- | ------ | -------------- |
| 01  | [搜索工具与配置实现](01-搜索工具与配置实现.md) | pending | —      | /code-delivery |
| 02  | [抓取工具实现](02-抓取工具实现.md)             | pending | 01     | /code-delivery |
| 03  | [安装配置与真机验证](03-安装配置与真机验证.md) | pending | 01, 02 | /code-delivery |
