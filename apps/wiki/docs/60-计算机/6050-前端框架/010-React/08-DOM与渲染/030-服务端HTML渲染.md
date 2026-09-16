---
id: e057f5b5-377c-4f83-b042-e2720038d099
---

# 服务端 HTML 渲染

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

## 客户端水合的流程是什么？

```jsx
// client.jsx 构建为 /client.js
import { hydrateRoot } from "react-dom/client";
import App from "./App.js";

hydrateRoot(document, <App />);
```

```text
浏览器导航到 /
→ 服务端调用 handleWebRequest
→ 流式返回 App HTML 与 /client.js 标签
→ 浏览器显示 HTML，下载 client.js
→ hydrateRoot 复用 DOM 并恢复交互
```
