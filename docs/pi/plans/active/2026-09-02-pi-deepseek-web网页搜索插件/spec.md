---
status: in_progress
---

# Pi DeepSeek Web 网页搜索插件

## 问题

Pi 需要一个名为 `pi-deepseek-web` 的可安装 package，通过 DeepSeek 原生网页搜索发现当前信息，并匿名抓取搜索结果指向的公共页面。交付必须复用 DeepSeek Harness 已验证的结构化搜索与有界抓取语义，使用用户全局配置，确保搜索凭据不会进入抓取请求、仓库、日志、错误或模型结果。

## 方案

在 `packages/pi-deepseek-web` 创建 `@kxh4892636/pi-deepseek-web`，由一个 Pi extension 注册 `web_search` 与 `web_fetch`。extension 每次工具调用从 Pi `getAgentDir()/pi-deepseek-web.json` 读取一次 strict `{ search, fetch }` 配置并形成不可变 snapshot；search 通过 DeepSeek Anthropic-compatible Messages API 的 server-side `web_search` 工具返回结构化来源，fetch 通过固定到已验证公共地址的匿名 HTTP(S) transport 返回有界文本，并将安全过滤后的 HTML 转为 GFM Markdown。

## 已排除的备选

- 只提供 `web_search`：模型无法读取来源页面；用户明确要求同时提供 `web_fetch`。
- 把 search 与 fetch 拆成两个 package：增加安装、配置与版本配对成本。
- 使用项目级或 package-local 配置：用户选择跨项目共享的全局插件配置，package-local secret 还会受安装更新影响。
- 从 provider prose 抓取链接：没有稳定 schema，可能混入指令或不可验证 URL。
- 校验 URL 后交给普通 fetch：连接时重新解析会留下 DNS rebinding 窗口。
- 允许内网、localhost 或跨源重定向：会把模型工具变成内网探测或隐式数据发送通道。
- 使用无头浏览器：超出文本抓取目标并扩大执行与内容攻击面。
- 在普通 CI 强制 live tests：引入 credential、付费、余额、限流与网络不确定性。

## 实施决策

### Package 与模块

`package.json` 使用 `pi-package` keyword，并通过 `pi.extensions` 指向 TypeScript extension entry。Pi 提供的 `@earendil-works/pi-coding-agent` 与 `typebox` 以 `"*"` peer dependency 声明，开发时固定 Pi `0.84.4` 与 TypeBox `1.3.7`；网络与转换依赖固定为 `undici@8.10.0`、`ipaddr.js@2.5.0`、`turndown@7.2.4`、`@joplin/turndown-plugin-gfm@1.0.67`。

模块按变化原因分离：全局配置读取与校验；DeepSeek request/response；搜索批处理与格式化；抓取 URL policy；DNS/IP 与 pinned connector；有界 HTTP transport；HTML→Markdown；Pi extension 注册。extension entry 只组合模块和注册工具，不承载 provider 细节。

### 全局插件配置

配置根只接受下列 schema，拒绝未知字段、JSON comments、插值与递归引用：

```json
{
  "search": {
    "apiKey": "optional literal secret",
    "apiKeyEnv": "DEEPSEEK_API_KEY",
    "baseURL": "https://api.deepseek.com/anthropic",
    "model": "deepseek-v4-flash",
    "apiVersion": "2023-06-01",
    "maxTokens": 4096,
    "maxUses": 5,
    "timeoutMs": 30000,
    "maxResults": 8
  },
  "fetch": {
    "timeoutMs": 30000,
    "maxResponseBytes": 5000000,
    "maxBodyChars": 100000,
    "maxOutputChars": 200000,
    "maxRedirects": 5
  }
}
```

`search` 必须存在，`fetch` 可省略并使用默认值。literal `apiKey` 存在时必须为无首尾空白的非空字符串并胜过 `apiKeyEnv`；否则读取 `apiKeyEnv` 指定的环境变量。数值上限必须是合法范围内的有限整数。错误只报告配置路径、字段名或稳定分类，不回显值、原始 JSON、credential 或 headers。

### `web_search`

工具参数为必填 `queries: string[]`，原始数组接受 1–4 个非空字符串并在数量校验后折叠精确重复项。每个不同查询并发发送一个 `POST <baseURL>/v1/messages`：endpoint 只允许无 userinfo/query/hash、且尚未包含 `/v1` 的 HTTPS service root；请求固定 `redirect: "error"`，只发送 `x-api-key`，body 使用配置 model/maxTokens 与 `{ type: "web_search_20250305", name: "web_search", max_uses: maxUses }`。

响应只消费 `web_search_tool_result` 中的 `web_search_result`；citation `cited_text` 按 URL 关联为 snippet，provider prose 丢弃。缺少 native result block、畸形响应、非 2xx 或网络失败均抛出稳定且无 secret 的错误。批次任一查询失败会取消 siblings、等待全部 settle 并整体失败；全部成功后按 URL 去重、按查询内排名 round-robin 合并到 `maxResults`。

### `web_fetch`

工具参数为必填非空 `url`，最大 2,048 字符，只接受无内嵌凭据的 `http:`/`https:`。解析得到的每个 IPv4/IPv6 地址都必须是公共单播地址；活动 DNS64 前缀映射出的非公共 IPv4 同样拒绝。连接使用 `undici` 固定到本次已验证地址集合；每个同源重定向重新解析并固定，跨源重定向失败。

transport 不发送搜索 credential，按 byte、decoded char、timeout 与 redirect 上限读取。只接受 HTML/XHTML、`text/*`、JSON/XML 家族；缺失或二进制 Content-Type 失败，charset 取自 header，缺失时 UTF-8，不支持的 charset 失败。非 2xx 是带最终 URL 与 status 的结果。HTML 删除活动和隐藏内容后经 Turndown + GFM 转为 Markdown；转换异常产生固定省略文本，不回退原始 HTML。

### 模型结果与取消

成功结果固定声明外部 Web 内容是不可信数据而非指令，并以引用相关 URL 的指引结束。最终模型可见文本不得超过 Pi 的 50KB/2,000 行上限；截断保留安全提示、截断说明与引用指引，未截断正文不写临时文件或 `details`。

caller abort、配置 timeout 与多查询 sibling cancellation 使用组合 signal，但保留稳定分类。所有错误通过 throw 形成 Pi error tool result；raw config、credential、request headers、远端 error body、raw response 与未截断正文不进入日志、UI、progress、result 或 `details`。

## 工作环境

- 工作区：Windows PowerShell，Node `v24.19.0`，pnpm `11.22.0`，Vite+ workspace。
- Pi 参考：`.temp/pi`，`@earendil-works/pi-coding-agent` `0.84.4`；该目录只读且被 git ignore。
- DeepSeek Harness 参考：`.temp/deepseek-harness/packages/web/`；该目录只读且被 git ignore。
- DeepSeek API：官方 Anthropic service root `https://api.deepseek.com/anthropic`；一次 search live smoke 会产生一次付费模型搜索调用。
- 全局实际配置默认路径：`C:\Users\kxh\.pi\agent\pi-deepseek-web.json`；它位于仓库外，不进入 git 或 npm tarball。
- 普通 `test`/CI 只运行 deterministic tests；显式 live scripts 不自动 retry。

## 范围

- 创建可安装 Pi package、README、无 secret 示例配置与 package manifest。
- 注册并完整实现 `web_search`、`web_fetch`。
- 实现全局配置、DeepSeek native search、公共地址 pinned fetch、安全内容转换与模型输出上限。
- 覆盖 deterministic unit/integration tests、package check/build/pack 和 secret containment。
- 创建用户全局实际配置，并分别执行一次单查询 DeepSeek search 与一次公开 HTTPS fetch live smoke。

## 非范围

- DeepSeek 对话模型 provider、Web 浏览器、JavaScript 页面执行、正文抽取或 PDF/二进制解码。
- 内网/localhost 抓取、跨源重定向自动跟随、Bearer-only proxy、自定义 headers/auth mode。
- provider prose fallback、部分成功的多查询结果、模型可配的工具名/schema/maxQueries。
- 把真实 credential 写入仓库、测试、snapshot、日志、错误或 package artifact。
- 把 live tests 加入普通测试或 CI。

## 待定

无。实现中发现的新领域 trade-off 必须重新进入 `/quest-with-domain`；一般工程事实更新本 spec，新增交付责任创建新 issue。

## 上下文

- [Pi 领域语言](../../../CONTEXT.md)
- [搜索与抓取由单一 Pi package 交付](../../../adr/0001-搜索与抓取由单一pi-package交付.md)
- [插件采用全局分区配置](../../../adr/0002-插件采用全局分区配置.md)
- [网页抓取仅访问固定连接的公共地址](../../../adr/0003-网页抓取仅访问固定连接的公共地址.md)
- [设计审阅记录](../../../../../.flow/quest/2026-09-03-pi-deepseek-web网页搜索插件.md)
- [Pi extensions 参考](../../../../../.temp/pi/packages/coding-agent/docs/extensions.md)
- [Pi packages 参考](../../../../../.temp/pi/packages/coding-agent/docs/packages.md)
- [DeepSeek search 参考](../../../../../.temp/deepseek-harness/packages/web/web-search-deepseek/README.zh.md)
- [DeepSeek fetch 参考](../../../../../.temp/deepseek-harness/packages/web/web-fetch-http/README.zh.md)
- [DeepSeek Anthropic API](https://api-docs.deepseek.com/guides/anthropic_api/)

## Issue

| #   | Issue                                                                | 状态      | 阻塞于 | 下一步         |
| --- | -------------------------------------------------------------------- | --------- | ------ | -------------- |
| 01  | [建立 Pi package 与全局配置契约](01-建立pi-package与全局配置契约.md) | completed | —      | /code-delivery |
| 02  | [交付 DeepSeek 原生网页搜索](02-交付deepseek原生网页搜索.md)         | completed | 01     | /code-delivery |
| 03  | [建立公共网页抓取安全传输](03-建立公共网页抓取安全传输.md)           | completed | 01     | /code-delivery |
| 04  | [交付网页抓取模型工具](04-交付网页抓取模型工具.md)                   | completed | 01, 03 | /code-delivery |
| 05  | [完成 package 集成与真实验证](05-完成package集成与真实验证.md)       | pending   | 02, 04 | /code-delivery |
