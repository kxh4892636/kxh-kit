---
id: 792798de-9e3d-4166-bbfa-03c92f49e785
---

# React Router 常用 Hooks 与最佳实践

useLocation / matchRoutes 怎么用？如何实现路由守卫？

## useLocation

- 获取当前 location 对象;
- 包含 `pathname`, `search`, `hash`, `state`;

```jsx
import { useLocation } from "react-router";

function App() {
  const location = useLocation();
  // location.pathname
}
```

## matchRoutes

- 根据当前 URL 匹配路由元数据;
- 可用于路由守卫、权限判断、SEO;

```jsx
import { matchRoutes } from "react-router";

const matches = matchRoutes(routes, location);
```

## 路由守卫

- 用组件包裹 children;
- 在 `useLayoutEffect` 中根据 `location.pathname` 执行校验;

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

## 最佳实践

- 路由表集中管理;
- 权限逻辑抽成守卫组件;
- 页面组件保持与路由解耦;
- 懒加载页面配合 Suspense;
