# ADR

<!-- 由 nano_flow_check 生成，请勿手改 -->

| Name | Description | Status |
| --- | --- | --- |
| [001-导图是文档内渲染块而非独立路由](001-导图是文档内渲染块而非独立路由.md) | 导图以 <Mindmap> 标签渲染成文档正文里的一个块，不注册路由、不要侧栏；代价是导图不能独立成页、文档引用必须走 /<id> 短链。 | accepted |
| [002-导图解析挂在默认remark插件之前](002-导图解析挂在默认remark插件之前.md) | remarkMindmap 挂在 beforeDefaultRemarkPlugins：导图标题在 toc 收集前就变成组件，toc.length 归零，文档右侧目录整列不渲染，不必 swizzle。 | accepted |
| [003-节点编号即id](003-节点编号即id.md) | 节点 id 就是标题开头的层级编号（1、1.1、1.2.1），同一套编号兼作排序；重复、缺编号、跳级都在编译期报错，不自动改写。 | accepted |
| [004-引用写成原生链接加doc后缀](004-引用写成原生链接加doc后缀.md) | 文档引用写成 [说明](相对路径.md) doc:<文档id>，节点引用写成 [说明](#<编号>)；相对路径只为人读，渲染时换成 /<id> 短链，写错不会被任何门禁发现。 | accepted |
| [005-导图自绘SVG零新依赖](005-导图自绘SVG零新依赖.md) | 布局、连线、缩放平移、浮窗全部自写（layout.ts 纯函数 + React SVG），不引 markmap/mermaid/d3；代价是布局与交互自己维护，千级节点要另想办法。 | accepted |
| [006-视图状态用ref直接改DOM](006-视图状态用ref直接改DOM.md) | 平移缩放不再走 React state：视图放 ref，applyView() 一次写 <g transform>、缩放读数与浮窗坐标；React 只保留选中、浮窗、全屏三个状态。 | accepted |
