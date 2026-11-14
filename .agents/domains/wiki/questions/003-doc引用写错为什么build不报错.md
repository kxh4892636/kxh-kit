---
name: "003-doc引用写错为什么build不报错"
description: "doc:<id> 只校验「写了没有」，不再校验目标文档存在：id 拼错 build 照样通过，点击落到 404，唯一兜底是人工点一遍。"
---

# 003-doc引用写错为什么build不报错

## 现象

把导图里任一条文档引用的 `doc:` 后缀改成随机 uuid，`pnpm --filter @kxh4892636/wiki build` 仍然成功；运行时点这条引用，新标签页落到 `/<随机id>` 的 404。节点引用写错则是硬失败（构建期就抛错），两类引用的门禁强度不同。

## 原因

第一版有 `validate.ts`：在 `allContentLoaded` 里读 `allContent["docusaurus-plugin-content-docs"]` 建 `frontMatter.id → permalink` 映射，引用目标不在映射里就抛错。改成渲染块、代码重构时这个文件与它的测试一起被删了（[005-导图渲染与交互](../plans/active/2026-11-13-思维导图插件/005-导图渲染与交互.md) 的「重构 + CR 修复」）。现在 `remark-mindmap.ts` 里只有：

- `DOC_ID_PATTERN` 匹配（必填 `[A-Za-z0-9-]+`），
- 节点引用目标必须在本图编号集合里。

remark 阶段拿不到 docs 索引（没有 `allContent`），所以文档 id 存在性没人查。`/` 短链路由由 `docusaurus-plugin-link` 按 docs 的真实 id 生成，拼错的 id 没有对应路由——build 不报错，请求才 404。

## 影响

- 370 篇没有 front matter `id` 的文档被引用也照样通过，点开必然 404。
- 站点的两支链接门禁都拦不住：引用渲染成 `<button>` + `window.open`，页面里没有 `<a>`，`onBrokenLinks` 无处可查；相对路径在渲染前就被替换成 `/<id>`，`onBrokenMarkdownLinks` 也看不到原始路径。

## 现在能查的

- 写/改导图后逐条点一遍引用（[001-在wiki文档里写一个导图块并验收](../workflows/001-在wiki文档里写一个导图块并验收/001-在wiki文档里写一个导图块并验收.md) 的验收清单第 5 步）。
- 机械比对：抽出 md 里的 `doc:[A-Za-z0-9-]+`，与 `docs/` 下 front matter 的 `id` 求差集。

## 若要补门禁

站点侧加一个 prebuild 脚本做上面的比对最小，不必把插件改回带 `loadContent` 的形态（那与 [001-导图是文档内渲染块而非独立路由](../adr/001-导图是文档内渲染块而非独立路由.md) 的「只留两个入口」相抵）。本期未做。

## 相关

- [004-引用写成原生链接加doc后缀](../adr/004-引用写成原生链接加doc后缀.md) — 相对路径不参与跳转，才让 id 拼错成为唯一失败点
- [002-本地起wiki站验收的两个陷阱](002-本地起wiki站验收的两个陷阱.md) — 404 先排除环境因素再归因到这里
