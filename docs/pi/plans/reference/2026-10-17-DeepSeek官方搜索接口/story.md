# DeepSeek 官方搜索接口迁移

## 原始想法

> 更新 pi-deepseek-web/src 插件, 现在 DeepSeek 支持官方搜索 API, https://api-docs.deepseek.com/zh-cn/guides/search

（用户输入，2026-10-17）

## 角色

- **pi 使用者**：依赖 `web_search` 获取实时网页信息，希望直接用上 DeepSeek 官方搜索能力，少一次模型轮次、结果稳定可引用。
- **插件维护者**：维护 `packages/pi-deepseek-web`，需要在保留既有配置与 `web_fetch` 能力的前提下替换搜索传输层，并补齐测试、文档与真机证据。

## 故事

### 官方搜索接口迁移

把 `web_search` 从 Anthropic 兼容 Messages 的服务端搜索工具迁移到 DeepSeek 官方 Search API，同时不破坏既有配置和抓取工具。

#### US-001 web_search 直连官方 Search API

作为 pi 使用者，我希望 `web_search` 直接调用 DeepSeek 官方 Search API，并且工具契约完整暴露请求体、搜索语法与响应结构，以便模型按官方能力检索并引用结果。

- [x] `web_search` 向 `POST {baseURL}/v1/tools/search` 发送官方请求体，使用 Bearer 鉴权。
- [x] 工具参数覆盖官方 Search 请求字段：`query`（必填）、`count`、`ori_question`、`localization`、`need_content`；`query` 描述包含 `site:`、`-site:`、`-`、`-"..."`、`"..."`、`lang:`、`after:`、`before:` 语法。
- [x] 未提供 `count` 时使用配置 `searchCount`（默认 10）；`ori_question`、`localization`、`need_content` 未提供时不发送，由官方默认值处理。
- [x] 响应完整保留官方字段：`rerank_score`、`title`、`url`、`snippet`、`summary`、`content`、`site_name`、`site_icon`、`date`、`authority`；`details` 暴露 `{ count, results }`。
- [x] 模型可见文本包含标题、URL、摘要、站点、时间、评分/权威性；`need_content: true` 时同时展示正文。
- [x] 非 2xx、网络失败、响应不可读时错误包含 HTTP 状态、官方 `error.message` 与端点，便于自助修复。
- [x] 不再调用 Anthropic Messages 端点，不发送 `web_search_20250305`，不依赖模型触发搜索。

#### US-002 配置、web_fetch 与官方 Fetch API

作为现有用户，我升级插件后只需保留 `apiKey` 即可继续使用，并且 `web_fetch` 也统一走 DeepSeek 官方 Fetch API。

- [x] `apiKey` / `apiKeyEnv` 的读取优先级与既有行为一致；缺失时报错仍列出配置路径。
- [x] `baseURL` 默认改为 `https://api.deepseek.com`；旧 Anthropic 端点得到可操作报错，而不是静默 404。
- [x] `web_fetch` 调用 `POST {baseURL}/v1/tools/fetch`，请求体 `{ url }`，返回官方响应 `{ title, content }`；正文按配置字符上限截断。
- [x] `web_fetch` 的 `details` 暴露 `{ url, title, content, truncated }`，刷新官方响应与截断状态。
- [x] 移除直连 HTTP + turndown 实现及 `turndown`、`@joplin/turndown-plugin-gfm` 依赖。
- [x] 移除仅服务 Anthropic Messages 的 `model`、`apiVersion`、`maxTokens`、`maxUses` 配置消费；旧配置中的未知字段被忽略。
- [x] 本机 `~/.pi/agent/pi-deepseek-web.json` 更新后，真机 `web_search` 与 `web_fetch` 各成功一次；仓库与提交不含密钥。

## 约束与澄清

- 用户原话（2026-10-17）：更新插件以使用 DeepSeek 官方搜索 API，并给出官方指南链接。
- 官方指南（2026-10-17 查阅）：Search 为 `POST https://api.deepseek.com/v1/tools/search`，Bearer 鉴权；请求 `query`、`count`（1–50，默认 10）、`need_content` 等；响应 `results[]` 含 `title/url/snippet/summary/content/site_name/date/authority/rerank_score`。
- 已实测（2026-10-17，用户本机 key）：Search 返回 HTTP 200 与结构化结果；Fetch 返回 HTTP 200、`title` 与 Markdown `content`。
- 已确认变更（2026-10-17，用户回复「两个 api 全部切换, 然后允许更新, go」）：`web_search` 与 `web_fetch` 全部切换到 DeepSeek 官方 Search/Fetch API；允许更新本机配置文件。
- 已确认变更（2026-10-17，用户补充）：以官方指南为重构依据，暴露的工具契约需包含对应的请求体、搜索语法与响应结构；`web_search` 参数覆盖 `query`、`count`、`ori_question`、`localization`、`need_content`，结果保留官方响应字段。
- 沿用 ADR-0002 的配置文件与凭据边界：密钥只落用户家目录，仓库只保留 `.example`。

## 迷雾

无。Q1（`web_fetch` 是否切换官方 Fetch API）与 Q2（是否更新本机配置）已于 2026-10-17 dev gate 确认：全部切换并允许更新。

## 上下文

- [spec](spec.md)
- [pi 业务域 CONTEXT](../../../CONTEXT.md)、[QUESTIONS](../../../QUESTIONS.md)
- [ADR-0002](../../../adr/0002-搜索密钥落用户配置与直连抓取.md)
- [上一 Plan：pi-deepseek-web 插件](../../reference/2026-09-18-pi-deepseek-web插件/spec.md)
- 官方指南：https://api-docs.deepseek.com/zh-cn/guides/search
- 代码：`packages/pi-deepseek-web/src/{config,search,format,index}.ts`
