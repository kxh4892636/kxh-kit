---
id: e057f5b5-377c-4f83-b042-e2720038d099
---

# 服务端 HTML 渲染

## SSR 从哪一个请求开始？

- 页面导航: 用户访问 `https://example.com/` 时，浏览器自动发送 `GET /`；`/` 是页面 URL 的路径，不是 React 额外发起的数据请求;
- 路由匹配: Express 等服务端通过 `server.get("/", handler)` 接收请求，准备首屏数据并渲染 React 树;
- 响应边界: 服务端返回的不只是某个组件片段，而是浏览器能解析的 HTML 文档或 HTML 流;

```text
访问 https://example.com/
→ 浏览器发送 GET /
→ 服务端路由匹配 /
→ 获取数据并渲染 React
→ 返回 HTML 响应
```

## 服务端返回的 HTML 包含什么？

- 首屏内容: root 容器里已有 React 生成的标题、列表等 DOM 内容，不是 CSR 常见的空容器;
- 资源引用: HTML 仍通过 link 和 script 引用 CSS、客户端 JS 等资源；React 的 `bootstrapScripts` 或 `bootstrapModules` 可以生成客户端入口标签;
- 初始数据: 客户端首次渲染依赖的数据需与 HTML 一起传递，由框架的序列化机制或经安全转义的 JSON 完成;

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <link rel="stylesheet" href="/assets/app.css" />
  </head>
  <body>
    <div id="root"><button>Hello SSR</button></div>
    <script type="module" src="/assets/client.js"></script>
  </body>
</html>
```

- index.html: SSR 不必依赖可直接部署的静态 `index.html`；HTML 可由请求 handler 动态生成，也可以从模板读取后注入渲染结果;

## 浏览器如何从 HTML 过渡到可交互的 React？

```text
接收 HTML 字节
→ 边解析边建立 DOM，发现并请求 CSS 与 client.js
→ DOM 与 CSSOM 满足绘制条件后，首屏内容可见
→ 执行 client.js
→ hydrateRoot 接管现有 DOM，页面可交互
```

- 不等全部资源: 浏览器可在图片等资源未全部完成时展示已解析内容；SSR 的优势是主要 HTML 不必等客户端 React 生成;
- 可见不等于可交互: `client.js` 和水合尚未完成时，按钮可能已显示但事件尚未接管;
- 水合边界: DOM 复用、事件恢复与首次内容一致性见 [客户端 root 与水合](./020-root与水合.md);

```jsx
// client.jsx 构建为 /assets/client.js
import { hydrateRoot } from "react-dom/client";
import App from "./App.js";

hydrateRoot(document.getElementById("root"), <App />);
```

- 入口定位: `client.jsx` 由构建工具输出为浏览器请求的脚本，`hydrateRoot` 因此在浏览器执行，不在 `server.get` 中执行;

## SSR 与 CSR 的本质差异是什么？

| 阶段      | CSR                       | SSR                               |
| --------- | ------------------------- | --------------------------------- |
| 首次 HTML | 通常是空 root 与资源引用  | 已包含服务端生成的主要页面内容    |
| 客户端 JS | `createRoot` 生成主要 DOM | `hydrateRoot` 复用 DOM 并恢复交互 |
| 后续更新  | React 在客户端更新        | 水合后同样由 React 在客户端更新   |

- 速度边界: SSR 通常提前首次内容呈现，但服务端取数、渲染与网络会影响 TTFB，水合仍需下载和执行 JS;
- 流式价值: 流式 SSR 可先发送外壳和已就绪内容，Suspense 边界完成后再补发，不必等整棵树全部就绪;

## 如何选择适合运行环境的流式 API？

- Node.js 流: renderToPipeableStream 立即返回 pipe 与 abort，但 HTML 仍异步产生，外壳就绪后才连接 HTTP 响应;
- Web Streams: await renderToReadableStream 得到可用于 Response 的流，适合支持 Web Streams 的运行环境;
- Suspense: 外壳与已就绪内容先输出，挂起边界先输出 fallback，真实内容就绪后再补充;

```jsx
import { renderToPipeableStream } from "react-dom/server";

function handleRequest(response) {
  const { pipe } = renderToPipeableStream(<App />, {
    bootstrapScripts: ["/client.js"],
    onShellReady() {
      response.statusCode = 200;
      response.setHeader("Content-Type", "text/html");
      pipe(response);
    },
    onShellError() {
      response.statusCode = 500;
      response.end("页面暂时不可用");
    },
    onError(error) {
      console.error(error);
    },
  });
}
```

```jsx
import { renderToReadableStream } from "react-dom/server";

async function handleWebRequest(request) {
  try {
    const stream = await renderToReadableStream(<App />, {
      bootstrapModules: ["/client.js"],
      signal: request.signal,
    });
    return new Response(stream, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch {
    return new Response("页面暂时不可用", { status: 500 });
  }
}
```
