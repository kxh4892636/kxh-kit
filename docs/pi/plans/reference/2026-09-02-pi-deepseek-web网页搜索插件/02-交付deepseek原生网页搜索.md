---
status: completed
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

- [x] fake Pi tool call 能从 mocked DeepSeek native blocks 生成去重、轮询合并、含外部不可信提示与引用指引的来源结果；prose-only、HTTP、timeout、abort 与任一 sibling 失败路径均 fail closed 且不泄漏 sentinel secret。

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

- 交付物：DeepSeek Anthropic Messages adapter、strict native block/citation mapper、批量 all-or-nothing 搜索、URL 去重 round-robin 合并、有界模型输出与 Pi `web_search` 注册。
- 验证证据：`pnpm --filter @kxh4892636/pi-deepseek-web check`、35 个 tests、覆盖率 S93.44/B86.14/F90.9/L94.28、build 与 `git diff --check` 通过；覆盖 HTTP、timeout、abort、sibling cancellation、5MB 流式上限和 sentinel secret containment。
- 审查：Standards 与 Spec 双轴复审均通过。
