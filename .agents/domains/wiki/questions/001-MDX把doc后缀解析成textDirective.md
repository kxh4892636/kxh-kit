---
name: "001-MDX把doc后缀解析成textDirective"
description: "导图里写成 doc:<uuid> 的跳转依据会被 MDX 的指令语法吃掉，解析时要先把 textDirective 还原成 :name 才拼得回文档 id。"
---

# 001-MDX把doc后缀解析成textDirective

## 现象

导图引用写成 `> - [基础数据类型](../../…/010-基础数据类型.md) doc:07b40046-e58e-4b78-a552-928d99eb18fb`，解析时匹配不到 `doc:` 后面的 id：mdast 里那个链接后面不是一段纯文本，而是

```text
text "doc"
textDirective { name: "07b40046-e58e-4b78-a552-928d99eb18fb" }
```

即 `doc` 留下来当普通文本，`:uuid` 被 MDX 的指令语法解析成了 textDirective 节点。

## 原因

MDX 支持 `:name` 形式的指令（remark-directive）。`doc:<id>` 里冒号后面的部分符合指令名字的形状，于是链接之后的文本被拆成两个节点。

## 解法

```ts
const textOf = (node: MdastNode): string => {
  if (node.type === "textDirective") return ":" + (node.name ?? "");
  …
};
```

拼接时把指令节点还原成 `":" + name`，整段再交给 `/doc:([A-Za-z0-9-]+)/` 匹配。另外，同一段落里多个链接时，每个链接只向后扫到下一个链接为止，避免两个链接共用一个 `doc:`。

## 验证方法

- 单测里直接构造 `{ type: "textDirective", name: "7c9f-1" }` 作为链接后的节点，断言 `refs[0].target === "7c9f-1"`、`url === "/7c9f-1"`（`packages/docusaurus-plugin-mindmap/src/remark-mindmap.test.ts` 的「reads a doc reference from the trailing doc directive」）。
- 真实页面：示例文档里任一文档引用点击后落到目标文档，说明解析拿到了正确 id。

## 备注

这也解释了为什么不把 `doc:<id>` 直接当链接目标（`[说明](doc:<id>)`）：那会把 id 塞进 URL，同时撞上指令语法与站点的坏链门禁，见 [004-引用写成原生链接加doc后缀](../adr/004-引用写成原生链接加doc后缀.md)。

## 相关

- [004-引用写成原生链接加doc后缀](../adr/004-引用写成原生链接加doc后缀.md) — 决定「链接 + 后缀」写法的就地约束
- [002-本地起wiki站验收的两个陷阱](002-本地起wiki站验收的两个陷阱.md) — 同一批验收里踩到的环境问题
