# Notes Index

<!-- 由 nano_flow_check 生成，请勿手改 -->

| Name | Description | Related Note |
| --- | --- | --- |
| [001-会话管理工具实现与单元测试](001-会话管理工具实现与单元测试.md) | 用户可在会话中通过 9 个模型工具完成 session/model CRUD：`session_list` / `session_read` / `session_spawn` / `session_prompt` / `session_model_list` / `session_mo | — |
| [002-挂载上游内容搜索并启用索引](002-挂载上游内容搜索并启用索引.md) | 会话内容搜索经上游 `@deepseek-ai/dsh-tool-session-query@0.1.2-alpha.2` 可用：插件 patch 挂载其 5 个只读工具，并把 `session-query-sqlite` 行覆盖为 `openAt: first-search` + 持久 | 001-会话管理工具实现与单元测试 |
| [003-安装到web-profile并端到端冒烟](003-安装到web-profile并端到端冒烟.md) | `@kxh4892636/dsh-session-manager` 安装到本机 web profile 并经重启生效：会话中可见全部工具（自有 9 个 + 上游 5 个），完成一次端到端真实冒烟（创建→选模型→发消息→读取→搜索→归档），清理测试会话。 | 001-会话管理工具实现与单元测试, 002-挂载上游内容搜索并启用索引 |
