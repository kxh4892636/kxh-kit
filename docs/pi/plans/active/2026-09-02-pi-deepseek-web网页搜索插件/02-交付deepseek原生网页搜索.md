---
status: pending
blocked_by: ["01"]
---

# 交付 DeepSeek 原生网页搜索

## 交付

Pi 模型可以调用 `web_search`，以 1–4 个查询通过 DeepSeek 原生网页搜索取得有引用价值的结构化来源，并在任一查询失败时得到明确的整体失败。

## 范围

实现 DeepSeek Messages request、HTTPS endpoint 与 credential containment、strict native block mapper、citation join、并发查询、sibling cancellation、URL 去重、round-robin merge、模型输出与 50KB/2,000 行上限；在 extension 中注册 `web_search`。覆盖 mocked HTTP、abort/timeout、secret redaction 和 Pi fake `ExtensionAPI` round trip。暂不运行真实 API smoke。

## 直接依赖

- 01：需要已确定的 package entry、全局 search 配置与测试 seam；消费其 resolved search snapshot 和 extension 组合入口。

## 验收

- [ ] fake Pi tool call 能从 mocked DeepSeek native blocks 生成去重、轮询合并、含外部不可信提示与引用指引的来源结果；prose-only、HTTP、timeout、abort 与任一 sibling 失败路径均 fail closed 且不泄漏 sentinel secret。

## 上下文

- [spec](spec.md)
- [单 package ADR](../../../adr/0001-搜索与抓取由单一pi-package交付.md)
- [DeepSeek search 参考](../../../../../.temp/deepseek-harness/packages/web/web-search-deepseek/README.zh.md)
- [DeepSeek tool 参考](../../../../../.temp/deepseek-harness/packages/web/tool-web/README.zh.md)

## 下一步

/code-delivery

## 阻塞记录

仅 status 为 blocked 时保留。

## 交付记录

仅 status 为 completed 时保留。
