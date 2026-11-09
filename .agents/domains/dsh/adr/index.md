# ADR

<!-- 由 nano_flow_check 生成，请勿手改 -->

| Name | Description | Status |
| --- | --- | --- |
| [001-嵌套skill任意深度发现](001-嵌套skill任意深度发现.md) | 在项目与用户 .agents 树中任意深度发现合法 SKILL.md，并保留来源优先级。 | accepted |
| [002-会话管理改由宿主路由与按钮](002-会话管理改由宿主路由与按钮.md) | 早期会话管理以模型工具交付；当前撤回改为宿主路由 + 会话工具栏按钮。 | superseded |
| [003-内容搜索不再由本插件补丁启用](003-内容搜索不再由本插件补丁启用.md) | 早期用上游 session-query 与 patch 启用内容搜索；当前 toolkit 不再打这个补丁。 | superseded |
| [004-会话初始化上下文以系统消息注入](004-会话初始化上下文以系统消息注入.md) | 会话启动上下文以系统提示词段注入，不伪装成用户消息触发模型调用。 | accepted |
| [005-fake-ip解析经代理声明修正](005-fake-ip解析经代理声明修正.md) | mihomo fake-IP 返回保留网段导致 web fetch 被拒时，用 harness home 代理声明修正。 | accepted |
| [006-note阻塞态以reason表达](006-note阻塞态以reason表达.md) | note 用 blocked + reason 表达等待，放弃 waiting/needs 与 DAG，按状态和 next_step 推进。 | accepted |
| [007-dream由宿主定时任务投递新会话](007-dream由宿主定时任务投递新会话.md) | dream 由宿主 Schedule 每日把 dream.md 投到新建的 nano-flow 会话，不内建定时器；游标让至少一次投递变幂等。 | accepted |
| [008-轮转绑定继承旧会话的Plan](008-轮转绑定继承旧会话的Plan.md) | 轮转后的自动绑定继承轮转前会话的 Plan，与工作区 active Plan 数量无关；无绑定或目录失效时跳过。 | superseded |
| [009-Plan绑定只经bind工具](009-Plan绑定只经bind工具.md) | 会话↔Plan 绑定只由 nano_flow_bind 写入；check、plan-log 与轮转都不自动绑定。 | accepted |
