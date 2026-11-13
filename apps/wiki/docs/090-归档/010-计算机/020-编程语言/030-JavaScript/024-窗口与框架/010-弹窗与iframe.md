---
id: 0cd807d0-b285-4a31-8afb-9800a07bf822
---

# 弹窗与 iframe

## 现代网页还需要弹窗吗？

- 替代方案: 用 `fetch` 取数据后渲染进页面的 `<div>`, 或嵌 `<iframe>`, 不必开新窗口;
- 移动端: 手机不能同时显示多个窗口, 弹窗体验差;
- 仍在用: OAuth 第三方登录 (Google/Facebook 等), 因为弹窗是独立 JS 环境, 打开非可信站点也安全, 又能导航并给 opener 发消息;

## 弹窗为什么会被浏览器拦截？

- 规则: 只有用户手势触发的事件处理程序里调用 `open` 才放行;
- 由来: 恶意站点曾用弹窗刷广告, 所以浏览器默认拦截并弹出提示让用户决定;

```js
window.open("https://javascript.info"); // 被拦截

button.onclick = () => {
  window.open("https://javascript.info"); // 允许
};
```

## `window.open(url, name, params)` 的参数怎么取值？

| 参数     | 含义                                                        |
| -------- | ----------------------------------------------------------- |
| `url`    | 新窗口加载的地址;                                           |
| `name`   | 窗口名 (`window.name`); 已有同名窗口则复用它, 否则新建窗口; |
| `params` | 逗号分隔的配置串, 不能含空格, 如 `width=200,height=100`;    |

| 配置项                                  | 含义                                                     |
| --------------------------------------- | -------------------------------------------------------- |
| `left` / `top`                          | 窗口左上角的屏幕坐标, 不允许完全移出屏幕;                |
| `width` / `height`                      | 新窗口宽高, 有最小宽高限制, 做不出不可见窗口;            |
| `menubar` `toolbar` `location` `status` | `yes`/`no` 显隐; 多数浏览器强制显示 `location`/`status`; |
| `resizable` `scrollbars`                | `yes`/`no`; 一般不建议关掉;                              |

- 省略第 3 参数或传空串: 用默认窗口参数;
- 传了 `params` 但某项 `yes/no` 没写: 该项按 `no` 处理, 想要的功能必须显式写 `yes`;
- 没有 `left`/`top`: 在最近打开的窗口附近打开;
- 没有 `width`/`height`: 沿用最近打开窗口的尺寸;
- 默认开成新标签页, 只有指定了尺寸才变成独立弹窗;
- 零宽高、屏幕外坐标会被浏览器"修正", 例如 Chrome 会改成铺满屏幕;
- 还有一堆更少支持的厂商私有配置, 一般不使用;

## 弹窗打开后如何访问、等待加载与关闭？

- 返回值: `open` 返回新窗口的引用, 可以改它的属性、改 `location`, 甚至用 `document.write` 生成内容;

```js
const newWin = window.open("about:blank", "hello", "width=200,height=200");
newWin.document.write("Hello, world!");
```

- 时机: `open` 刚返回时新窗口还没开始加载, `newWin.location.href` 仍是 `about:blank`, 所以改内容要等加载完成;

```js
const w = open("/", "example", "width=300,height=300");
w.focus();
w.onload = () => {
  // 或监听 w.document 的 DOMContentLoaded, 可以更早
  w.document.body.insertAdjacentHTML("afterbegin", "<div>Welcome!</div>");
};
```

- 关闭: `win.close()`; 浏览器会忽略非 `window.open` 创建的窗口的 `close()`, 所以只对弹窗有效;
- 状态: `win.closed` 为 `true` 表示已关闭; 用户随时可能关掉窗口, 代码要能容忍;
- 跨源: 内容互访受同源限制, 见 [跨窗口通信](./020-跨窗口通信.md);

## 主窗口与弹窗之间如何互相引用？

- 主 → 弹窗: `window.open(...)` 的返回值;
- 弹窗 → 主: `window.opener`, 非弹窗窗口上为 `null`;
- 双向: 两个窗口互相持有引用, 可以互改内容;

```js
const newWin = window.open("about:blank", "hello", "width=200,height=200");
newWin.document.write("<script>window.opener.document.body.innerHTML = 'Test'<\/script>");
```

## 移动、缩放、滚动与聚焦受哪些限制？

| 方法/属性                             | 作用                        |
| ------------------------------------- | --------------------------- |
| `moveBy(x,y)` / `moveTo(x,y)`         | 相对移动 / 移到屏幕坐标;    |
| `resizeBy(w,h)` / `resizeTo(w,h)`     | 相对缩放 / 缩放到指定尺寸;  |
| `scrollBy(x,y)` / `scrollTo(x,y)`     | 窗口滚动;                   |
| `elem.scrollIntoView(top = true)`     | 把元素滚到可视区顶部或底部; |
| `window.onresize` / `window.onscroll` | 对应的尺寸变化、滚动事件;   |

- 硬限制: 出于防滥用, 浏览器通常屏蔽移动/缩放方法, 只在自己打开的、不带多标签的弹窗上可靠; 这些方法对最大化/最小化的窗口无效; JS 没有最小化/最大化窗口的能力;
- `focus()` / `blur()` 与 `focus`/`blur` 事件: 历史上被滥用成"把用户锁在窗口里"(`window.onblur = () => window.focus()`), 因此限制很多, 取决于浏览器: 移动浏览器常完全忽略 `focus()`, 弹窗被开成标签页时聚焦也无效;
- 仍有用的场景: 打开弹窗后调 `newWindow.focus()` 让用户切过去; 用 `window.onfocus/onblur` 暂停或恢复页内动画, 注意 `blur` 只说明切走了, 窗口可能仍然可见;

## 弹窗和 iframe 里的 window 引用从哪里拿？

| 目标                | 拿法                                                                  |
| ------------------- | --------------------------------------------------------------------- |
| 新弹窗              | `window.open()` 的返回值;                                             |
| 主窗口 (在弹窗内看) | `window.opener`;                                                      |
| iframe 内的窗口     | `iframe.contentWindow`, 或 `window.frames[0]` / `window.frames.名字`; |
| 父窗口 / 顶层窗口   | `window.parent` / `window.top`;                                       |

- 共同点: `<iframe>` 里是独立的窗口, 有自己的 `document` 和 `window`, 和弹窗一样是独立 JS 环境;
- 差别: 弹窗是另一个浏览器窗口或标签页, iframe 嵌在当前文档里;
- 访问规则: 拿到引用不等于能读内容, 同源才能自由互访, 详见 [跨窗口通信](./020-跨窗口通信.md);
