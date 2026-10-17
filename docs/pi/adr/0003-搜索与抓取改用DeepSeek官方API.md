# 搜索与抓取改用 DeepSeek 官方 API

`pi-deepseek-web` 原先把搜索实现为 Anthropic 兼容 Messages 加 `web_search_20250305` 服务端工具，把抓取实现为直连 HTTP 加 turndown。DeepSeek 已上线官方 Search/Fetch 原始 JSON API：Search 直接返回结构化结果，Fetch 返回标题与 Markdown 正文。用户明确要求两个 API 全部切换。此决策替代 [ADR-0002](0002-搜索密钥落用户配置与直连抓取.md) 中关于搜索传输与直连抓取的部分，保留其配置文件与凭据边界。

## Decision

- **`web_search`** 调用 `POST {baseURL}/v1/tools/search`，请求体覆盖 `query`、`count`、`ori_question`、`localization`、`need_content`（`count` 1–50，默认 `searchCount = 10`；未提供其余字段时交给官方默认值），Bearer 鉴权；响应 `results[]` 保留官方全部字段（`rerank_score`、`title`、`url`、`snippet`、`summary`、`content`、`site_name`、`site_icon`、`date`、`authority`），按 URL 去重。`details` 暴露 `{ count, results }`，文本投影展示摘要/片段、评分、权威性、站点、日期与可选正文。
- **`web_fetch`** 调用 `POST {baseURL}/v1/tools/fetch`，请求 `{ url }`，Bearer 鉴权；返回 `{ title, content }`，正文按 `fetchMaxContentChars = 100000` 截断；`details` 暴露 `{ url, title?, content, truncated }`。
- **配置**：`baseURL` 默认 `https://api.deepseek.com`，可带 `/v1`；新增 `searchCount`、`fetchMaxContentChars`、`timeoutMs = 30000`；移除 `model`、`apiVersion`、`maxTokens`、`maxUses`、`fetchMaxResponseBytes`、`fetchMaxBodyChars`、`fetchTimeoutMs` 的消费。旧 Anthropic 端点直接报错，不静默改写用户文件。
- **共享传输**：新增 `src/http.ts`，统一 `POST` JSON、Bearer、超时/取消、官方错误解析与端点拼接。
- **依赖**：删除 `turndown`、`@joplin/turndown-plugin-gfm`、`@types/turndown` 与 `src/turndown-plugin-gfm.d.ts`；包版本升至 `0.2.0`。

## Considered Options

- **继续 Anthropic Messages + `web_search_20250305`**：每次搜索多一次模型轮次，依赖模型触发工具，来源需从 citations 二次拼装；官方 Search 已直接给结构化结果。
- **保留直连 `web_fetch`**：可保留原始文本与 HTTP 状态、零费用；但官方 Fetch 已提供 Markdown 正文，保留会继续维护 content-type 分类、流式字节限额、turndown 与两个运行时依赖。用户已确认全部切换。
- **官方 Fetch 失败时回退直连**：两套 transport、两套限额与两套错误面；复杂度与测试成本翻倍，错误可由模型重试或换 URL。
- **搜索请求 `need_content: true`**：10 条结果正文可能远大于摘要，放大上下文；详情交给 `web_fetch`。
- **暴露 `ori_question` / `localization`**：工具输入只有搜索词，没有可靠的原始问题或本地 IP；强行填 `query` 无增益。
- **自动重试 429/5xx**：隐藏延迟，并与 pi 的取消语义叠加；错误带上状态与官方 message，由模型决定。
- **新增 `searchBaseURL`**：多一个近义配置项，旧 `baseURL` 会静默 404；改为识别旧端点并报错。

## Consequences

- 搜索不再产生模型轮次，结果字段稳定，可直接按 `count` 控制条数；抓取由服务端提取 Markdown，插件不再维护 HTML 转换。
- 两个工具都需要 API key；`web_fetch` 的 `details` 包含官方 `content`，不再有 `statusCode`/`contentType`。
- 搜索工具契约直接覆盖官方请求体、搜索语法与响应字段，模型可选择 `need_content` 获取正文；`localization` 与 `ori_question` 通常省略。
- 官方 Fetch 只保证网页正文：原始 Markdown/文本文件可能 404，API 端点会返回转义文本。需要原始内容时本插件不再提供 fallback。
- Search/Fetch 各 5 QPS、按成功请求计费；错误码 402/403/404/408/429/5xx 的含义与重试建议写入 README 与错误消息。
- 旧配置需要迁移 `baseURL` 并删除失效字段；未知字段被忽略，缺 `apiKey` 时仍给出配置路径与 `apiKeyEnv`。
- 依赖减少为 0 个运行时依赖；包体与测试面缩小到配置、HTTP、两个客户端与文本投影。
