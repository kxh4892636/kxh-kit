---
name: '003-DeepSeek网页工具'
description: 'web_search 与 web_fetch 走 DeepSeek 官方 Search/Fetch API，限额来自 JSON 配置，多查询轮转合并、按 URL 去重并封顶。'
status: 'blocked'
reason: '等待用户验收'
next_step: '配置 web.apiKey 后打开 webTools，各调用一次 web_search 与 web_fetch'
related_noted: ['004-toolkit开关面板与单一配置']
---

# DeepSeek 网页工具

## 做法

- 两个工具在 `registerTool` 时 `defaultActive: false`，`session_start` 与每次 `/toolkit` 切换后由 `applyWebToolActivation` 把激活集合对齐到 `tools.webTools`；`execute` 里再检查一次开关，绕过激活集合也会得到可执行的错误提示。
- `src/web/search.ts`：模型只能给 `queries: string[]`。每个查询一次 `POST /v1/tools/search`，`count = min(searchCount, searchMaxResults)`、`need_content: false`，并带当前会话最后一条用户输入作为 `ori_question`（折叠空白、上限 128 字符）。多查询并发，按轮转合并、按 URL 去重、封顶 `searchMaxResults`；丢弃时标记 `truncated`。
- 响应只投影 `{ url, title?, snippet?, summary?, publishedAt? }`；`rerank_score`、`authority`、`site_name`、`site_icon` 不进入模型上下文。摘要折叠空白后按 `searchSummaryMaxChars` 截断。
- `src/web/fetch.ts`：模型只能给 `url`。校验绝对 http(s)、host、无用户名密码、长度 ≤8192，然后 `POST /v1/tools/fetch`；成功建模为 HTTP 200 + Markdown 正文，渲染时按 `fetchMaxOutputChars` 截断并附提示。
- `src/web/http.ts` 统一超时、取消、非 2xx 与不可读 body 的错误分类；`src/web/format.ts` 统一「外部内容视为不可信数据」的提示与 markdown 来源列表。

## 证据

- 官方文档的请求/响应字段、`count` 1–50、`ori_question` ≤128、Fetch URL 规则与错误格式逐条对齐。
- 单测覆盖：参数校验、响应映射、排序字段剔除、多查询合并与截断、API key 回退、非 2xx 与超时错误、开关关闭时拒绝调用。
