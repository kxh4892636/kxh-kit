---
id: e9ad6f56-0a75-467b-a344-bc6af857bb53
---

# 客户端 root 与水合

## 如何启动一个没有服务端 React HTML 的根？

- createRoot: 在浏览器容器中创建 React root，再用 root.render 从头生成 DOM；首次渲染会接管并清理容器内现有内容;
- 启动时机: 不必等待所有数据或资源，只要目标容器已解析且客户端 JS 已执行；JS 前通常只看到空容器或手写占位;
- Root 选择: 整个应用通常一个 root，渐进接入的独立区域可以多个 root，嵌套组件无需各自创建 root;
- 调用参数: root 选项传给 createRoot，不传给 root.render；框架项目通常由框架负责入口;

```jsx
import { createRoot } from "react-dom/client";

const root = createRoot(document.getElementById("root"), {
  identifierPrefix: "app-",
});
root.render(<App />);
```

## root.render 与 unmount 有什么生命周期含义？

- 再次 render: 更新同一个 root 中的树，能匹配的组件身份仍可保留 state，不等同于重新创建整个应用;
- 非同步保证: render 后的下一行代码，不保证渲染组件的 Effect 已执行，需要测试同步时使用 act，特殊 DOM 集成评估 flushSync;
- 卸载: root.unmount 清理组件、Effect 和事件处理；同一个已卸载 root 不能再次 render，需要新建 root;

## 如何让已有服务端 HTML 变得可交互？

- hydrateRoot: 对服务端已生成的 React HTML 进行水合，在已有 DOM 上建立组件树、状态与事件，而非重建节点;
- 可见与可交互: HTML 到达后即可显示，但直到客户端入口运行 hydrateRoot 后，onClick、state 和 Effect 才接管界面;
- 内容一致: 客户端首次渲染应与服务端内容一致，时间、随机数、浏览器分支和不同数据都可能造成不匹配;
- 避免提前覆盖: 水合完成前调用 root.render 可能清空服务端内容并切换成客户端渲染;

```jsx
import { hydrateRoot } from "react-dom/client";

const root = hydrateRoot(document.getElementById("root"), <App />, {
  identifierPrefix: "app-",
  onRecoverableError(error, info) {
    report(error, info.componentStack);
  },
});
```

- 根节点: 服务端输出整份 html 文档时使用 `hydrateRoot(document, <App />)`；只渲染某个容器时，客户端传入同一容器;

## createRoot 与 hydrateRoot 的根本区别是什么？

| API         | 首屏 DOM 来源     | JS 执行后的工作            |
| ----------- | ----------------- | -------------------------- |
| createRoot  | 客户端 React 生成 | 创建 DOM 并建立交互        |
| hydrateRoot | 服务端 React 生成 | 复用 DOM 并恢复 React 交互 |

- 共同点: 两者都需要浏览器执行客户端 React；hydrateRoot 只是让内容在 JS 到达前已可见;
- 用词边界: 水合不是把 JS 字符串注入 HTML，而是客户端 React 对服务端 DOM 建立运行时关系;

## App 中的网络请求会在哪里执行？

| 请求位置                           | 执行环境                             |
| ---------------------------------- | ------------------------------------ |
| 服务端 handler 或 loader           | 服务端                               |
| 组件渲染函数中直接发起             | 服务端与客户端均可能，且可重复；避免 |
| useEffect                          | 仅客户端                             |
| onClick 等事件处理器               | 仅水合后的客户端                     |
| Suspense 数据层或 Server Component | 由框架契约决定                       |

- 首屏数据: 通常由服务端请求并安全序列化给客户端，确保水合的首次 props 与服务端一致;
- 交互数据: 用户操作后的请求放在事件或合适的 Action；不在普通渲染函数中制造网络副作用;
