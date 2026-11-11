# Questions

<!-- 由 nano_flow_check 生成，请勿手改 -->

| Name | Description |
| --- | --- |
| [001-音频e2e怎么测到期与播完](001-音频e2e怎么测到期与播完.md) | 音频事件与墙钟必须各自可控：用 addInitScript 覆写 Date.now 推墙钟，用 currentTime 推到曲末触发 ended，不要用 page.clock。 |
| [002-单测里zustand持久化断言不生效](002-单测里zustand持久化断言不生效.md) | node 测试环境没有 window，zustand persist 直接跳过存储；只 stub localStorage 不够，window.localStorage 也要 stub。 |
