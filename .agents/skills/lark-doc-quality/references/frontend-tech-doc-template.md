# 业务需求前端技术文档模板

当用户要求基于 PRD、Meego、设计稿、后端文档、代码仓库或零散需求创建/改写“前端技术文档”时，使用本模板。模板来源：飞书文档 `https://bytedance.larkoffice.com/docx/GhSHd63nKoOUJ2xKKdGcpc9pnnb`，并吸收 `fe-tech-doc` 的“生成技术文档”规则。生成文档时保留其富文本组织方式：标题自动编号、版本记录表、基本信息表、需求与依赖表、功能模块方案表、埋点表、监控表和发布 checklist。

## 命名规则

- 文档标题必须使用：`【yyyymm】-【业务需求名称】-【前端技术文档】`。
- `yyyymm` 使用需求启动或当前月份；业务需求名称使用 PRD/Meego 中的正式名称，避免缩写不明。
- 如果用户只给了需求简称，先用简称生成标题，正文 `基本信息` 中保留 PRD/Meego 链接帮助追溯。

## 固定章节

```xml
<title>【yyyymm】-【业务需求名称】-【前端技术文档】</title>
<h1 seq="auto" seq-level="auto">工程信息</h1>
<h2 seq="auto" seq-level="auto">版本记录</h2>
<table>
  <colgroup><col width="100"/><col width="272"/><col width="130"/><col width="271"/></colgroup>
  <thead><tr><th>版本</th><th>变更人</th><th>变更日期</th><th>变更内容</th></tr></thead>
  <tbody><tr><td>1.0</td><td>作者或 @人</td><td>yyyy.mm.dd</td><td>初版</td></tr></tbody>
</table>
<h2 seq="auto" seq-level="auto">基本信息</h2>
<table>
  <colgroup><col width="132"/><col width="483"/></colgroup>
  <tbody>
    <tr><td><b>Meego</b></td><td>需求链接</td></tr>
    <tr><td><b>PRD</b></td><td>产品文档链接</td></tr>
    <tr><td><b>UI</b></td><td>设计稿链接</td></tr>
    <tr><td><b>后端技术文档</b></td><td>后端方案或接口文档</td></tr>
    <tr><td>测试文档</td><td>测试用例或测试计划</td></tr>
    <tr><td><b>POC</b></td><td>PM：<br/>UI：<br/>RD：<br/>FE：<br/>QA：</td></tr>
    <tr><td><b>联调信息</b></td><td><ul><li>分支：</li><li>PPE：</li><li>Bits：</li></ul></td></tr>
  </tbody>
</table>
<h1 seq="auto" seq-level="auto">需求分析</h1>
<h2 seq="auto" seq-level="auto">需求背景</h2>
<h2 seq="auto" seq-level="auto">目标收益</h2>
<h2 seq="auto" seq-level="auto">需求列表</h2>
<h1 seq="auto" seq-level="auto">外部依赖</h1>
<h2 seq="auto" seq-level="auto">TCC 配置</h2>
<h2 seq="auto" seq-level="auto">网关配置</h2>
<h2 seq="auto" seq-level="auto">橙蕉配置</h2>
<h2 seq="auto" seq-level="auto">涉及到的 FCS/LanderX 配置</h2>
<h1 seq="auto" seq-level="auto">技术方案</h1>
<h2 seq="auto" seq-level="auto">影响范围</h2>
<h2 seq="auto" seq-level="auto">数据源</h2>
<h2 seq="auto" seq-level="auto">功能模块 A</h2>
<h3 seq="auto" seq-level="auto">技术方案</h3>
<h3 seq="auto" seq-level="auto">埋点逻辑</h3>
<h3 seq="auto" seq-level="auto">外部静态资源</h3>
<h1 seq="auto" seq-level="auto"><b>监控方案</b></h1>
<h1 seq="auto" seq-level="auto"><b>发布方案</b></h1>
<h1 seq="auto" seq-level="auto">Q &amp; A</h1>
```

## 章节写作规则

- `工程信息`：必须保留两个表格。`版本记录` 记录每次文档变更；`基本信息` 收敛 Meego、PRD、UI、后端技术文档、测试文档、POC 和联调信息。
- `需求分析`：不要照搬 PRD 大段原文。`需求背景` 用 1-3 段说明业务问题；`目标收益` 用“定性收益 / 定量收益”两行表格；`需求列表` 用“需求模块 / 需求描述 / 优先级 / 排期”表格。
- `外部依赖`：按配置类型分小节。每个配置小节都用“模块 / 功能点 / 配置地址”三列表格。没有该类依赖时保留小节并写“无”或“本期不涉及”，避免评审时遗漏。
- `技术方案`：先写 `影响范围` 和 `数据源`，再按功能模块拆分。功能模块要根据产品文档和代码仓库划分为相互独立、相互正交、可并行开发的模块；跨端需求使用 `功能模块名称-平台类型` 命名，例如 `营销卡片-PC`、`营销卡片-H5`、`营销卡片-App`。
- `影响范围`：沿用两列表格 `仓库/页面 / 影响范围`。仓库、页面、组件、接口封装、状态模块、路由、实验、权限等变更位置必须是真实存在或待确认的路径。
- `数据源`：列出新增、更新、删除的数据接口。每个数据接口单独成一个 `h3` 小节，说明接口类型、IDL/BAM/HTTP、字段结构、调用时机、错误码、代码变更位置。
- 每个 `功能模块` 固定包含三个 `h3` 小节：`技术方案`、`埋点逻辑`、`外部静态资源`。
- `功能模块 / 技术方案`：统一使用表格表达，默认四列为 `UI / 代码设计 / 交互逻辑 / 数据逻辑`。复杂模块也必须把补充说明写入对应表格单元格，必要时在单元格内使用段落或列表；不要在技术方案表格外再追加同级说明。
- `UI`：写设计稿链接、关键截图和组件布局。若有 Figma 链接，必须保留文案：`请根据 figma 设计稿 {{figma链接}}, 生成对应的前端组件`，方便后续调用 Figma MCP 生成组件。
- `组件布局`：根据产品文档图片、Figma 或用户描述，说明组件内部排版规则、层级结构、组件排列、样式边界和响应式差异。
- `代码设计`：写组织结构、组件拆分、属性设计、事件设计、状态管理、插槽/扩展点、边界/异常处理、性能优化和可复用点。
- `交互逻辑`：写用户操作、界面反馈、视图变化、事件处理、状态控制、组件间交互、加载态、空态、错误态。
- `数据逻辑`：写数据来源、请求时机、状态管理、字段映射、数据转换、缓存/持久化、业务规则、数据流转和异常兜底。
- `功能模块 / 埋点逻辑`：沿用三列表格 `事件 / 参数 / 触发逻辑`。事件名、参数、触发时机必须可验证。
- `功能模块 / 外部静态资源`：作为单独 `h3` 小节，列出图片、图标、字体、Lottie、远程资源等链接。若产品文档或 Figma 中无法获取，保留占位符并标注“需补充”。
- `监控方案`：沿用三列表格 `新增页面 / 技术指标监控 / 业务指标监控`，技术指标和业务指标可用 checkbox 表示是否已配置或待配置。
- `发布方案`：沿用分组 checklist，至少包含 `功能检查`、`数据检查`、`发布检查`。检查项使用 checkbox，便于上线前逐项确认。
- `Q &amp; A`：沉淀评审问题、技术取舍、未决事项和后续排查入口。

## 数据源写法

每个接口建议使用以下结构。若是 IDL 接口，保留 `pre/code` 代码块；若是 BAM/HTTP 接口，保留接口地址、方法、参数和返回示例。

```xml
<h3 seq="auto" seq-level="auto">接口名称</h3>
<table>
  <thead><tr><th>字段</th><th>说明</th></tr></thead>
  <tbody>
    <tr><td>接口类型</td><td>IDL / BAM / HTTP</td></tr>
    <tr><td>调用场景</td><td>页面初始化 / 用户点击 / 轮询 / 提交后刷新</td></tr>
    <tr><td>代码位置</td><td>path1; path2; ...</td></tr>
  </tbody>
</table>
<pre lang="idl" caption="接口定义"><code>struct ExampleResponse {
  ...
}</code></pre>
```

## 功能模块写法

每个模块先给出模块元信息，再给出方案表、埋点表和外部静态资源表。`技术方案` 小节统一使用表格承载，不在表格外追加散文式说明。

```xml
<h2 seq="auto" seq-level="auto">功能模块名称-平台类型</h2>
<table>
  <tbody>
    <tr><td><b>代码变更位置</b></td><td>path1; path2; ...</td></tr>
    <tr><td><b>技术栈</b></td><td>TypeScript, React, scss/tailwindcss, zustand, auxo, arco-mobile, react-query...</td></tr>
  </tbody>
</table>
<h3 seq="auto" seq-level="auto">技术方案</h3>
<table>
  <thead><tr><th>UI</th><th>代码设计</th><th>交互逻辑</th><th>数据逻辑</th></tr></thead>
  <tbody><tr><td>设计稿、组件布局</td><td>组件/状态/接口封装</td><td>操作与反馈</td><td>请求、转换、缓存、兜底</td></tr></tbody>
</table>
<h3 seq="auto" seq-level="auto">埋点逻辑</h3>
<table>
  <thead><tr><th>事件</th><th>参数</th><th>触发逻辑</th></tr></thead>
  <tbody>...</tbody>
</table>
<h3 seq="auto" seq-level="auto">外部静态资源</h3>
<table>
  <thead><tr><th>资源类型</th><th>资源地址</th><th>使用位置</th><th>备注</th></tr></thead>
  <tbody><tr><td>图片 / 图标 / 字体 / Lottie</td><td>{{外部资源链接}}</td><td>模块内使用位置</td><td>需补充 / 已确认</td></tr></tbody>
</table>
```

## 富文本格式要求

- 章节标题使用 `seq="auto"` 和 `seq-level="auto"`，不要手写序号。
- 表格宽度和列名尽量沿用模板；新增字段必须能提升评审或交付质量。
- 用 `<cite type="user">` 或普通文本记录负责人；用链接或 cite 记录 PRD、UI、后端文档和测试文档。
- 监控和发布检查必须使用 checkbox，不要改成普通段落。
- 设计稿截图、流程图、架构图、数据看板可以放入对应表格单元格，避免堆到文末。
- 无法获取的信息保留占位符并说明补充来源，例如 `{{figma链接}}`、`{{外部资源链接}}`、`待后端确认`，不要自行编造。
