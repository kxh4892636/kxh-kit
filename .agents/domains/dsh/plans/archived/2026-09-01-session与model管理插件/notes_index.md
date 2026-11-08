# Notes Index

<!-- 由 nano_flow_check 生成，请勿手改 -->

| Name | Description | Related Note |
| --- | --- | --- |
| [001-会话管理工具实现与单元测试](001-%E4%BC%9A%E8%AF%9D%E7%AE%A1%E7%90%86%E5%B7%A5%E5%85%B7%E5%AE%9E%E7%8E%B0%E4%B8%8E%E5%8D%95%E5%85%83%E6%B5%8B%E8%AF%95.md) | 用户可在会话中通过 9 个模型工具完成 session/model CRUD：`session_list` / `session_read` / `session_spawn` / `session_prompt` / `session_model_list` / `session_mo | — |
| [002-挂载上游内容搜索并启用索引](002-%E6%8C%82%E8%BD%BD%E4%B8%8A%E6%B8%B8%E5%86%85%E5%AE%B9%E6%90%9C%E7%B4%A2%E5%B9%B6%E5%90%AF%E7%94%A8%E7%B4%A2%E5%BC%95.md) | 会话内容搜索经上游 `@deepseek-ai/dsh-tool-session-query@0.1.2-alpha.2` 可用：插件 patch 挂载其 5 个只读工具，并把 `session-query-sqlite` 行覆盖为 `openAt: first-search` + 持久 | 001-会话管理工具实现与单元测试 |
| [003-安装到web-profile并端到端冒烟](003-%E5%AE%89%E8%A3%85%E5%88%B0web-profile%E5%B9%B6%E7%AB%AF%E5%88%B0%E7%AB%AF%E5%86%92%E7%83%9F.md) | `@kxh4892636/dsh-session-manager` 安装到本机 web profile 并经重启生效：会话中可见全部工具（自有 9 个 + 上游 5 个），完成一次端到端真实冒烟（创建→选模型→发消息→读取→搜索→归档），清理测试会话。 | 001-会话管理工具实现与单元测试, 002-挂载上游内容搜索并启用索引 |
