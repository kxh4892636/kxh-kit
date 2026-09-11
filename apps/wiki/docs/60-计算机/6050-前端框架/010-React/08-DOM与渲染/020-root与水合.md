---
id: e9ad6f56-0a75-467b-a344-bc6af857bb53
---

# 客户端 root 与水合

## 如何启动一个没有服务端 React HTML 的根？

- createRoot: 在浏览器容器中创建 React root，再用 root.render 显示 React 节点；首次渲染会接管并清理容器内现有内容;
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
- 非同步保证: render 后的下一行不保证 Effect 已执行，需要测试同步时使用 act，特殊 DOM 集成评估 flushSync;
- 卸载: root.unmount 清理组件、Effect 和事件处理；同一个已卸载 root 不能再次 render，需要新建 root;

## 如何让已有服务端 HTML 变得可交互？

- hydrateRoot: 对服务端已生成的 React HTML 进行水合，连接事件与组件逻辑，保留已有 DOM 而非重建;
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

## 如何定位水合错误而不是隐藏症状？

- 先核对初值: 序列化相同数据、统一 ID 前缀并检查根节点多余空白，无法避免的单层文本差异才考虑 suppressHydrationWarning;
- 错误回调: onCaughtError 记录已被边界处理的错误，onUncaughtError 记录未捕获错误，onRecoverableError 记录 React 能恢复的问题;
- 回调职责: 错误记录不自动替代用户界面恢复，后备 UI 仍由适当边界负责;
