# Notes Index

<!-- 由 nano_flow_check 生成，请勿手改 -->

| Name | Description | Related Note |
| --- | --- | --- |
| [001-spawn重构抽seam](001-spawn%E9%87%8D%E6%9E%84%E6%8A%BDseam.md) | `host.ts` 的 spawn 拆出 workspace 解析（`resolveSpawnLocation`）与上下文注入 seam，行为完全不变（既有 40 项测试守护）；为 02/03 并行实现铺路。 | — |
| [002-spawn默认workspace](002-spawn%E9%BB%98%E8%AE%A4workspace.md) | `session_spawn` 未给 workspaceId/cwd 时，新会话默认落在调用方会话同一 workspace（而非 Host 回退 cwd）。 | 001-spawn重构抽seam |
| [003-会话上下文系统消息注入](003-%E4%BC%9A%E8%AF%9D%E4%B8%8A%E4%B8%8B%E6%96%87%E7%B3%BB%E7%BB%9F%E6%B6%88%E6%81%AF%E6%B3%A8%E5%85%A5.md) | `session_spawn` 增加 `context` 参数：以其系统消息形式注入新会话（`agent.ctx.systemPrompt.section` 会话作用域注册），不触发模型调用；首次模型调用由第一条用户消息驱动（ADR-0004）。 | 001-spawn重构抽seam |
| [004-安装并端到端冒烟](004-%E5%AE%89%E8%A3%85%E5%B9%B6%E7%AB%AF%E5%88%B0%E7%AB%AF%E5%86%92%E7%83%9F.md) | 改动后的插件安装到 web profile 并重启生效；冒烟验证两项行为：①未给 workspace 时新会话与调用方同 workspace；②`context` 作为系统消息注入、创建不触发调用、首调用由用户消息驱动后（`session_read` 可读到注入上下文与回复）。 | 002-spawn默认workspace, 003-会话上下文系统消息注入 |
