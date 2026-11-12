---
id: 2272a849-e981-4a2d-89fe-dc5e89d3eaca
---

# Shadow DOM

## 浏览器内置控件为什么也有 shadow DOM？

- 现象: `<input type="range">` 这类控件是浏览器用内部 DOM/CSS 画出来的, 默认看不见;
- 查看: Chrome DevTools 打开 "Show user agent shadow DOM" 后能看到 `#shadow-root`;
- 历史: 浏览器先自行实验内部 DOM 实现控件, 之后才把 shadow DOM 标准化给开发者用;
- 非标准残留: 内置影子树里的 `pseudo` 属性可配合 `input::-webkit-slider-runnable-track` 这类伪元素改样式;
- 访问: 内置影子树无法用常规 JS 调用或选择器取得;

## attachShadow 如何创建影子树？有哪些限制？

```js
const shadow = elem.attachShadow({ mode: "open" });
shadow.innerHTML = `<p>Hello</p>`;
```

- 数量限制: 一个元素只能有一个影子根;
- 宿主限制: `elem` 必须是自定义元素, 或 `article`、`aside`、`blockquote`、`body`、`div`、`footer`、`h1`~`h6`、`header`、`main`、`nav`、`p`、`section`、`span` 之一; `<img>` 等不能当宿主;
- 填充: 影子根像元素一样, 可用 `innerHTML` 或 `append` 等 DOM 方法写入内容;
- 宿主属性: 影子根的 `host` 指回宿主元素;

```js
elem.shadowRoot.host === elem; // true
```

## open 与 closed 两种模式有什么区别？

| mode       | `elem.shadowRoot` | 含义                                 |
| ---------- | ----------------- | ------------------------------------ |
| `"open"`   | 影子根            | 任何代码都能访问该影子树             |
| `"closed"` | `null`            | 只能通过 `attachShadow` 的返回值访问 |

- 内置影子树: 都是 `closed`, 外部无路可进;
- 常见做法: 把返回值藏在类内部, 只通过组件方法间接操作影子树;

## light tree 与 shadow tree 同时存在时渲染哪一个？

- light tree: 普通 HTML 子节点构成的子树, 前面章节见到的都是它;
- shadow tree: 不反映在 HTML 里、对外隐藏的子树;
- 渲染规则: 两者都存在时只渲染 shadow tree, light 内容默认不显示;
- 例外: 需要显示 light 内容时用插槽做组合, 见 [模板与插槽](./030-模板与插槽.md);

## 影子 DOM 的封装体现在哪里？

- 查询隔离: 文档里的 `querySelector` 看不到影子树内元素, 必须从影子根内部查询;

```js
elem.attachShadow({ mode: "open" });
elem.shadowRoot.innerHTML = `<p>Hello</p>`;

document.querySelectorAll("p").length; // 0
elem.shadowRoot.querySelectorAll("p").length; // 1
```

- id 空间: 影子树内的 id 只需在树内唯一, 可与文档中的 id 冲突;
- 样式隔离: 影子树有自己的样式表, 文档样式规则不进入影子树; 例外见 [Shadow DOM 样式](./040-ShadowDOM样式.md);
- 用途: 在自定义元素里隐藏实现细节, 并让样式只作用于组件内部;
