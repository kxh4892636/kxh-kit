---
name: connectrpc-full-flow
description: ConnectRPC 全栈开发流程。涵盖 Go 后端 + TypeScript 前端 + Proto IDL 的完整工具链：环境配置、安装、项目结构、代码生成、接口实现、前端调用、开发工作流。当用户提到 ConnectRPC、proto、IDL、前后端类型安全、RPC、buf generate、connectrpc-gen、go-template、跨语言接口生成 时触发。
---

# ConnectRPC 全栈开发流程

## 架构概述

```
posts.proto (IDL 唯一真实源)
    │
    ├──► Go 后端 (go-template)
    │       ./generate.sh → gen/   → internal/ 实现接口
    │
    └──► TypeScript 前端 (react-template)
            npm run gen:api  → src/api/gen/  → import 使用
```

前后端通过同一个 proto 文件各自生成代码，编译时保证类型安全。

## 前置依赖

**Go 环境：**
```bash
# Go 1.23+，~/go/bin 在 PATH 中
echo 'export PATH="$HOME/go/bin:$PATH"' >> ~/.bashrc
```

**Node.js 环境：**
```bash
# Node.js 22+ / pnpm，通过 vp 管理
```

## 项目结构

```
kxh-awesome/
├── connectrpc.config.json              # 后端项目名 → 路径映射
├── apps/
│   ├── go-template/                    # Go 后端
│   │   ├── proto/posts/v1/posts.proto  # IDL 定义
│   │   ├── gen/                        # Go 生成代码（只读）
│   │   ├── internal/service/           # 业务实现（写代码的地方）
│   │   ├── main.go                     # 入口
│   │   └── generate.sh                 # 代码生成脚本
│   └── react-template/                 # React 前端
│       └── src/
│           ├── api/
│           │   ├── client.ts           # ConnectRPC transport
│           │   └── gen/go-template/    # TS 生成代码（只读）
│           ├── hooks/use-posts.ts      # 业务 hook
│           └── app.tsx                 # TransportProvider 包裹
└── packages/
    └── connectrpc-gen/                 # 前端代码生成 CLI
        ├── src/index.ts
        └── package.json
```

## 新增后端项目

**1. 创建 Go 项目目录：**
```
apps/<name>/
├── proto/<service>/v1/<service>.proto
├── internal/service/
├── main.go
├── go.mod
└── generate.sh
```

**2. 注册到配置：**
`connectrpc.config.json` 新增一行：
```json
{
  "projects": {
    "<name>": "apps/<name>"
  }
}
```

**3. 前端生成接口：**
```bash
cd apps/react-template
npm run gen:api     # CLI 读取配置，自动生成到 src/api/gen/<name>/
```

## 代码生成

**后端（Go）：**
```bash
cd apps/go-template
./generate.sh       # 自动安装工具 + buf generate
```
- 首次运行自动安装 `protoc-gen-go`、`protoc-gen-connect-go`、`buf`
- 产物：`gen/<package>/<version>/posts.pb.go` + `postsv1connect/posts.connect.go`
- `gen/` 是只读产物，永远不要手动编辑

**前端（TypeScript）：**
```bash
cd apps/react-template
npm run gen:api     # → connectrpc-gen <project-name>
```
- CLI 自动解析 `connectrpc.config.json`
- 产物：`src/api/gen/<project-name>/<package>/<version>/posts_pb.ts` + `posts-PostsService_connectquery.ts`
- 依赖 `@bufbuild/buf`、`@bufbuild/protoc-gen-es`、`@connectrpc/protoc-gen-connect-query`（均通过 `vp install` 自动安装）

## 后端开发

proto 修改后，重新生成 → 在 `internal/service/` 中实现接口：

```go
package service

import (
    "connectrpc.com/connect"
    postsv1 "<module>/gen/posts/v1"
    "<module>/gen/posts/v1/postsv1connect"
)

type PostsService struct{}

// 编译器保证实现了接口
var _ postsv1connect.PostsServiceHandler = (*PostsService)(nil)

func (s *PostsService) GetPosts(
    ctx context.Context,
    req *connect.Request[postsv1.GetPostsRequest],
) (*connect.Response[postsv1.GetPostsResponse], error) {
    // 业务逻辑
    return connect.NewResponse(&postsv1.GetPostsResponse{...}), nil
}
```

`main.go` 注册服务：
```go
mux := http.NewServeMux()
mux.Handle(postsv1connect.NewPostsServiceHandler(&service.PostsService{}))
```

## 前端使用

`app.tsx` 包裹 TransportProvider：
```tsx
import { TransportProvider } from "@connectrpc/connect-query";
import { transport } from "./api/client";

<TransportProvider transport={transport}>
  <QueryClientProvider client={queryClient}>
    <RouterProvider router={router} />
  </QueryClientProvider>
</TransportProvider>
```

`api/client.ts` 配置 transport：
```ts
import { createConnectTransport } from "@connectrpc/connect-web";

export const transport = createConnectTransport({
  baseUrl: "http://localhost:8080",
});
```

业务 hook 直接使用生成的方法：
```ts
import { useQuery } from "@connectrpc/connect-query";
import { getPosts } from "../api/gen/go-template/posts/v1/posts-PostsService_connectquery.js";
import type { Post } from "../api/gen/go-template/posts/v1/posts_pb.js";

export const usePosts = () => {
  const { data, ...rest } = useQuery(getPosts);
  return { ...rest, data: data?.posts };
};
```

## 完整开发工作流

```
1. 修改 proto          apps/go-template/proto/**/*.proto
2. 生成后端代码         cd apps/go-template && ./generate.sh
3. 实现/修改接口        internal/service/
4. 生成前端代码         cd apps/react-template && npm run gen:api
5. 更新前端 hook        hooks/use-*.ts
6. 重启服务验证         go run .  +  vp dev
```

**关键原则：**
- proto 是唯一真实源，只在这里定义接口
- gen/ 下的代码永远只读，由 generate.sh / gen:api 重新生成
- internal/ 是后端唯一需要写代码的地方
- 前端 import 生成代码时，编译期即保证类型安全
