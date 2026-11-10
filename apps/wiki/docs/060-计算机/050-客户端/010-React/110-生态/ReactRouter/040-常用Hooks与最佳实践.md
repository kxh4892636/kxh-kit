---
id: 792798de-9e3d-4166-bbfa-03c92f49e785
---

# 路由位置与访问控制

## 如何读取当前页面的路由信息？

- `useLocation`: 返回 `pathname`、`search`、`hash`、`state` 与位置标识;
- 用途: 感知实际导航;
- 路径参数: 用 `useParams` 读实体 ID; 查询条件: 用 `useSearchParams`;

## 参数读取与更新语义怎么定？

- 避免: 手工拼拆 URL;
- 更新语义: 位置变化本身就是路由状态变化;
- 反例: 不用再存一份 `pathname` 然后用 Effect 同步;

```jsx
function LocationLabel() {
  const location = useLocation();
  return <p>当前位置：{location.pathname}</p>;
}
```

## matchRoutes 怎样用于独立匹配？

- 匹配结果: 根据路由配置与 location 得到匹配链, 可读取相应路径参数和路由元数据;
- 用途边界: 可以辅助面包屑、页面元信息与导航判断, 但匹配本身不会执行鉴权或加载页面数据;

```jsx
const matches = matchRoutes(routes, location);
const leaf = matches?.at(-1);
```

## 如何在界面层保护需要登录的页面？

- 访问状态: 等认证检查完成, 再决定显示内容还是跳转;
- 反例: 不要一见用户未加载就当作未登录;
- 返回位置: 可记录访问位置供登录后返回, 使用前验证它是允许的站内目标;

```jsx
function RequireAuth({ children }) {
  const location = useLocation();
  const { user, loading } = useSession();
  if (loading) return <p>检查登录状态……</p>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}
```

## 为什么前端路由守卫不能代替服务端鉴权？

- 安全边界: 客户端跳转只控制 UI, 用户仍可直接请求接口, 服务端每次操作必须验证身份与权限;
- 模式集成: 数据路由或框架可在 loader/action 里提前判断;
- 前提: 最终数据接口仍要独立授权;
- 组织方式: 路由负责位置、布局与页面入口, 业务组件收明确数据;
- 避免: 把路由状态扩散到所有底层组件;
