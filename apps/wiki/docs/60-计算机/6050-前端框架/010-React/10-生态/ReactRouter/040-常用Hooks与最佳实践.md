---
id: 792798de-9e3d-4166-bbfa-03c92f49e785
---

# React Router 常用 Hooks 与最佳实践

## useLocation 返回哪些信息?

- 获取当前 location 对象;
- 包含 `pathname`, `search`, `hash`, `state`;

```jsx
import { useLocation } from "react-router";

function App() {
  const location = useLocation();
  // location.pathname
}
```

## matchRoutes 的用途是什么?

- 根据当前 URL 匹配路由元数据;
- 可用于路由守卫、权限判断、SEO;

```jsx
import { matchRoutes } from "react-router";

const matches = matchRoutes(routes, location);
```

## React Router 的路由守卫如何实现?

- 用组件包裹 children, 在渲染时根据用户状态决定渲染或跳转;

```jsx
function RequireAuth({ children }) {
  const location = useLocation();
  const user = useUser();

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return children;
}
```

## React Router 的最佳实践有哪些?

- 路由表集中管理;
- 权限逻辑抽成守卫组件;
- 页面组件保持与路由解耦;
- 懒加载页面配合 Suspense;
