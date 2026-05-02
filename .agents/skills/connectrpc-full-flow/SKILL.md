---
name: connectrpc-full-flow
description: ConnectRPC 全栈开发流程。涵盖 Go 后端 + TypeScript 前端 + Proto IDL 的完整工具链：环境配置、安装、项目结构、代码生成、接口实现、前端调用、开发工作流。当用户提到 ConnectRPC、proto、IDL、前后端类型安全、RPC、buf generate、connectrpc-gen、跨语言接口生成时触发。
---

# ConnectRPC 全栈开发流程

## 架构

```
.proto (IDL 唯一真实源)
  ├──► Go 后端  → generate.sh → gen/ → internal/ 实现
  └──► TS 前端  → <pm> gen:api → src/api/gen/ → import 调用
```

前后端同一 proto 编译时保证类型安全。

## 前置依赖

**Go：** 1.23+，`$HOME/go/bin` 在 PATH。generate.sh 首次运行自动安装 `protoc-gen-go`、`protoc-gen-connect-go`、`buf`。

**TS：** Node.js 22+。运行时依赖 `@connectrpc/connect-query`、`@connectrpc/connect-web`、`@bufbuild/protobuf`。生成依赖（buf、protoc-gen-es、protoc-gen-connect-query）封装在生成 CLI 中。

**包管理器：** 根据根目录锁文件判断（`pnpm-lock.yaml`→pnpm, `package-lock.json`→npm, `yarn.lock`→yarn, `bun.lockb`→bun），用 `<pm>` 指代。有 monorepo 统一工具（如 vp）则优先。

## 项目结构

```
<repo-root>/
├── connectrpc.config.json           # 后端名→路径映射
├── <backend>/
│   ├── proto/<domain>/v1/<svc>.proto # IDL
│   ├── gen/                         # 生成代码（只读）
│   ├── internal/service/            # 业务实现（写代码处）
│   ├── main.go
│   └── generate.sh                  # 自动安装工具+buf generate
├── <frontend>/
│   └── src/
│       ├── api/client.ts            # Transport 配置
│       ├── api/gen/<backend-name>/  # TS 生成代码（只读）
│       ├── hooks/                   # 业务 hook
│       └── app.tsx                  # TransportProvider
└── packages/connectrpc-gen/         # 前端生成 CLI
```

目录名不固定，核心概念：proto=源、gen=只读产物、internal=手写逻辑。

## 新增后端项目

1. 创建 `proto/<svc>/v1/<svc>.proto`、`internal/service/`、`main.go`、`go.mod`、`generate.sh`
2. 注册到 `connectrpc.config.json`：`{"projects":{"<name>":"<path>"}}`
3. 前端生成：`<pm> run gen:api`

## 代码生成

### Go 后端

`buf.yaml`：
```yaml
version: v2
modules:
  - path: proto
```

`buf.gen.yaml`：
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

`generate.sh`：
```bash
#!/bin/bash
set -e
export PATH="$HOME/go/bin:$PATH"
install_if_missing() { command -v "$1" &>/dev/null || go install "$2@latest"; }
install_if_missing protoc-gen-go google.golang.org/protobuf/cmd/protoc-gen-go
install_if_missing protoc-gen-connect-go connectrpc.com/connect/cmd/protoc-gen-connect-go
install_if_missing buf github.com/bufbuild/buf/cmd/buf
buf generate
```

产物：`gen/<pkg>/<ver>/<svc>.pb.go` + `<svc>connect/<svc>.connect.go`

### TS 前端

buf 生成配置（CLI 动态或固定文件）：
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

运行：`cd <frontend> && <pm> run gen:api`，或直接 `buf generate --template buf.gen.ts.yaml`

产物：`<svc>_pb.ts` + `<svc>-<Service>_connectquery.ts`

**gen/ 只读**，改接口→改 proto→重新生成。

## 后端开发

proto：
```protobuf
syntax = "proto3";
package posts.v1;
option go_package = "<module>/gen/posts/v1;postsv1";

service PostsService { rpc GetPosts(GetPostsRequest) returns (GetPostsResponse); }
message Post { int32 user_id = 1; int32 id = 2; string title = 3; string body = 4; }
message GetPostsRequest {}
message GetPostsResponse { repeated Post posts = 1; }
```

实现：
```go
var _ postsv1connect.PostsServiceHandler = (*PostsService)(nil)

func (s *PostsService) GetPosts(ctx context.Context, req *connect.Request[postsv1.GetPostsRequest]) (*connect.Response[postsv1.GetPostsResponse], error) {
    return connect.NewResponse(&postsv1.GetPostsResponse{Posts: mockPosts}), nil
}
```

注册：`mux.Handle(postsv1connect.NewPostsServiceHandler(&service.PostsService{}))`，监听 `:8080`，加 CORS 中间件。

## 前端使用

Transport（`api/client.ts`）：`createConnectTransport({ baseUrl: "http://localhost:8080" })`

根组件包裹 `<TransportProvider transport={transport}>`。

业务 hook：
```ts
import { useQuery } from "@connectrpc/connect-query";
import { getPosts } from "../api/gen/<backend>/posts/v1/posts-PostsService_connectquery.js";

export const usePosts = () => {
  const { data, ...rest } = useQuery(getPosts);
  return { ...rest, data: data?.posts };
};
```

`useQuery` 返回 TanStack Query 的 `UseQueryResult`（`data`、`isLoading`、`isError` 等）。

## 开发工作流

```
改 proto → ./generate.sh → 改 internal/service/ → <pm> gen:api → 改 hooks/ → go run . / <pm> run dev
```

## 关键原则

- proto 是唯一真实源，gen/ 永远只读，改接口必须改 proto 后重新生成
- internal/service/ 是后端唯一手写代码处
- 前端 import 生成代码即编译期类型安全：proto 变→前端编译报错
- buf URL 模式 `/package.Service/Method`，由 proto 三要素自动拼接

## 相关包

| 用途 | Go | npm |
|------|----|-----|
| RPC | `connectrpc.com/connect` | `@connectrpc/connect` |
| HTTP | — | `@connectrpc/connect-web` |
| Query | — | `@connectrpc/connect-query` |
| Proto | `google.golang.org/protobuf` | `@bufbuild/protobuf` |
| 代码生成 | `protoc-gen-go/connect-go` | `protoc-gen-es/connect-query` |
| CLI | `go install .../buf` | `@bufbuild/buf` |
