---
id: e057f5b5-377c-4f83-b042-e2720038d099
---

# 服务端 HTML 渲染

## 如何选择适合运行环境的流式 API？

- Node.js 流: renderToPipeableStream 返回 pipe 与 abort，外壳就绪后可连接 HTTP 响应;
- Web Streams: await renderToReadableStream 得到可用于 Response 的流，适合支持 Web Streams 的运行环境;
- Suspense: 就绪内容先输出，等待中的边界稍后补充，使整页不必等最慢数据全部完成;

```jsx
import { renderToPipeableStream } from "react-dom/server";

function handleRequest(response) {
  let didError = false;
  const { pipe } = renderToPipeableStream(<App />, {
    bootstrapScripts: ["/client.js"],
    onShellReady() {
      response.statusCode = didError ? 500 : 200;
      response.setHeader("Content-Type", "text/html");
      pipe(response);
    },
    onShellError() {
      response.statusCode = 500;
      response.end("页面暂时不可用");
    },
    onError(error) {
      didError = true;
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
      bootstrapScripts: ["/client.js"],
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

## 流开始前后怎样处理失败与超时？

- 外壳失败: 最外层必要内容无法生成时返回后备响应，尚未发送响应头时可以设置错误状态码;
- 边界内失败: 已流出的外壳可保留 Suspense fallback，客户端尝试恢复；onError 用于记录，不能简单等同整页失败;
- 响应已发送: HTTP 状态码不能在已发送响应头后随意改变，应在 shell 阶段确定策略;
- 取消工作: Node 使用 abort，Web 使用 AbortSignal；中止未完成渲染后可让客户端接手剩余边界;

## 什么时候需要等待全部内容或同步字符串？

- 完整输出: 爬虫或静态生成需要全量内容时，Node 可等待 onAllReady，Web 可等待 stream.allReady;
- renderToString: 同步返回 HTML，可水合，但不等待挂起数据，也不提供渐进流式输出;
- renderToStaticMarkup: 输出不用于 React 水合的静态 HTML，适合邮件等场景，与可水合的静态预渲染不能混淆;

## 如何继续先前推迟的渲染？

- 恢复输入: resume 或 resumeToPipeableStream 接收同一应用树与 prerender 得到的 postponed 数据，分别返回 Web 或 Node 流形态;
- 保持一致: 恢复过程要与先前树和数据对应，postponed 是不透明状态，不自行编辑内部结构;
- 配置协调: bootstrap、identifierPrefix、资源提示和错误回调应与客户端入口及部署环境一致;
