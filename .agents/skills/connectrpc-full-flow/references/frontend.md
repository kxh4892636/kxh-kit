# TypeScript 前端使用

## Transport 配置

`api/client.ts` — 创建 ConnectRPC 传输层：

```ts
import { createConnectTransport } from "@connectrpc/connect-web";

export const transport = createConnectTransport({
  baseUrl: "http://localhost:8080",   // 后端地址
});
```

## 根组件包装

在 `app.tsx` 或等效入口处，用 `TransportProvider` 包裹整个应用：

```tsx
import { TransportProvider } from "@connectrpc/connect-query";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { transport } from "./api/client";

const queryClient = new QueryClient();

export const App = () => (
  <TransportProvider transport={transport}>
    <QueryClientProvider client={queryClient}>
      {/* 路由或根组件 */}
    </QueryClientProvider>
  </TransportProvider>
);
```

`TransportProvider` 必须在 `QueryClientProvider` 外层。

## 业务 Hook

从生成的代码中导入方法和类型，用 `@connectrpc/connect-query` 的 hooks 调用：

```ts
import { useQuery } from "@connectrpc/connect-query";
import { getPosts } from "../api/gen/<backend-name>/<domain>/v1/<service>-<Service>_connectquery.js";
import type { Post } from "../api/gen/<backend-name>/<domain>/v1/<service>_pb.js";

export const usePosts = () => {
  const { data, ...rest } = useQuery(getPosts);
  return { ...rest, data: data?.posts };
};
```

`useQuery` 返回 TanStack Query 的 `UseQueryResult`，包含 `data`、`isLoading`、`isError` 等字段。

### 调用模式

- **Query（查询）**：`useQuery(getPosts)` — 会自动用返回值类型做类型推断
- **Mutation（变更）**：`useMutation(createPost)` — 用于 Create/Update/Delete 类 RPC

Hook 的参数是生成的 method descriptor（如 `getPosts`），不需要手动指定泛型类型。

### 返回值处理

RPC 方法返回一个 Response message（如 `GetPostsResponse { posts: Post[] }`）。如果组件直接期望 `Post[]`，在 hook 里做一层映射：`data: data?.posts`。

## 包依赖

前端需要的 npm 包（都是运行时依赖）：

| 包 | 用途 |
|---|------|
| `@connectrpc/connect` | 核心类型 |
| `@connectrpc/connect-web` | HTTP/1.1 传输 |
| `@connectrpc/connect-query` | TanStack Query 集成 |
| `@bufbuild/protobuf` | Protobuf 序列化 |

代码生成工具（`@bufbuild/buf`、`@bufbuild/protoc-gen-es`、`@connectrpc/protoc-gen-connect-query`）封装在 `connectrpc-gen` CLI 中，前端无需单独安装。
