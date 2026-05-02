---
name: connectrpc-full-flow
description: ConnectRPC 全栈开发流程。Go 后端 + TypeScript 前端 + Proto IDL，从代码生成到接口实现、前端调用的完整工具链。当用户提到 ConnectRPC、proto、IDL、前后端类型安全、RPC、buf generate、connectrpc-gen、跨语言接口生成 时触发。
---

# ConnectRPC 全栈开发流程

## 架构概述

```
.proto 文件 (IDL 唯一真实源)
    │
    ├──► Go 后端 —— 生成服务端桩代码 → 实现接口
    │
    └──► TypeScript 前端 —— 生成客户端代码 → import 直接调用
```

前后端通过同一个 proto 文件各自生成代码，编译时保证类型安全。

## 前置依赖

**Go 后端：**
- Go 1.23+，确保 `$HOME/go/bin` 在 PATH 中（`go install` 的工具安装至此）
- `generate.sh` 脚本首次运行会自动安装 protoc 插件和 buf：
  - `protoc-gen-go` (`google.golang.org/protobuf/cmd/protoc-gen-go`)
  - `protoc-gen-connect-go` (`connectrpc.com/connect/cmd/protoc-gen-connect-go`)
  - `buf` (`github.com/bufbuild/buf/cmd/buf`)

**TypeScript 前端：**
- Node.js 22+、pnpm（或其他包管理器）
- `@connectrpc/connect-query`、`@connectrpc/connect-web`、`@bufbuild/protobuf`（运行时依赖）
- 代码生成依赖（`@bufbuild/buf`、`@bufbuild/protoc-gen-es`、`@connectrpc/protoc-gen-connect-query`）应封装在生成 CLI 中，前端无需直接安装

## 包管理器检测

前端项目可能使用不同的包管理器，通过根目录锁文件判断：

| 锁文件 | 包管理器 | 命令 |
|--------|---------|------|
| `pnpm-lock.yaml` | pnpm | `pnpm` |
| `package-lock.json` | npm | `npm` |
| `yarn.lock` | yarn | `yarn` |
| `bun.lockb` 或 `bun.lock` | bun | `bun` |

**操作时始终使用检测到的包管理器**，例如 `npm run gen:api` 应替换为 `<pm> run gen:api`。安装依赖也用对应命令：`npm install` / `pnpm install` / `yarn install` / `bun install`。

如果用了 monorepo 统一工具（如 vp），优先使用该工具。

## 项目结构（概念模型）

```
<repo-root>/
├── connectrpc.config.json              # 后端项目名 → 相对路径映射
├── <backend-dir>/                      # Go 后端项目
│   ├── proto/<domain>/v1/<service>.proto  # IDL 定义
│   ├── gen/                            # Go 生成代码（只读，由 generate.sh 产出）
│   ├── internal/service/               # 业务实现（唯一手写代码的地方）
│   ├── main.go                         # 入口 + 服务注册
│   └── generate.sh                     # 代码生成脚本（自动安装工具 + buf generate）
├── <frontend-dir>/                     # TypeScript 前端项目
│   └── src/
│       ├── api/
│       │   ├── client.ts               # ConnectRPC transport 配置
│       │   └── gen/<backend-name>/     # TS 生成代码（只读，由 gen:api 产出）
│       ├── hooks/                      # 业务 hook（调用生成的方法）
│       └── app.tsx                     # TransportProvider 包裹根组件
└── packages/connectrpc-gen/            # 前端代码生成 CLI（可选，推荐）
    ├── src/index.ts
    └── package.json
```

**目录名和嵌套层级不固定**，以上只是推荐结构。关键概念是：
- `proto/`：接口定义的唯一真实源
- `gen/`：自动生成产物，只读
- `internal/service/`：手写业务逻辑

## 新增后端项目

**1. 创建 Go 项目结构：**
```
<project>/
├── proto/<service>/v1/<service>.proto
├── internal/service/
├── main.go
├── go.mod
└── generate.sh
```

**2. 注册到配置：**
根目录 `connectrpc.config.json`（如果用了 CLI）：
```json
{
  "projects": {
    "<project-name>": "<project-path>"
  }
}
```

如果不用 CLI，前后端也可以各自独立运行 buf，无需这个配置文件。

**3. 前端生成接口：**
```bash
cd <frontend-dir>
<pm> run gen:api    # → connectrpc-gen <project-name>
# 或直接：buf generate --template buf.gen.ts.yaml
```

## 代码生成

### 后端（Go）

**buf 配置**（`buf.yaml` + `buf.gen.yaml` 或通过 `generate.sh`）：

`buf.yaml` 声明 proto 模块：
```yaml
version: v2
modules:
  - path: proto
```

`buf.gen.yaml` 配置 Go 生成：
```yaml
version: v2
plugins:
  - local: protoc-gen-go
    out: gen
    opt: [paths=source_relative]
  - local: protoc-gen-connect-go
    out: gen
    opt: [paths=source_relative]
```

`generate.sh` 示例：
```bash
#!/bin/bash
set -e
export PATH="$HOME/go/bin:$PATH"

install_if_missing() {
  if ! command -v "$1" &>/dev/null; then
    go install "$2@latest"
  fi
}
install_if_missing protoc-gen-go google.golang.org/protobuf/cmd/protoc-gen-go
install_if_missing protoc-gen-connect-go connectrpc.com/connect/cmd/protoc-gen-connect-go
install_if_missing buf github.com/bufbuild/buf/cmd/buf

buf generate
```

运行：
```bash
./generate.sh
```

产物：`gen/<package>/<version>/<service>.pb.go` + `<service>connect/<service>.connect.go`

### 前端（TypeScript）

buf 生成配置（动态生成或固定文件）：

```yaml
version: v2
plugins:
  - local: protoc-gen-es
    out: <output-dir>
    opt: [target=ts, import_extension=.js]
  - local: protoc-gen-connect-query
    out: <output-dir>
    opt: [target=ts, import_extension=.js]
```

 运行：
```bash
cd <frontend-dir>
<pm> run gen:api        # 如用了 CLI
# 或：buf generate --template buf.gen.ts.yaml
```

产物：`<output-dir>/<service>_pb.ts` + `<service>-<Service>_connectquery.ts`

**生成代码是只读的**，永远不要手动编辑。修改接口 → 改 proto → 重新生成。

## 后端开发

proto 修改后重新生成，然后在 `internal/service/` 中实现接口。

**proto 示例：**
```protobuf
syntax = "proto3";
package posts.v1;
option go_package = "<module>/gen/posts/v1;postsv1";

service PostsService {
  rpc GetPosts(GetPostsRequest) returns (GetPostsResponse);
}

message Post {
  int32 user_id = 1;
  int32 id = 2;
  string title = 3;
  string body = 4;
}
message GetPostsRequest {}
message GetPostsResponse { repeated Post posts = 1; }
```

**服务实现：**
```go
package service

import (
    "connectrpc.com/connect"
    postsv1 "<module>/gen/posts/v1"
    "<module>/gen/posts/v1/postsv1connect"
)

type PostsService struct{}

// 编译期保证实现了接口
var _ postsv1connect.PostsServiceHandler = (*PostsService)(nil)

func (s *PostsService) GetPosts(
    ctx context.Context,
    req *connect.Request[postsv1.GetPostsRequest],
) (*connect.Response[postsv1.GetPostsResponse], error) {
    return connect.NewResponse(&postsv1.GetPostsResponse{...}), nil
}
```

**main.go 注册：**
```go
mux := http.NewServeMux()
mux.Handle(postsv1connect.NewPostsServiceHandler(&service.PostsService{}))
http.ListenAndServe(":8080", corsMiddleware(mux))
```

注意添加 CORS 中间件以允许前端跨域请求。

## 前端使用

**Transport 配置**（`api/client.ts`）：
```ts
import { createConnectTransport } from "@connectrpc/connect-web";

export const transport = createConnectTransport({
  baseUrl: "http://localhost:8080",
});
```

**根组件包裹 TransportProvider**（`app.tsx`）：
```tsx
import { TransportProvider } from "@connectrpc/connect-query";
import { transport } from "./api/client";

<TransportProvider transport={transport}>
  <QueryClientProvider client={queryClient}>
    <RouterProvider router={router} />
  </QueryClientProvider>
</TransportProvider>
```

**业务 hook 使用生成方法：**
```ts
import { useQuery } from "@connectrpc/connect-query";
import { getPosts } from "../api/gen/<backend-name>/posts/v1/posts-PostsService_connectquery.js";
import type { Post } from "../api/gen/<backend-name>/posts/v1/posts_pb.js";

export const usePosts = () => {
  const { data, ...rest } = useQuery(getPosts);
  return { ...rest, data: data?.posts };
};
```

`useQuery` 返回标准 TanStack Query 的 `UseQueryResult`，包含 `data`、`isLoading`、`isError` 等字段。

## 完整开发工作流

```
1. 修改 proto          <backend>/proto/**/*.proto
2. 生成后端代码         cd <backend> && ./generate.sh
3. 实现/修改接口        internal/service/
4. 生成前端代码         cd <frontend> && <pm> run gen:api
5. 更新前端 hook        hooks/ 目录
6. 重启服务验证         go run . （后端） + <pm> run dev（前端）
```

## 关键原则

- **proto 是唯一真实源**，接口只在这里定义，gen/ 由它派生
- **gen/ 永远只读**，由 generate.sh / gen:api 重新生成，禁止手动编辑
- **internal/service/ 是后端唯一手写代码的地方**
- **前端 import 生成代码时**，编译期即保证类型安全——proto 改了前端编译会报错
- **buf 的 URL 模式**为 `/package.Service/Method`，由 proto 的 package + service + rpc 三段自动拼接，无需手写路由

## 相关包

| 用途 | Go 包 | npm 包 |
|------|-------|--------|
| RPC 框架 | `connectrpc.com/connect` | `@connectrpc/connect` |
| HTTP 传输 | — | `@connectrpc/connect-web` |
| TanStack Query 集成 | — | `@connectrpc/connect-query` |
| Protobuf 运行时 | `google.golang.org/protobuf` | `@bufbuild/protobuf` |
| 代码生成 | `protoc-gen-go` + `protoc-gen-connect-go` | `protoc-gen-es` + `protoc-gen-connect-query` |
| CLI | `buf`（`go install`） | `@bufbuild/buf`（npm） |
