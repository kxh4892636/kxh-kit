---
id: 46d45d9d-ae43-4060-a470-97ea34b9674e
---

# Suspense

## Suspense 在什么情况下显示 fallback？

- 挂起边界: 后代渲染读取尚未就绪的受支持资源时，最近边界暂时显示 fallback，资源就绪后重试内容;
- 支持来源: lazy 组件代码、通过 use 读取的缓存 Promise，以及支持 Suspense 的框架数据集成;
- 非自动检测: Effect 或点击处理器里发起的普通 fetch 不会自动触发 Suspense，需要自己的加载状态或合适的数据层;

```jsx
import { Suspense } from "react";

const page = (
  <Suspense fallback={<p>加载页面……</p>}>
    <Profile />
    <Suspense fallback={<p>加载专辑……</p>}>
      <Albums />
    </Suspense>
  </Suspense>
);
```

## 如何选择一起显示还是逐步显示？

- 同一边界: 其直接受控的内容作为整体显示，内部某部分等待会让该边界显示 fallback;
- 嵌套边界: 外层内容就绪后可先展示，内层继续等待，边界应对应产品希望看到的加载节奏;
- 不按文件机械拆分: 每个组件都包一层会造成碎片化占位与跳动，按用户可理解的区域划分;

## 重试与重新隐藏会怎样影响状态？

- 首次未挂载: 初次挂起的树尚未成功挂载，其状态不会被保留为已完成实例，React 在资源就绪后重新尝试;
- 已显示后挂起: 普通更新可能再次显示 fallback，已隐藏内容的布局 Effect 会清理并在重新显示时建立;
- 保留旧内容: Transition 或 useDeferredValue 可以让已有内容在等待时继续显示，具体选择见对应 Hooks;

## 切换到不同业务对象时怎样重置加载边界？

- 身份变化: 对不同用户或记录使用合适 key，让 React 知道这是新内容，避免把旧实体界面误当作可保留的同一屏;
- 加载提示: 旧内容被保留时仍应显示轻量 pending 或过期提示，让用户知道新请求尚未完成;

```jsx
function UserPage({ userId, userPromise }) {
  return (
    <Suspense key={userId} fallback={<p>正在打开用户……</p>}>
      <UserDetails userPromise={userPromise} />
    </Suspense>
  );
}

function UserDetails({ userPromise }) {
  const user = use(userPromise);
  return <h1>{user.name}</h1>;
}
```

## Suspense 如何参与服务端渲染与错误恢复？

- 流式输出: 服务端先发送可用外壳与 fallback，之后逐步补充边界内容，并支持选择性水合;
- 服务端失败: 边界内服务器渲染失败时可保留 fallback 并在客户端重试，客户端也失败才交给错误边界;
- 错误区分: Suspense 表达等待，错误边界表达失败，不用加载动画代替失败提示;
