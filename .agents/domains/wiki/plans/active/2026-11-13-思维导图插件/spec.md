---
name: "思维导图插件"
description: "新建 @kxh4892636/docusaurus-plugin-mindmap：把 apps/wiki/mindmaps 下 markdown 多级标题渲染成只读思维导图，build 期校验格式与引用。"
status: completed
---

# 思维导图插件

## 目标

1. 新建 `packages/docusaurus-plugin-mindmap`，包名 `@kxh4892636/docusaurus-plugin-mindmap`，与 `docusaurus-plugin-link` 同构：`vp pack` 构建、`workspace:*` 接入 wiki、只发布 `dist`。
2. 源文件固定放 `apps/wiki/mindmaps/**/*.md`（`docs/` 的同级目录，不进 docs 插件）。front matter 必须含 `id`，并用 `mindmap: true` 声明自己是思维导图。
3. **导图是文档里的一个渲染块（2026-11-13 用户改定）**：在任意 docs/blog markdown 里写 `<Mindmap>…</Mindmap>`，插件只把标签内的 markdown 标题渲染成导图；节点 = 标题，父子 = 层级，左右双向、曲线连线。没有自己的路由、侧栏或页面框架，导航、搜索、面包屑、目录全部走 docs/blog 原生逻辑。
4. 节点 id 写在标题里：`## 1.2 接口`，编号即 id。引用用原生 markdown 链接：文档 `[标题](相对路径.md) doc:<文档id>`，节点 `[标题](#1.2)`。
5. 节点 id：标题写 `## 标题 {#node-id}` 时用显式 id；不写则按标题文本生成 slug。同图内必须唯一。
6. 节点内容：标题下的普通正文是「概述」；`>` 引用块里的链接是「引用」。引用两种目标：`doc:<文档id>` 跳到该 wiki 文档 URL（新标签页），`#<节点id>` 跳到本图节点（关浮窗 + 图移到该节点）。
7. 交互：点击节点弹浮窗显示概述与引用；整图只读（不能改结构、不能编辑），支持缩放、平移、回到起点。导图的唯一编辑入口是 markdown 源文件。
8. 校验：`docusaurus build` 时校验导图格式、节点 id 唯一、引用目标存在，不合格直接抛错让 build 失败；`docusaurus start` 只告警。

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

- **导图与文档分家**：导图源放 `apps/wiki/mindmaps/`，与 `docs/` 同级（用户 2026-11-13 指定）。docs 插件不扫它，所以没有「同一文件两个视图」的问题，也不必 swizzle 主题。
- **路由按路径、不按 id**：侧栏是目录树，链接天然按路径走；与 docs 插件同一条规则（数字前缀剥离、README 作分类落地页）。路由在 mindmap 插件里注册，不依赖 docs 插件。
- **短链跨包**：`/<id>` 目前由 `docusaurus-plugin-link` 单根扫描 `docs/` 生成。要让导图也被短链跳转，link 插件增加 `mindmapsPath` 选项，把 `mindmaps/` 一起索引，目标地址由 mindmap 插件算出的路径路由构成。**路径规则只留一份**：把 `path.ts` 的「路径 → 路由」函数从 link 包导出（`@kxh4892636/docusaurus-plugin-link/path`），mindmap 插件直接引用，避免两套剥离前缀的规则分叉。
- **UI 框架复用 Docusaurus 原生**（2026-11-13 用户澄清：设计图只是示意图）：页面套 `Layout`，导航栏、页脚、字体、明暗模式与侧栏样式都来自站点，导图区只扩展标题行、缩放工具与画布；目录侧栏直接用 `@theme/DocSidebar`，与 docs 页同一组件。
- **自绘 SVG，零新依赖**：树布局、连线、缩放平移、浮窗都自己写。理由：仓库没有任何图布局依赖；发布包新增依赖要写显式版本（[common 001](../../../common/adr/001-发布包生产依赖不使用catalog协议.md)）；跨节点「引用边」不在现成导图库的模型里。
- **节点 id 显式优先、slug 兜底**：`## 标题 {#tree}` 显式；缺省按标题文本生成 slug（中文字符保留，行内代码/公式/链接剔除后取文本）。同图重复 slug 由校验报错，要求作者补显式 id——不自动加 `-2` 后缀，避免同一 markdown 的 id 随标题顺序漂移。
- **引用写法**：正文段落 = 概述；`>` 引用块 = 引用，每条一行 `> - [说明](doc:<uuid>)` 或 `> - [说明](#<节点id>)`。选它是因为原生 markdown、不新增语法，且引用块不会变成标题层级里的节点。
- **校验放在 `allContentLoaded`**：`doc:<uuid>` 需要真实站点路由才能算 URL，`loadContent` 阶段拿不到 docs 插件的 permalink；`allContentLoaded` 能从 `allContent['docusaurus-plugin-content-docs']` 建 `frontMatter.id → permalink` 映射，解析完再 `addRoute`，避免复刻 docs 的路径规则。复用这个映射而不是自己拼 slug：一旦两处规则分叉，引用就跳错页。
- **build 硬拦、dev 告警**：`process.env.NODE_ENV === 'production'` 时抛错；否则打印问题清单继续渲染，方便边写边看。
- **概述按纯文本渲染**：浮窗只显示文本行（保留 `- 术语: 说明` 这类行），不引入 markdown → HTML 渲染。完整排版留给文档页（浮窗里给该文档链接）。导图是导航层，不是阅读器。

## 方案与切片

1. **[001-插件脚手架与站点接入](001-插件脚手架与站点接入.md)**：建包、插件骨架、`mindmaps` 扫描、按路径注册整页路由（侧栏 + 占位图）、三处站点接入、首篇示例导图、link 插件加 `mindmapsPath` 让短链可用。
2. **[002-markdown解析与图模型](002-markdown解析与图模型.md)**：归一化换行、front matter、标题树、`{#id}` + slug、概述行、引用块 → 纯函数 + fixtures。
3. **[003-校验与构建门禁](003-校验与构建门禁.md)**：docs id → permalink 映射、校验规则集、报错定位、dev/build 分支、负例测试。
4. **[004-导图UIUX设计](004-导图UIUX设计.md)**：视觉与交互定稿，产出 HTML 原型、token 与实现约束。
5. **[005-导图渲染与交互](005-导图渲染与交互.md)**：布局纯函数、SVG 渲染、缩放平移、浮窗、引用点击两种行为、引用虚线。
6. **[006-样例导图与真机验收](006-样例导图与真机验收.md)**：从 wiki 真实内容抽一篇导图、build+serve 走查、领域词表收口。

## 非范围

- 不做在线编辑、拖拽改结构、增删节点——导图只读，改内容只能改 markdown。
- 不自动从 `docs/` 既有文档批量生成导图（1587 篇标题不唯一、307 处跳级，自动生成只会产出一堆校验失败）。
- 不支持跨导图的节点引用（`mindmap:<id>#<node>`）；本期 `#<节点id>` 只在同一篇导图内解析。
- 不在浮窗里渲染 markdown 富文本（粗体/代码块/公式）；概述按纯文本显示。
- 不做 npm 发布与版本号策略（`package.json` 按样板写 `publishConfig`，发布动作另起）。
- 不改 docs 插件、搜索索引、侧栏结构；`mindmaps/` 不出现在文档侧栏。

## 风险与假设

- **中文 slug 与显式 id 会混用**：自动 slug 可能生成中文 id（Docusaurus 自身保留 CJK），`#基础数据类型` 这类引用在浏览器里需要 URL 编码。若实践中别扭，改法是要求所有被引用的节点写显式 ASCII id，校验照旧。
- **标题里的行内代码/公式/链接**：提取纯文本后做 slug，可能与作者预期不一致；002 的 fixtures 必须覆盖这类标题。
- **CRLF 文件**：78 篇既有文档是 CRLF，新导图也可能被 Windows 编辑器写成 CRLF；解析前统一 `\r\n → \n`。
- **`allContent` 结构随 Docusaurus 版本变化**：`future.v4: true` 下 docs 内容形状可能调整；映射函数集中在一处，升版只改它，并有「映射为空就报错」的兜底。
- **大图性能**：单图节点数预期几十到几百；自绘 SVG 一次渲染全部节点，超过约 1000 节点再考虑虚拟化（本期不做，005 用真实大文件测一次）。
- **路由撞车**：`/mindmaps/<路径>` 若与既有页面重复，Docusaurus 默认只 warn；插件自己检查导图路径与 id 唯一，并在 build 时报告重复路由。导图 id 还要避开 docs 的 id，否则 `/<id>` 短链会撞。
- **`start` 也会跑校验**：dev 走告警分支，避免写一半的导图让开发服务器起不来。

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

## 追踪 Note

<!-- 由 nano_flow_check 生成，请勿手改 -->

| Name | Description | Status | Reason | Next Step | Related Note |
| --- | --- | --- | --- | --- | --- |
