---
id: 953aa001-53c8-40d4-8245-3cb18583b14d
---

# ReactDOM 概览

createPortal、flushSync 和资源预加载 API 怎么用？

## createPortal

- 把 children 渲染到指定 DOM 节点: `createPortal(children, domNode, key?)`;
- 适合 modal、tooltip;

```jsx
import { createPortal } from "react-dom";

createPortal(<Modal />, document.getElementById("root"));
```

## flushSync

- 强制同步刷新回调内的 state 更新: `flushSync(callback)`;
- 不常见, 可能影响性能;

```jsx
flushSync(() => setState(next));
```

## 资源预加载

- 提前连接/获取资源, 提升加载性能;
- 框架通常会代为处理;

| API             | 作用                    |
| --------------- | ----------------------- |
| `prefetchDNS`   | 提前 DNS 解析           |
| `preconnect`    | 提前连接服务器          |
| `preload`       | 预取样式/字体/图片/脚本 |
| `preloadModule` | 预取 ESM 模块           |
| `preinit`       | 预取并执行脚本/样式     |
| `preinitModule` | 预取并执行 ESM 模块     |

```jsx
import { preload } from "react-dom";
preload("theme.css", { as: "style" });
```

## 注意

- 预加载 API 可在渲染或事件中调用;
- 重复调用同一资源会被 React 去重;
