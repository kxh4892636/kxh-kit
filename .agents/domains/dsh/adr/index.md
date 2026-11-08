# ADR

<!-- 由 nano_flow_check 生成，请勿手改 -->

| Name | Description | Status |
| --- | --- | --- |
| [001-嵌套skill任意深度发现](001-%E5%B5%8C%E5%A5%97skill%E4%BB%BB%E6%84%8F%E6%B7%B1%E5%BA%A6%E5%8F%91%E7%8E%B0.md) | 在项目与用户 .agents 树中任意深度发现合法 SKILL.md，并保留来源优先级。 | accepted |
| [002-会话管理改由宿主路由与按钮](002-%E4%BC%9A%E8%AF%9D%E7%AE%A1%E7%90%86%E6%94%B9%E7%94%B1%E5%AE%BF%E4%B8%BB%E8%B7%AF%E7%94%B1%E4%B8%8E%E6%8C%89%E9%92%AE.md) | 早期会话管理以模型工具交付；当前撤回改为宿主路由 + 会话工具栏按钮。 | superseded |
| [003-内容搜索不再由本插件补丁启用](003-%E5%86%85%E5%AE%B9%E6%90%9C%E7%B4%A2%E4%B8%8D%E5%86%8D%E7%94%B1%E6%9C%AC%E6%8F%92%E4%BB%B6%E8%A1%A5%E4%B8%81%E5%90%AF%E7%94%A8.md) | 早期用上游 session-query 与 patch 启用内容搜索；当前 toolkit 不再打这个补丁。 | superseded |
| [004-会话初始化上下文以系统消息注入](004-%E4%BC%9A%E8%AF%9D%E5%88%9D%E5%A7%8B%E5%8C%96%E4%B8%8A%E4%B8%8B%E6%96%87%E4%BB%A5%E7%B3%BB%E7%BB%9F%E6%B6%88%E6%81%AF%E6%B3%A8%E5%85%A5.md) | 会话启动上下文以系统提示词段注入，不伪装成用户消息触发模型调用。 | accepted |
| [005-fake-ip解析经代理声明修正](005-fake-ip%E8%A7%A3%E6%9E%90%E7%BB%8F%E4%BB%A3%E7%90%86%E5%A3%B0%E6%98%8E%E4%BF%AE%E6%AD%A3.md) | mihomo fake-IP 返回保留网段导致 web fetch 被拒时，用 harness home 代理声明修正。 | accepted |
| [006-note阻塞态以reason表达](006-note%E9%98%BB%E5%A1%9E%E6%80%81%E4%BB%A5reason%E8%A1%A8%E8%BE%BE.md) | note 用 blocked + reason 表达等待，放弃 waiting/needs 与 DAG，按状态和 next_step 推进。 | accepted |
