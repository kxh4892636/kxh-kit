---
id: 959c04f4-5906-4611-b2b4-f46a82fdb33e
---

# iframe 内容访问、窗口层次与隔离

## iframe 里的内容如何访问？

- `iframe.contentWindow`: iframe 内的 window 对象;
- `iframe.contentDocument`: iframe 内的 document, 是 `iframe.contentWindow.document` 的简写;

```html
<iframe src="https://example.com" id="iframe"></iframe>

<script>
  iframe.onload = function () {
    let win = iframe.contentWindow; // 允许: 引用本身总能拿到
    try {
      let doc = iframe.contentDocument;
    } catch (e) {
      // 报错: Security Error (异源)
      console.log(e);
    }
    try {
      let href = win.location.href;
    } catch (e) {
      // 报错: 读 location 被拒
      console.log(e);
    }
    win.location = "/"; // 允许: 可以写 location
    iframe.onload = null; // 导航前清掉处理程序
  };
</script>
```

- 同源 iframe 则随便操作, 例如 `iframe.contentDocument.body.prepend("Hello")`;
- `iframe.onload` 等价于 `iframe.contentWindow.onload`, 都在内嵌窗口连同全部资源加载完时触发;
- 差别: 异源时读不到 `iframe.contentWindow.onload`, 所以统一用 `iframe.onload`;

## 为什么 iframe 的 document 可能拿到"错的那一份"？

- 机制: iframe 一创建就已带一个 document, 但它不是随后加载进来的那一份;
- 后果: 在这份"错 document"上绑的事件处理程序会被忽略;

```js
let oldDoc = iframe.contentDocument; // 还没加载完的那份
iframe.onload = () => {
  console.log(oldDoc === iframe.contentDocument); // false
};
```

- 什么时候就位: `iframe.onload` 触发时 document 一定是对的, 但它要等全部资源加载完;
- 想更早拿到: 用 `setInterval` 轮询比较引用, 变化即新 document 到位;

```js
let oldDoc = iframe.contentDocument;
let timer = setInterval(() => {
  if (iframe.contentDocument === oldDoc) return;
  console.log("新 document 就位");
  clearInterval(timer);
}, 100);
```

## 不同子域之间能否放宽同源限制？

- 条件: 共享同一二级域, 例如 `john.site.com`、`peter.site.com`、`site.com` 的公共二级域都是 `site.com`;
- 做法: 每个窗口各自执行一次, 之后双方互访不再受限;

```js
document.domain = "site.com"; // 只对同二级域的页面有效
```

- 现状: 该属性正从规范中移除, 官方建议改用跨窗口消息 (`postMessage`);
- 风险: 放宽到二级域后, 同一二级域下任何被攻破的子域都能读到你; 只当作兼容老代码的手段;

## `window.frames` 与 `parent`/`top` 组成什么层次？

- 按序号: `window.frames[0]` 是文档里第一个 frame 的 window 对象;
- 按名字: `window.frames.iframeName` 取 `name="iframeName"` 的 frame;
- 等价: `iframe.contentWindow == frames[0] == frames.win`;
- 层次: `window.frames` 是子窗口集合, `window.parent` 是父窗口, `window.top` 是最顶层窗口; 嵌套的 iframe 由此形成树;
- `window.frames[0].parent === window` 为 `true`;
- 判断自己是否在 frame 里:

```js
if (window == top) console.log("在顶层窗口");
else console.log("跑在 frame 里");
```

## `sandbox` 属性如何把 iframe 变成异源？

- 作用: 限制 iframe 内的行为, 用来安全地跑不可信代码; 默认它被当成异源并附带一组严格限制;
- 写法: `<iframe sandbox src="...">` 最严; 要放开的项用空格分隔写进属性值;

| 属性值                 | 放开的限制                            |
| ---------------------- | ------------------------------------- |
| `allow-same-origin`    | 取消"强制异源", 恢复 iframe 真实来源; |
| `allow-top-navigation` | 允许 iframe 改 `parent.location`;     |
| `allow-forms`          | 允许提交表单;                         |
| `allow-scripts`        | 允许执行脚本;                         |
| `allow-popups`         | 允许用 `window.open` 打开弹窗;        |

- 例: `<iframe sandbox="allow-forms allow-popups" src="...">` 只放开这两项, 其余照旧;
- 边界: `sandbox` 只能加限制, 不能减限制; 对本来就异源的 iframe, 加上 `allow-same-origin` 也放不开同源限制;
