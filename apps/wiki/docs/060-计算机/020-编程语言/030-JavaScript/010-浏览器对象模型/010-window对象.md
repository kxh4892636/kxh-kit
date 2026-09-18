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

- `window.alert(message?)`: 警告框;
- `window.confirm(message?)`: 确认框, 确定返回 `true`, 取消返回 `false`;
- `window.prompt(message?, defaultValue?)`: 输入框, 确定返回输入值, 取消返回 `null`;
- `window.open(url?, target?, features?)`: 打开新窗口或导航到指定 URL, 返回窗口引用或被拦截时返回 `null`;

## 定时器有哪些方法？

- `setTimeout(callback, delay?, ...args)`: 延迟后执行一次, 返回定时器 ID;
- `setInterval(callback, delay?, ...args)`: 每间隔执行, 返回定时器 ID;
- `clearTimeout(id)` / `clearInterval(id)`: 取消定时任务;
- 精度与替代写法见 [定时器](./040-定时器.md);
