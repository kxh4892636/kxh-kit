---
name: "002-markdown解析与图模型"
description: "把导图 markdown 解析成标题树、节点 id、概述与引用，覆盖 CRLF、中文标题、行内代码公式等真实边界。"
status: completed
related_noted: []
next_step: ""
---

# 002-markdown解析与图模型

## 交付

- 模型类型 `src/model.ts`（全部可 JSON 序列化，要进 route.props）：

  `MindmapRef = { kind: "doc"; target: string; label: string } | { kind: "node"; target: string; label: string }`
  `MindmapNode = { id: string; title: string; level: number; overview: string[]; refs: MindmapRef[]; children: MindmapNode[] }`
  `MindmapDoc = { docId: string; title: string; sourcePath: string; root: MindmapNode }`

- 解析纯函数放 `src/parse/`：
  - 归一化：先去掉 front matter，再把 CRLF / CR 统一成 LF；围栏代码块（三个反引号或三个波浪线）内的行不参与标题与引用识别。
  - 标题：行首 1 到 6 个 #、后跟至少一个空白、再跟标题文本；无文本的裸 # 记错误。
  - 显式 id：标题尾部的 `{#id}` 剥离后作为节点 id；没有则按标题文本生成 slug（剔除行内代码的反引号内容、数学公式、链接只留链接文本，ASCII 转小写，空白转连字符，保留中文）。
  - 概述：标题之后、下一个同级或更高级标题之前的非引用块行，逐行保留（去掉首尾空行）。
  - 引用：连续引用块（行以 > 开头）里的列表链接，形如 `> - [说明](doc:<uuid>)` 或 `> - [说明](#<节点id>)`；目标为 doc: 前缀时记为 doc 引用、以 # 开头时记为 node 引用；其他目标形式记错误（本期只认这两种）。
  - 树构建：第一个 H1 作根；层级恰好 +1 才挂为子节点，跳级（如 ## 后直接 ####）记错误并挂到最近的更低层级节点下，保证仍能产出一棵树。
- 错误项模型 `{ sourcePath, line, code, message }`：code 用 as const 对象（missing-id / duplicate-node-id / skipped-level / bare-heading / bad-ref / multi-root）；错误随 MindmapDoc 一起返回，解析层不抛异常。
- fixtures 放 `tests/fixtures/`，在 `src/parse/*.test.ts` 覆盖：中文标题、行内代码标题、数学公式标题、含链接标题、CRLF 文件、跳级、同图重复 slug、空正文、只有 H1、代码块里以 # 开头的行、引用块与正文混排、两种合法引用与三种非法引用。

## 验收

- [ ] 同一输入解析两次深比较相等，且 JSON.stringify 后再 parse 不丢字段。
- [ ] 上述 fixtures 单测全绿，每个错误 code 至少一条负例断言。
- [ ] 用 `apps/wiki/docs` 里两篇真实文件（一篇 CRLF、一篇含代码与公式标题）临时跑解析，不抛异常，标题数与 grep 计数一致——解析器不能只在新写的导图上成立。

## 风险

- 中文 slug 与浏览器 URL 编码习惯可能不一致；002 只保证「生成的 id 能被 # 引用解析到」，展示层编码在 004 处理。
- 引用块缩进写法有多种（`> - `、`>- `、`>   - `），解析器要都接受。
## 实施记录（2026-11-13）

- `src/parse-mindmap.ts`：CRLF 归一、围栏代码块跳过、`{#id}`、slug（中文保留、标点转连字符）、概述行、引用块链接；错误项带文件与行号。
- `src/model.ts` 定下 JSON 可序列化模型；`MindmapParseResult` 同时返回 doc 与 issues。
- 测试 18 条全绿（解析 9、布局 4、校验 5），覆盖 CRLF、代码块、裸标题、跳级、多根、重复 id、中文与英文标题折行。
