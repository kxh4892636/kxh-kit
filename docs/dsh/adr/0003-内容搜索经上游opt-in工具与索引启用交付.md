# 内容搜索经上游 opt-in 工具与索引启用交付

会话内容搜索改用上游 opt-in 包 `@deepseek-ai/dsh-tool-session-query`（`0.1.2-alpha.2`，与当前 DSH 安装同版本）交付，并由本插件 patch 将 `session-query-sqlite` 的 `openAt` 由 `never` 改为 `first-search` 并配持久化 path，启用部署级内容搜索索引。上游包已实现工作区授权、无游标结果与限流；自研扫描式搜索会重复实现且成本随会话量上升，故不做。

## Considered Options

- **上游 opt-in 工具 + 启用索引（选定）**：五个只读工具（`session_search` 等）直接可用；索引在首次搜索时构建（`first-search`），避免启动成本；用户已接受启用后 Web 内容搜索框随之可用的部署级行为变更。
- **插件自研扫描式搜索**：遍历 `session_list` + `session_read` 文本匹配；与现有 `session_read` 能力重复，成本随会话量与内容量线性上升。
- **不提供内容搜索**：仅依赖标题/关键词的列表过滤；不满足"读取其他 session 内容"的定位诉求。

## Consequences

- 部署级行为变更：Web GUI 内容搜索框（宿主功能）随索引启用而可用。
- 版本锁定：上游包版本与 DSH 安装版本一致（`0.1.2-alpha.2`），升版需显式决策。
- 上游包默认不挂载（opt-in）；本决策以插件 patch 挂载，属刻意偏离上游默认，故记录。
