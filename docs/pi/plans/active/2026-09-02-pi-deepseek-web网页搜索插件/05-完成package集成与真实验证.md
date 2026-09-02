---
status: pending
blocked_by: ["02", "04"]
---

# 完成 package 集成与真实验证

## 交付

用户获得可构建、可打包、可由 Pi 加载的 `pi-deepseek-web`，用户全局私有配置已就位，两个工具分别通过一次真实 DeepSeek search 与一次公开 HTTPS fetch 验证。

## 范围

整合 extension 同时注册两个工具；完成 README、example、package files/peer/runtime dependencies、lockfile 与显式 live scripts。运行 package focused tests/check/build/pack、相关 workspace gate、diff/secret/artifact 检查；在不输出 credential 的前提下创建或安全维护 `getAgentDir()/pi-deepseek-web.json`，执行一次无重试的单查询 DeepSeek live search 和一次公开 HTTPS live fetch。外部账号、余额、限流、网络或 DeepSeek 5xx 按 spec 分类为带解除条件的 blocker，不反复调用。

## 直接依赖

- 02：需要完成的 `web_search`；消费其 tool definition、search client、mapper 与 deterministic evidence。
- 04：需要完成的 `web_fetch`；消费其 tool definition、安全 transport、内容转换与 deterministic evidence。

## 验收

- [ ] package artifact 只含 extension、类型/文档与无 secret example，Pi 能加载并看到恰好 `web_search`/`web_fetch`；全部 deterministic gates 通过，真实 search 返回至少一个 HTTPS 结构化来源，真实 fetch 返回安全文本/Markdown，且仓库、tarball、命令输出和测试证据均不含 credential。

## 上下文

- [spec](spec.md)
- [Pi packages 参考](../../../../../.temp/pi/packages/coding-agent/docs/packages.md)
- [DeepSeek Anthropic API](https://api-docs.deepseek.com/guides/anthropic_api/)

## 下一步

/code-delivery

## 阻塞记录

仅 status 为 blocked 时保留。

## 交付记录

仅 status 为 completed 时保留。
