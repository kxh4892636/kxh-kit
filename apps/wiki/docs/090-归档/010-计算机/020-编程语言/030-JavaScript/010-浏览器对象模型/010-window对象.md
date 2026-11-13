---
id: 79347517-51be-4b67-a86a-48f468f76899
---

# window 对象

## window 提供哪些窗口与视口信息？

| 成员                                | 含义                                           |
| ----------------------------------- | ---------------------------------------------- |
| `window.top`                        | 浏览器顶层窗口                                 |
| `window.parent`                     | 当前窗口的父窗口, 顶层窗口的 `parent` 即 `top` |
| `window.self`                       | `window` 本身                                  |
| `window.innerWidth` / `innerHeight` | 页面视口宽高                                   |
| `window.outerWidth` / `outerHeight` | 浏览器窗口外部宽高                             |
| `window.screenLeft` / `screenTop`   | 窗口相对屏幕的位置                             |
| `window.devicePixelRatio`           | 物理像素与逻辑像素的比值                       |

## 如何移动、缩放与滚动窗口？

| 方法                                       | 作用                      |
| ------------------------------------------ | ------------------------- |
| `window.moveTo(x, y)` / `moveBy(x, y)`     | 移动到绝对位置 / 相对移动 |
| `window.resizeTo(w, h)` / `resizeBy(x, y)` | 缩放到指定尺寸 / 相对调整 |
| `window.scrollTo(x, y)`                    | 滚动到页面指定位置        |
| `window.scrollTo({ left, top, behavior })` | 支持平滑滚动的滚动        |
| `window.scrollBy(x, y)`                    | 相对当前视口滚动          |
| `window.scrollX` / `scrollY`               | 当前水平 / 垂直滚动位置   |

## 如何弹出对话框与打开新窗口？

- `window.alert(message?)` / `window.confirm(message?)` / `window.prompt(message?, defaultValue?)`: 三个内置对话框, 返回值与取消途径见下文小节;
- `window.open(url?, target?, features?)`: 打开新窗口或导航到指定 URL, 返回窗口引用或被拦截时返回 `null`;

## 三个内置对话框的返回值与取消途径有何不同？

| 调用                      | 界面                      | 确定返回    | 取消返回   |
| ------------------------- | ------------------------- | ----------- | ---------- |
| `alert(message)`          | 文本 + 确定               | `undefined` | 无取消按钮 |
| `prompt(title, default?)` | 文本 + 输入框 + 确定/取消 | 输入框文本  | `null`     |
| `confirm(question)`       | 文本 + 确定/取消          | `true`      | `false`    |

- 取消途径: 点 Cancel 或按 `Esc` 都算取消;
- 易错点: `alert` 返回值无意义, 只有 `prompt` 会返回 `null`, `confirm` 永远返回布尔值;

## 内置对话框为什么是模态的？

- 模态 (modal): 弹出期间用户无法与页面其它部分交互, 必须先把该窗口处理掉;
- 阻塞: 脚本暂停执行, 关闭后才继续下一行, 单线程被占住, 渲染与定时器也一并停摆;
- 位置: 由浏览器决定, 通常在屏幕居中;
- 外观: 由浏览器决定, 无法用代码或 CSS 修改;
- 本质: 以上两点是用「简单」换来的代价;

## 为什么 `prompt` 建议总是传第二个参数？

- 语法: `result = prompt(title, [default])`, 方括号只表示参数可选, 不是数组;
- `title`: 显示给用户的提示文案;
- `default`: 输入框的初始值, 用户可直接用或覆盖;
- IE 的坑: 省略 `default` 时 IE 会把字符串 `"undefined"` 填进输入框;
- 规避: 始终写第二参数, 哪怕只给空串;

```js
const age = prompt("How old are you?", ""); // IE 下也别省第二参数
alert(`You are ${age} years old!`); // 点 Cancel / 按 Esc 时 age 为 null
```

## 为什么生产环境不推荐用内置对话框？

- 外观不可控: 无法定制样式, 也无法与产品设计统一;
- 位置不可控: 只能由浏览器摆放;
- 体验差: 阻塞页面交互与脚本, 页面在等待期间表现为假死;
- 能力弱: 只能显示纯文本, 做不了更丰富的交互;
- 结论: 适合调试、演示或对样式无要求的小工具; 正式产品自建模态组件 (如 `<dialog>`);

## 定时器有哪些方法？

- `setTimeout(callback, delay?, ...args)`: 延迟后执行一次, 返回定时器 ID;
- `setInterval(callback, delay?, ...args)`: 每间隔执行, 返回定时器 ID;
- `clearTimeout(id)` / `clearInterval(id)`: 取消定时任务;
