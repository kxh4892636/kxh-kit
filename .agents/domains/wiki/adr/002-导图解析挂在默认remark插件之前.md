---
name: "002-导图解析挂在默认remark插件之前"
description: "remarkMindmap 挂在 beforeDefaultRemarkPlugins：导图标题在 toc 收集前就变成组件，toc.length 归零，文档右侧目录整列不渲染，不必 swizzle。"
status: accepted
---

# 002-导图解析挂在默认remark插件之前

## 背景

改成渲染块后，`<Mindmap>` 里的标题仍然被 docs 默认的 `headings`/`toc` remark 插件收集，文档右侧多出一列指向导图节点的错误目录。先试的两条路都不行：

- CSS 隐藏：`table-of-contents { display: none }` 藏掉内容，但主题按 `toc.length > 0` 决定是否渲染 `col col--3`，整列还在，只是空着。
- 数据层清 toc：在 `allContentLoaded` 里改 routes，改不动已生成的 routes，白读 1588 个文件，从未生效。

## 决策

把 `remarkMindmap` 从 `remarkPlugins` 挪到 `beforeDefaultRemarkPlugins`。该选项先于默认 `headings`/`toc` 执行：导图标题在收集之前就变成组件节点，标签内没有 heading 节点，`toc.length` 为 0。

## 后果

- 主题的 `DocItem/Layout` 判定 `!hide_table_of_contents && toc.length > 0` 不成立，右侧目列与移动端 `tocCollapsible` 都不生成，不用 swizzle，升 Docusaurus 不跟维护。
- 同一份配置里也删掉了两条重复的 `:has(.mindmap-block) .table-of-contents` 规则。
- 含导图块的页面**整列**目录消失（不是只藏导图标题）；页面上其他正文标题也不再有目录。这是接受的代价：导图页以图导航为主。
- 插件顺序成了隐性依赖：任何在它之前收集标题的插件都可能让问题回来。

## 验证方法

build 产物计数，不靠肉眼：`build/docs/中转/思维导图示例/index.html` 里 `col--3`、`table-of-contents`、`tocCollapsible` 均 0 处；对照普通文档 `col--3` 仍为 1。

## 证据

- 用户选定方案 3：`session-644c9eec-c2a1-4e79-902f-f54f5feb87f0` seq 381（turn 2「toc: 选3」）。
- 落地与计数：[007-导图标题不进文档目录](../plans/active/2026-11-13-思维导图插件/007-导图标题不进文档目录.md)；配置见 `repos/wiki/docusaurus.config.ts` 的 `beforeDefaultRemarkPlugins`。

## 相关

- [001-导图是文档内渲染块而非独立路由](001-导图是文档内渲染块而非独立路由.md) — 只有导图待在正文里，标题才会落到 docs 的目录机制上
- [003-节点编号即id](003-节点编号即id.md) — 同一批改动里定下的编号规则
