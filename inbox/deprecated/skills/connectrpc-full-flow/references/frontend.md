# TypeScript 前端使用

## client 配置

`api/client.ts` — 创建 ConnectRPC 传输层：

```ts
import { createClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";
import { PostsService } from "./gen/go-template/posts/v1/posts_pb";

export const transport = createConnectTransport({
  baseUrl: "http://localhost:8080", // 后端地址
});

export const postsClient = createClient(PostsService, transport);
```

## 业务 Hook

从 client 调用 RPC 方法，用 `@tanstack/react-query` 的 hooks 封装：

```ts
import { useQuery } from "@tanstack/react-query";
import { postsClient } from "../api/client";

export const usePosts = (random = true) => {
  const query = useQuery({
    queryKey: ["posts", random],
    queryFn: () => postsClient.getPosts({ random }),
  });
  const { data, ...rest } = query;

  return {
    ...rest,
    data: data?.posts,
  };
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

| 包                        | 用途              |
| ------------------------- | ----------------- |
| `@connectrpc/connect-web` | HTTP/1.1 传输     |
| `@connectrpc/connect`     | ConnectRPC 客户端 |
| `@bufbuild/protobuf`      | Protobuf 序列化   |

代码生成工具（`@bufbuild/buf`、`@bufbuild/protoc-gen-es`、`@connectrpc/protoc-gen-connect-query`）封装在 `connectrpc-gen` CLI 中，前端无需单独安装。
