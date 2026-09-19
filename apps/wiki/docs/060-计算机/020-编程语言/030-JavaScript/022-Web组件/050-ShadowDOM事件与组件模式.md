---
id: 8d2460a3-d109-4dd7-9b3b-d86a0c90627f
---

# Shadow DOM 事件与组件模式

## 为什么影子 DOM 内的事件会被重定向？

- 目的: 封装组件内部实现, 主文档脚本 (尤其面对第三方组件) 不该知道内部结构;
- retargeting: 影子 DOM 里发生的事件, 在组件外部被捕获时 `target` 变成宿主元素;

```js
this.shadowRoot.firstElementChild.onclick = (e) => alert("Inner target: " + e.target.tagName); // BUTTON

document.onclick = (e) => alert("Outer target: " + e.target.tagName); // USER-CARD
```

- 内部视角: 影子树内的处理程序仍拿到真实目标;
- 外部视角: 事件看起来就发生在 `<user-card>` 上;

## 什么情况下不发生重定向？

- 被插槽元素: 它物理上住在 light DOM, 点击它时内外处理程序的 `target` 都是该元素本身;
- 示例: 点击 `<span slot="username">` 时, 内外 `target` 都是这个 `span`;
- 影子来源元素: 点击来自影子树的元素 (如 `<b>Name</b>`) 冒泡出边界时, `target` 被重置为宿主;

## 冒泡路径在影子边界处如何计算？

- 依据: 冒泡按 flattened DOM 走, 被插槽元素内的事件先到 `<slot>` 再向上;
- `event.composedPath()`: 返回组合后的完整路径, 含影子内部节点;
- 示例: 点击 `<span slot="username">` 返回 `[span, slot, div, shadow-root, user-card, body, html, document, window]`;
- closed 树: 路径从宿主开始, 影子内部完全隐藏;

## `composed` 标志决定什么？

- 含义: `event.composed === true` 才能穿过影子边界, 否则只能在影子树内部被捕获;
- 常见 `composed: true`: `blur`、`focus`、`focusin`、`focusout`、`click`、`dblclick`、`mousedown`、`mouseup`、`mousemove`、`mouseout`、`mouseover`、`wheel`、`beforeinput`、`input`、`keydown`、`keyup`, 以及全部触摸与指针事件;
- `composed: false`: `mouseenter`、`mouseleave` (也不冒泡)、`load`、`unload`、`abort`、`error`、`select`、`slotchange`;
- 后果: 这些事件只能在事件目标所在的同一个 DOM 内被捕获;

## 自定义事件如何穿过边界并划定组件作用域？

- 跨边界条件: 自定义事件必须同时设 `bubbles: true` 与 `composed: true`, 才能冒泡出组件;

```js
inner.dispatchEvent(
  new CustomEvent("test", {
    bubbles: true,
    composed: true,
    detail: "composed",
  }),
);
```

- 嵌套组件: composed 事件会穿过所有影子边界;
- 限定作用域: 只想让紧邻的宿主组件收到时, 在影子宿主上派发并设 `composed: false`;
- 效果: 事件出了本组件的影子树, 但不会再往上冒泡到更高层 DOM;
- 跨文档: 需要跨窗口或跨文档通信时用 [postMessage](../017-浏览器API/040-postMessage.md);
