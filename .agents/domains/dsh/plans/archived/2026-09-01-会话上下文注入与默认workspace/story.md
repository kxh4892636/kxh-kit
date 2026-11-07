# 会话上下文注入与默认workspace

> 由 spec 迁移生成（2026-11-07）；原 Plan 无独立 story。

## US-001 会话上下文注入与默认workspace

已交付的 `session_spawn` 语义与用户确认的行为不一致：① 未给 workspaceId/cwd 时新会话落在 Host 回退 cwd（仅碰巧与调用方目录一致），应默认与**调用方会话同一 workspace**；② 无上下文注入能力——创建时注入的上下文应作为**系统消息**注入（不触发模型调用），首调用由第一条用户消息驱动（ADR-0004）。
