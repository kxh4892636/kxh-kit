---
id: 8e08fb1d-ca39-4aec-9dd9-2d394dfbe5a9
---

# Shadow DOM 样式

## 影子树里的样式表如何书写与复用？

- 写法: 影子树里可以放 `<style>` 或 `<link rel="stylesheet" href="…">`;
- 复用: `<link>` 方式的样式表会被 HTTP 缓存, 多个组件共用同一模板时不会重复下载;
- 基本规则: 局部样式只作用于影子树内, 文档样式作用于树外, 但存在几类例外;

## `:host` 系列选择器如何给宿主元素设默认样式？

- 宿主位置: 影子宿主自身在 light DOM 里, 所以文档 CSS 能影响它;
- `:host`: 在影子树内部选中宿主元素, 适合放组件默认外观;

```css
:host {
  display: inline-block;
  border: 1px solid red;
}

:host([centered]) {
  position: fixed;
  left: 50%;
  top: 50%;
}
```

- `:host(selector)`: 只有宿主匹配 `selector` 时才生效, 常配合属性选择器做开关;

## 文档样式与宿主样式冲突时谁优先？

- 默认: 文档样式优先;
- 价值: 组件用 `:host` 给"默认值", 使用方在文档里轻松覆盖;
- 例外: 局部规则标了 `!important` 时, 局部样式优先;

## 如何给插槽内容加样式？

- 归属: 被插槽元素来自 light DOM, 因此使用文档样式, 组件局部样式对它无效;
- 方案一: 给 `<slot>` 本身设样式, 靠 CSS 继承传给内容 (只有可继承属性有效);
- 方案二: `::slotted(selector)` 伪类, 匹配同时满足"被插槽"且"匹配 selector"的元素;

```css
slot[name="username"] {
  font-weight: bold;
} /* 继承 */
::slotted(div) {
  border: 1px solid red;
} /* 只命中被插槽的 div 自身 */
```

- 匹配范围: 与槽名无关, 任何被插槽元素都算, 但只匹配元素自身, 不含其子元素;
- 深度限制: `::slotted` 不能继续向下选择, `::slotted(div span)`、`::slotted(div) p` 都无效;
- 使用范围: `::slotted` 只能写在 CSS 中, 不能用于 `querySelector`;

## 文档如何从外部控制组件内部样式？

- 结论: 没有任何选择器能让文档直接命中影子树内部元素;
- 机制: CSS 自定义属性在所有层级都可见, 能穿透影子 DOM;
- 组件侧: 用 `var(--component-name-xxx, 默认值)` 给关键元素留出钩子;

```css
/* 组件内部 */
.field {
  color: var(--user-card-field-color, black);
}
/* 外部文档 */
user-card {
  --user-card-field-color: green;
}
```

- 契约: 这些自定义属性应像组件方法一样被文档化, 当作公开 API 维护;
- 使用方: 在宿主元素或更上层元素上赋值即可生效;
