# Notes Index

<!-- 由 nano_flow_check 生成，请勿手改 -->

| Name | Description | Related Note |
| --- | --- | --- |
| [001-插件脚手架与站点接入](001-插件脚手架与站点接入.md) | 建 packages/docusaurus-plugin-mindmap 骨架，扫描 mindmaps 目录并按路径注册整页路由（侧栏 + 占位图），接入 wiki 站点与 link 插件跑通 build。 | — |
| [002-markdown解析与图模型](002-markdown解析与图模型.md) | 把导图 markdown 解析成标题树、节点 id、概述与引用，覆盖 CRLF、中文标题、行内代码公式等真实边界。 | — |
| [003-校验与构建门禁](003-校验与构建门禁.md) | 把 doc:<id> 解析成站点 permalink，校验节点 id 唯一与引用目标存在，build 抛错、dev 告警。 | — |
| [004-导图UIUX设计](004-导图UIUX设计.md) | 把导图页定为 Cobalt 技术风 app screen：自绘 SVG 地图、石墨浮窗、缩放平移与深链，产出可照着实现的 HTML 原型与 token。 | — |
| [005-导图渲染与交互](005-导图渲染与交互.md) | 自绘 SVG 树布局与缩放平移，节点浮窗展示概述与引用，引用可外跳或跳节点。 | — |
| [006-样例导图与真机验收](006-样例导图与真机验收.md) | 用 wiki 真实内容写一篇导图，本地 build+serve 走查全部交互并收口领域词表。 | — |
