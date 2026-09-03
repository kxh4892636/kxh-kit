---
status: completed
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

- [x] package artifact 只含 extension、类型/文档与无 secret example，Pi 能加载并看到恰好 `web_search`/`web_fetch`；全部 deterministic gates 通过，真实 search 返回至少一个 HTTPS 结构化来源，真实 fetch 返回安全文本/Markdown，且仓库、tarball、命令输出和测试证据均不含 credential。

## 上下文

- [spec](spec.md)
- [Pi packages 参考](../../../../../.temp/pi/packages/coding-agent/docs/packages.md)
- [DeepSeek Anthropic API](https://api-docs.deepseek.com/guides/anthropic_api/)

## 下一步

/code-delivery

## 阻塞记录

仅 status 为 blocked 时保留。

## 交付记录

- 交付物：完成 README、LICENSE、无密钥示例、精确 package files、显式 live smoke 与全局私有配置；Pi extension 恰好注册 `web_search`/`web_fetch`。
- 验证证据：package check/build、95 个 deterministic tests 与 coverage（90.73% statements / 83.69% branches / 87.09% functions / 92% lines）通过；16-entry 实际 tarball 不含 test/live/实际配置，tracked 与 artifact credential scan 均为 0；DeepSeek 结构化 HTTPS search 与 pinned 公共 HTTPS fetch live 均通过；Standards 复审 PASS，Spec 复审除下述已接受流程偏差外 PASS。
- 流程偏差：首次 fetch 目标解析为本机代理的 reserved fake-IP，在发出请求前按策略阻断；修正为公共 IP 目标后 fetch 通过。随后旧 coverage 命令意外收集 live 文件，造成 search 与成功 fetch 实际各执行 2 次。现已将 `test:coverage` 限定为 `src`，复验只运行 95 个 deterministic tests，且不再执行 live。
- Workspace 基线：root `pnpm ready` 在全局 check 阶段被 1,162 个与本 diff 无关的既有格式问题阻断；递归 tests 另有 nano-flow workspace materialization 与 nano-mem packaged-manifest 基线失败。package focused gates、领域检查与 diff check 均通过，未改写无关文件。
