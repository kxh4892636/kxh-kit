---
name: "思维导图插件"
description: "新建 @kxh4892636/docusaurus-plugin-mindmap：把 apps/wiki/mindmaps 下 markdown 多级标题渲染成只读思维导图，build 期校验格式与引用。"
status: completed
---

# 思维导图插件

## 目标

1. 新建 `packages/docusaurus-plugin-mindmap`，包名 `@kxh4892636/docusaurus-plugin-mindmap`，与 `docusaurus-plugin-link` 同构：`vp pack` 构建、`workspace:*` 接入 wiki、只发布 `dist`。
2. **导图写在文档里（2026-11-13 用户改定）**：任意 docs markdown 用 `<Mindmap>…</Mindmap>` 包住一段标题，插件只把标签内的 markdown 标题渲染成导图，不注册路由、不加侧栏、不进搜索。
3. **导图是文档里的一个渲染块（2026-11-13 用户改定）**：在任意 docs/blog markdown 里写 `<Mindmap>…</Mindmap>`，插件只把标签内的 markdown 标题渲染成导图；节点 = 标题，父子 = 层级，左右双向、曲线连线。没有自己的路由、侧栏或页面框架，导航、搜索、面包屑、目录全部走 docs/blog 原生逻辑。
4. 节点 id 写在标题里：`## 1.2 接口`，编号即 id。引用用原生 markdown 链接：文档 `[标题](相对路径.md) doc:<文档id>`，节点 `[标题](#1.2)`。
5. 编号即 id：标题必须以数字编号开头（`## 1.2 接口`），同图内唯一、层级不跳级，根是唯一一个 `#`。
6. 节点内容：标题下的普通正文是「概述」；`>` 引用块里的链接是「引用」。引用两种目标：`doc:<文档id>` 跳到该 wiki 文档 URL（新标签页），`#<节点id>` 跳到本图节点（关浮窗 + 图移到该节点）。
7. 交互：点击节点弹浮窗显示概述与引用；整图只读（不能改结构、不能编辑），支持缩放、平移、回到起点。导图的唯一编辑入口是 markdown 源文件。
8. 校验：解析在 remark 阶段完成，缺编号、跳级、编号重复、引用目标不合法一律抛错——`build` 与 `start` 都会失败，不静默降级。

## 现状（2026-11-13 调研事实）

| 项 | 结论 |
| --- | --- |
| Docusaurus | 3.10.1（core/types/utils/preset-classic 对齐），走 webpack（`future.v4: true`，未开 `experimental_faster`） |
| 站点内容 | `apps/wiki/docs` 1587 篇 md、3.77 MiB、11.2 万行；front matter 1225 篇，其中 **1217 篇有 UUID 形式的 `id`**（0 重复） |
| 无 `id` 的文档 | 370 篇：362 篇无 front matter、8 篇脚本生成的八股文文件 → 不能被 `doc:<id>` 引用 |
| 标题层级 | H1 1571、H2 6699、H3 3808、H4 118、H5 1056、H6 0；**307 处跳级**（69 个文件，如 `###` 后直接 `#####`）；18 篇无 H1、1 篇 3 个 H1、2 篇裸 `#` |
| 标题文本 | 不唯一：同文件重复标题 211 处、跨文件重名 H1 20 个；118 个标题含行内代码、14 个含数学公式、1 个含链接、13 个超 40 字符 |
| 换行 | **78 个文件是 CRLF**，按 `^(#{1,6})\s+` 解析前必须先归一化，否则整篇标题漏读 |
| 现有跨文档引用 | 2418 条相对 `.md` 链接（`./` 2069、`../` 308）；`.md#锚点` 0 条；纯锚点 3 条 → 没有现成的「引用」章节模板 |
| 图渲染依赖 | 全仓无 d3 / d3-hierarchy / markmap / mermaid / cytoscape / xyflow / elkjs / dagre；`zustand` 只在 `apps/music` |
| 插件样板 | `packages/docusaurus-plugin-link`：`loadContent` + `contentLoaded` 里 `addRoute({component: "<包名>/<子路径>"})`，重复 id 直接抛错（`failOnDuplicateId`） |
| build 门禁 | `loadContent` / `postBuild` 抛错都会让 `build` 失败（`plugins.js:40` → `bin` exit 1）；`start` 也跑 `loadContent`，同样会被挡住 |
| markdown 链接门禁 | 站点 `markdown.hooks.onBrokenMarkdownLinks` 是 `warn`，坏链不挂 build → 引用校验必须插件自己做 |

## 决策

- **导图是文档里的渲染块，不是独立页面**：不注册路由、不加侧栏、不碰 `docs/` 之外的目录。导航、搜索、面包屑、页脚全部是 docs 原生行为，插件只在文档正文里插一个 React 组件。
- **解析挂在 `beforeDefaultRemarkPlugins`**：必须在默认的 headings 与 toc 插件之前跑。导图标题一旦被 toc 收集，文档右侧就会多出一列错误目录；提前转换后标签内没有 heading 节点，`toc.length` 为 0，主题整列都不渲染，不必 swizzle、也不必用 CSS 藏。
- **文档引用走既有短链**：`doc:<文档id>` 直接编译成 `/<id>`，由 `docusaurus-plugin-link` 负责落地；mindmap 插件不重复实现路径规则，也不改 link 插件。
- **自绘 SVG，零新依赖**：树布局、连线、缩放平移、浮窗都自己写。理由：仓库没有任何图布局依赖；发布包新增依赖要写显式版本（[common 001](../../../common/adr/001-发布包生产依赖不使用catalog协议.md)）；跨节点「引用边」不在现成导图库的模型里。
- **节点 id 就是编号**：`## 1.2 接口` 的 `1.2` 既是 id 也是勾稽顺序，作者不用另起 slug，引用也读得懂（`[接口](#1.2)`）。重复与跳级在构建期报错，不自动改写。
- **引用写法**：正文段落 = 概述；`>` 引用块 = 引用，每条一行 `> - [说明](doc:<uuid>)` 或 `> - [说明](#<节点id>)`。选它是因为原生 markdown、不新增语法，且引用块不会变成标题层级里的节点。
- **校验就近抛错**：解析与校验都在 remark 里，坏导图直接让这一篇 MDX 编译失败（`build` 和 `start` 一样）。`doc:` 只认 `<id>` 短链，不去猜 permalink，所以不需要 `allContentLoaded` 那套映射。
- **概述按纯文本渲染**：浮窗只显示文本行（保留 `- 术语: 说明` 这类行），不引入 markdown → HTML 渲染。完整排版留给文档页（浮窗里给该文档链接）。导图是导航层，不是阅读器。

## 方案与切片

001–006 是「独立页面」时代的历史切片，2026-11-13 改成渲染块后不再适用（见「进度」）；007 起是当前形态。

1. **[001-插件脚手架与站点接入](001-插件脚手架与站点接入.md)**：建包、插件骨架、`mindmaps` 扫描、按路径注册整页路由（侧栏 + 占位图）、三处站点接入、首篇示例导图、link 插件加 `mindmapsPath` 让短链可用。
2. **[002-markdown解析与图模型](002-markdown解析与图模型.md)**：归一化换行、front matter、标题树、`{#id}` + slug、概述行、引用块 → 纯函数 + fixtures。
3. **[003-校验与构建门禁](003-校验与构建门禁.md)**：docs id → permalink 映射、校验规则集、报错定位、dev/build 分支、负例测试。
4. **[004-导图UIUX设计](004-导图UIUX设计.md)**：视觉与交互定稿，产出 HTML 原型、token 与实现约束。
5. **[005-导图渲染与交互](005-导图渲染与交互.md)**：布局纯函数、SVG 渲染、缩放平移、浮窗、引用点击两种行为、引用虚线。
6. **[006-样例导图与真机验收](006-样例导图与真机验收.md)**：从 wiki 真实内容抽一篇导图、build+serve 走查、领域词表收口。
7. **[007-导图标题不进文档目录](007-导图标题不进文档目录.md)**：插件挂到 `beforeDefaultRemarkPlugins`，删掉 CSS 隐藏。
8. **[008-拖动与缩放不重渲染](008-拖动与缩放不重渲染.md)**：视图状态改 ref、直接改 DOM，视图数学抽纯函数。

## 非范围

- 不做在线编辑、拖拽改结构、增删节点——导图只读，改内容只能改 markdown。
- 不自动从 `docs/` 既有文档批量生成导图（1587 篇标题不唯一、307 处跳级，自动生成只会产出一堆校验失败）。
- 不支持跨导图的节点引用（`mindmap:<id>#<node>`）；本期 `#<节点id>` 只在同一篇导图内解析。
- 不在浮窗里渲染 markdown 富文本（粗体/代码块/公式）；概述按纯文本显示。
- 不做 npm 发布与版本号策略（`package.json` 按样板写 `publishConfig`，发布动作另起）。
- 不改 docs 插件源码、搜索索引与侧栏结构；只在 docs 插件选项里挂一个 remark 插件。

## 风险与假设

- **导图标题不能留在标签外**：标签外的标题会照常进文档目录，也会变成真正的正文标题。导图必须整段包在 `<Mindmap>` 里。
- **标题里的行内代码/公式/链接**：提取纯文本后做 slug，可能与作者预期不一致；002 的 fixtures 必须覆盖这类标题。
- **CRLF 文件**：78 篇既有文档是 CRLF，新导图也可能被 Windows 编辑器写成 CRLF；解析前统一 `\r\n → \n`。
- **`allContent` 结构随 Docusaurus 版本变化**：`future.v4: true` 下 docs 内容形状可能调整；映射函数集中在一处，升版只改它，并有「映射为空就报错」的兜底。
- **大图性能**：单图节点数预期几十到几百。平移与缩放只改 `<g transform>`、缩放读数与浮窗坐标（直接操作 DOM），不触发 React 渲染；节点与连线本身仍是一次性渲染全部，超过约 1000 节点再考虑虚拟化。
- **`start` 也会失败**：写一半的导图会让那一页开发服务器编译失败，这是有意的——坏引用不等到上线才暴露。

## 恢复入口

1. 按 [notes_index.md](notes_index.md) 顺序推进；002 的模型类型是 003/004 的输入。
2. 插件目录：`packages/docusaurus-plugin-mindmap/`；源内容：`apps/wiki/mindmaps/`；站点接入：`apps/wiki/docusaurus.config.ts` + `apps/wiki/package.json` 的 `prebuild`。
3. 本文件「现状」与「决策」若与实际代码冲突，先复测再改这里，不要在两个地方各留一份规则。

## 进度

- 2026-11-13：按用户要求调整导图形态：去掉画布网格、连线改贝塞尔曲线并按层级递减线宽、布局改左右双向；`/mindmaps` 加左侧目录侧栏，路由从 `/mindmaps/<id>` 改为按路径，并让 link 插件把导图 id 纳入 `/<id>` 短链。
- 2026-11-13：UIUX 收口（Hallmark finish review `fix` → 八条修完，截图已随 design 目录删除，sloplint 静态档 0/0/0）。
- 2026-11-13：UIUX 定稿（Hallmark，Cobalt app screen）：原型（design 目录已删除），静态档 sloplint 全清；note 重排为 004 设计 → 005 渲染 → 006 验收。
- 2026-11-13：Plan 建立。三个只读 subagent 完成调研（wiki 文档结构、Docusaurus 3.10 插件 API、仓库工程约定与可用依赖）；用户确定：引用用引用块 + 链接列表、节点 id 显式 `{#id}` + slug 兜底、导图文档固定 `mindmaps/` 目录 + `/mindmaps` 子路由、渲染自绘 SVG 零依赖、build 期抛错阻断。

- 2026-11-13：全部 note 完成并真机验收。`packages/docusaurus-plugin-mindmap` 落地（解析 / 校验 / React 渲染 / 目录侧栏），link 插件支持 `mindmaps/` 根并导出 `createDocPermalink`；站点 `pnpm build` 通过，两篇导图页与 `/<id>` 短链可用。浏览器 e2e（CDP）覆盖节点、浮窗、两类引用、深链、短链、侧栏切换、深色、390 宽抽屉，0 控制台异常；单测 18 条全绿，`vp check` 干净。负例：坏引用让 build 失败并定位到文件行号。

- 2026-11-13：按用户澄清改为复用 Docusaurus 原生框架——页面套 `@theme/Layout`，侧栏换成 Infima `menu` 结构，配色与字体改用 `--ifm-*` 变量（不再带 Cobalt token 和自绘顶栏）；浏览器 e2e 复跑仍全绿。
- 2026-11-13：架构改定——导图从「独立页面 + 左侧目录」改为文档里的 `<Mindmap>` 渲染块：删掉路由注册、侧栏、link 插件接入、`design/` 原型与全部死代码，包只留 `./remark` 与 `./client` 两个入口。
- 2026-11-13：目录不再列出导图标题。插件挂到 `beforeDefaultRemarkPlugins`，toc 收集不到导图标题，主题整列不渲染（[007](007-导图标题不进文档目录.md)）；拖动与缩放改为直接改 DOM，整棵 SVG 不再每帧重渲染（[008](008-拖动与缩放不重渲染.md)）。

## 追踪 Note

<!-- 由 nano_flow_check 生成，请勿手改 -->

| Name | Description | Status | Reason | Next Step | Related Note |
| --- | --- | --- | --- | --- | --- |
