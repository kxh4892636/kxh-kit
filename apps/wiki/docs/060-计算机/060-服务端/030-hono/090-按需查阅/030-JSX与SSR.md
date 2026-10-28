---
id: 5f6e7d8c-9b0a-4c1d-8e2f-3a4b5c6d7e8f
anki: true
---

# JSX 与 SSR

## 输出 HTML 用模板还是 JSX？

- 少量页面、邮件模板: 用 `hono/html` 的 `html` 模板字符串，插值自动转义，`raw()` 才关闭;
- 有组件、props、类型检查: 用 `hono/jsx`；纯 JSON API 不引入渲染层;

```ts
app.get("/:name", (c) => c.html(html`<h1>Hello! ${c.req.param("name")}</h1>`));

const Layout = (props: { title: string; children: any }) => html`
  <html>
    <head>
      <title>${props.title}</title>
    </head>
    <body>
      ${props.children}
    </body>
  </html>
`;
```

## hono/jsx 要改哪几处配置？

```json title="tsconfig.json"
{ "compilerOptions": { "jsx": "react-jsx", "jsxImportSource": "hono/jsx" } }
```

- 文件改 `.tsx`，`dev` 脚本入口同步改；不想动 tsconfig 就用 `/** @jsxImportSource hono/jsx */` 文件级注释;
- 组件: `FC` 定义组件、`PropsWithChildren` 带 `children`、`<>...</>` 当 Fragment；原始 HTML 用 `dangerouslySetInnerHTML`;
- 样式: `hono/css` 的 `css` 标签生成类名并在 SSR 时收集；项目已有 Tailwind/CSS Modules 就不必引入;

## 布局、上下文与错误页怎么组织？

```tsx
app.use(
  "/page/*",
  jsxRenderer(({ children }) => (
    <html>
      <body>{children}</body>
    </html>
  )),
);
app.get("/page/a", (c) => c.render(<p>content</p>)); // 整页由布局拼好

const User = () => {
  const c = useRequestContext();
  return <span>{c.get("userName")}</span>;
};
```

- `jsxRenderer` 是 `c.setRenderer()` 的语法糖；布局只挂页面路径，不影响 JSON 接口;
- 深层组件用 `useRequestContext()` 取 `Context`，数据仍由 Handler 或中间件放进 `c.var`;
- 布局参数: 模块增强 `ContextRenderer` 后 `c.render(content, { title })`；`<title>`/`<meta>` 会自动提升到 `<head>`，布局与页面别重复写;
- 错误分流: `onError` 里按 `Accept` 返回 HTML 或 JSON，生产不要把堆栈渲染进页面;
- 水合: 服务端 `renderToString`（`hono/jsx/dom/server`）+ 浏览器 `hydrateRoot`（`hono/jsx/dom/client`）；需要客户端路由与状态管理就改用真正的 SSR 框架;
