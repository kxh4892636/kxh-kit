---
id: 593adf88-2ea7-439f-bfb6-3e9bcfaf4989
---

# display 与盒类型

## display 属性由哪两部分组成？

- outside: 元素参与外部布局的显示角色;
- inside: 元素内部子元素的布局模式;
- 可同时声明: `display: block flex`;

```css
span {
  display: block; /* 外部属性 */
}
span {
  display: flex; /* 内部属性 */
}
span {
  display: block flex; /* 外部 + 内部 */
}
```

## 块级盒子有什么特性？

- 不同块级标签之间换行;
- 具有 width/height 属性;
- padding/margin/border 会推开其他元素;
- inline 方向默认扩展并填满可用空间;
- 常见标签: `hx`、`p`、`div`、`ul`、`ol`、`dl`/`dt`/`dd`;

## 内联盒子有什么特性？

- 不同标签之间不自动换行;
- width/height 属性无效;
- padding/margin/border 仅水平方向会推开其他元素, 竖直方向无效;
- 常见标签: `a`、`span`、`strong`、`em`、`u`;

## 内联块级盒子与它们有何区别？

- 不自动换行, 但 width/height 有效;
- padding/margin/border 会推开其他元素;
- `inline-block` 等价于 `inline flow-root`;

```css
span {
  display: inline-block;
}
span {
  display: inline flow-root;
}
```
